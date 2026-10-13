import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'
import vm from 'node:vm'

const source = await readFile(new URL('../integrations/google-apps-script/Code.gs', import.meta.url), 'utf8')

function harness() {
  const secret = 'test-secret-for-google-apps-script-12345'
  const rows = [
    ['id', 'username', 'password', 'status', 'order_id', 'buyer_email'],
    ['akun-2', 'two@example.test', 'secret2', 'available', '', ''],
    ['akun-1', 'one@example.test', 'secret1', 'available', '', ''],
  ]
  let opened = 0
  let writes = 0
  let released = 0
  const sheets = new Map()
  const makeSheet = (name, content, id) => ({
    getName: () => name, getType: () => 'GRID', getSheetId: () => id,
    getLastRow: () => content.length, setFrozenRows() {},
    getRange(row, column, height, width) {
      return {
        getDisplayValues: () => content.length ? content.map(value => Array.from({ length: width }, (_, index) => value[index] ?? '')) : [Array(width).fill('')],
        setNumberFormat() { return this },
        setValues(values) { writes++; content[row - 1] ||= Array(width).fill(''); content[row - 1].splice(column - 1, values[0].length, ...values[0].map(value => value.startsWith("'") ? value.slice(1) : value)); return this },
      }
    },
  })
  sheets.set('Stok Akun', makeSheet('Stok Akun', rows, 0))
  const context = vm.createContext({
    PropertiesService: { getScriptProperties: () => ({ getProperty: key => ({ WEBSITE_SHARED_SECRET: secret, ALLOWED_SPREADSHEET_IDS: 'test-spreadsheet-id' })[key] }) },
    SpreadsheetApp: { SheetType: { GRID: 'GRID' }, flush() {}, openById() {
      opened++
      return { getName: () => 'Spreadsheet', getSheets: () => [...sheets.values()], getSheetByName: title => sheets.get(title) || null,
        insertSheet(name) { const sheet = makeSheet(name, [], sheets.size); sheets.set(name, sheet); return sheet } }
    } },
    LockService: { getScriptLock: () => ({ tryLock: () => true, releaseLock() { released++ } }) },
    ContentService: { MimeType: { JSON: 'application/json' }, createTextOutput: content => ({ setMimeType: () => content }) },
  })
  vm.runInContext(source, context)
  const call = args => JSON.parse(context.doPost({ postData: { contents: JSON.stringify({
    secret, spreadsheetId: 'test-spreadsheet-id', tab: 'Stok Akun', ...args,
  }) } }))
  return { call, rows, counts: () => ({ opened, writes, released }),
    setCell(tab, row, column, value) { sheets.get(tab).getRange(row, column, 1, 1).setValues([[value]]) } }
}

test('GAS membuat tab token terpisah dan mencatat satu token per pesanan', () => {
  const bridge = harness()
  assert.equal(bridge.call({ action: 'create_tab', tab: 'Token A', kind: 'auto_account' }).ok, true)
  assert.equal(bridge.call({ action: 'create_tab', tab: 'Token B', kind: 'auto_account' }).ok, true)
  const sale = { action: 'register_token', tab: 'Token A', accountId: 'auto-1', name: 'Pembeli', token: 'ab'.repeat(32),
    orderId: 'paid-1', buyerEmail: 'buyer@example.test', createdAt: new Date().toISOString(), expiresAt: '' }
  assert.equal(bridge.call(sale).data.updated, true)
  assert.equal(bridge.call(sale).data.updated, true)
  assert.equal(bridge.call({ action: 'token_rows', tab: 'Token A' }).data.values.length, 2)
  assert.equal(bridge.call({ action: 'token_rows', tab: 'Token B' }).data.values.length, 1)
  assert.equal(bridge.call({ ...sale, token: 'cd'.repeat(32) }).code, 'SALE_CONFLICT')
  assert.equal(bridge.call({ action: 'create_tab', tab: 'Stok Akun', kind: 'auto_account' }).code, 'INVALID_TOKEN_HEADER')
})

test('validasi token terikat tab, status aktif, dan masa berlaku', () => {
  const bridge = harness()
  bridge.call({ action: 'create_tab', tab: 'Token A', kind: 'auto_account' })
  bridge.call({ action: 'create_tab', tab: 'Token B', kind: 'auto_account' })
  const sale = { action: 'register_token', tab: 'Token A', accountId: 'auto-1', name: 'Pembeli', token: 'ab'.repeat(32),
    orderId: 'paid-1', buyerEmail: 'buyer@example.test', createdAt: new Date().toISOString(), expiresAt: '' }
  bridge.call(sale)
  const result = bridge.call({ action: 'validate_token', tab: 'Token A', token: sale.token })
  assert.equal(result.data.valid, true)
  assert.equal(result.data.name, 'Pembeli')
  assert.ok(!JSON.stringify(result).includes(sale.token))
  assert.equal(bridge.call({ action: 'validate_token', tab: 'Token B', token: sale.token }).data.valid, false)
  assert.equal(bridge.call({ action: 'validate_token', tab: 'Token A', token: 'wrong' }).data.valid, false)
  bridge.setCell('Token A', 2, 4, 'disabled')
  assert.equal(bridge.call({ action: 'validate_token', tab: 'Token A', token: sale.token }).data.valid, false)
  assert.equal(bridge.call(sale).data.updated, true)
  assert.equal(bridge.call({ action: 'validate_token', tab: 'Token A', token: sale.token }).data.valid, false)
  bridge.call({ ...sale, accountId: 'expired', orderId: 'expired-order', token: 'cd'.repeat(32), expiresAt: '2000-01-01T00:00:00Z' })
  assert.equal(bridge.call({ action: 'validate_token', tab: 'Token A', token: 'cd'.repeat(32) }).data.valid, false)
})

test('GAS mendeteksi tab dan membaca stok dengan kunci koneksi', () => {
  const bridge = harness()
  const tabs = bridge.call({ action: 'tabs' })
  assert.equal(tabs.ok, true)
  assert.deepEqual(tabs.data.sheets[0].properties, { sheetId: 0, title: 'Stok Akun', sheetType: 'GRID' })
  assert.ok(!JSON.stringify(tabs).includes('secret1'))
  assert.equal(bridge.call({ action: 'rows' }).data.values[2][2], 'secret1')
})

test('GAS menolak kunci salah dan Spreadsheet di luar daftar sebelum membaca data', () => {
  const bridge = harness()
  assert.equal(bridge.call({ action: 'rows', secret: 'wrong' }).code, 'UNAUTHORIZED')
  assert.equal(bridge.call({ action: 'rows', spreadsheetId: 'another-id' }).code, 'SPREADSHEET_NOT_ALLOWED')
  assert.equal(bridge.counts().opened, 0)
})

test('GAS memperbarui akun berdasarkan ID dan mengabaikan pengulangan pesanan yang sama', () => {
  const bridge = harness()
  const sale = { action: 'mark_sold', accountId: 'akun-1', orderId: 'order-1', buyerEmail: 'buyer@example.test' }
  assert.equal(bridge.call(sale).data.updated, true)
  assert.deepEqual(bridge.rows[2], ['akun-1', 'one@example.test', 'secret1', 'sold', 'order-1', 'buyer@example.test'])
  assert.equal(bridge.rows[1][3], 'available')
  assert.equal(bridge.call(sale).data.updated, true)
  assert.equal(bridge.counts().writes, 1)
  assert.equal(bridge.call({ ...sale, orderId: 'order-2' }).code, 'SALE_CONFLICT')
  assert.equal(bridge.counts().released, 3)
})

test('GAS menolak header yang salah tanpa mengubah Sheet', () => {
  const bridge = harness()
  bridge.rows[0][0] = 'wrong'
  assert.equal(bridge.call({ action: 'rows' }).code, 'INVALID_HEADER')
  assert.equal(bridge.counts().writes, 0)
})

test('editor GAS menyimpan username/password dan status sambil mempertahankan ID', () => {
  const bridge = harness()
  const original = [...bridge.rows[2]]
  const updated = ['akun-1', 'changed@example.test', '=special-password', 'disabled', '', '']
  const result = bridge.call({ action: 'update_row', original, updated })
  assert.equal(result.ok, true)
  assert.deepEqual(bridge.rows[2], updated)
  assert.deepEqual(result.data.values[2], updated)
  assert.equal(bridge.rows[1][1], 'two@example.test')
})

test('editor GAS menolak edit lama, username duplikat, dan perubahan ID', () => {
  const bridge = harness()
  const original = [...bridge.rows[2]]
  const updated = ['akun-1', 'changed@example.test', 'pw', 'available', '', '']
  assert.equal(bridge.call({ action: 'update_row', original, updated: ['new-id', ...updated.slice(1)] }).code, 'INVALID_ROW')
  assert.equal(bridge.call({ action: 'update_row', original, updated: ['akun-1', 'two@example.test', 'pw', 'available', '', ''] }).code, 'DUPLICATE_USERNAME')
  bridge.rows[2][2] = 'changed-by-other-admin'
  assert.equal(bridge.call({ action: 'update_row', original, updated }).code, 'ROW_CHANGED')
  assert.equal(bridge.counts().writes, 0)
})

test('editor GAS tidak boleh mengaktifkan kembali akun terjual', () => {
  const bridge = harness()
  bridge.call({ action: 'mark_sold', accountId: 'akun-1', orderId: 'order-1', buyerEmail: 'buyer@example.test' })
  const original = [...bridge.rows[2]]
  assert.equal(bridge.call({ action: 'update_row', original, updated: ['akun-1', 'one@example.test', 'pw', 'available', '', ''] }).code, 'SALE_CONFLICT')
  assert.equal(bridge.counts().writes, 1)
})
