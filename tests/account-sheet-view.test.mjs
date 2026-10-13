import assert from 'node:assert/strict'
import test from 'node:test'
import { accountSheetPage } from '../src/utils/accountSheetView.js'

const rows = Array.from({ length: 105 }, (_, i) => [`akun-${i}`, `user${i}@example.test`, `password${i}`, i % 2 ? 'available' : 'disabled', '', ''])

test('popup membatasi hasil menjadi 20 atau 50 akun per halaman', () => {
  assert.equal(accountSheetPage(rows, {}).rows.length, 20)
  const result = accountSheetPage(rows, {}, { pageSize: 50, page: 2 })
  assert.equal(result.pages, 3)
  assert.equal(result.rows.length, 5)
  assert.equal(result.rows[0][0], 'akun-100')
  assert.equal(accountSheetPage(rows, {}, { page: 100 }).page, 5)
})

test('filter menghormati status reservasi/penjualan di database', () => {
  const statuses = { 'akun-1': 'reserved', 'akun-3': 'external_sold' }
  assert.deepEqual(accountSheetPage(rows, statuses, { status: 'reserved' }).rows, [rows[1]])
  assert.deepEqual(accountSheetPage(rows, statuses, { status: 'sold' }).rows, [rows[3]])
  assert.equal(accountSheetPage(rows, statuses, { status: 'available' }).total, 50)
})

test('pencarian dan filter digabungkan; password bukan kolom pencarian', () => {
  assert.equal(accountSheetPage(rows, {}, { query: ' USER11@EXAMPLE.TEST ' }).rows[0][0], 'akun-11')
  assert.equal(accountSheetPage(rows, {}, { query: 'user11@', status: 'disabled' }).total, 0)
  assert.equal(accountSheetPage(rows, {}, { query: 'password11' }).total, 0)
  assert.equal(accountSheetPage(rows, {}, { query: 'tidak-ada', page: 5 }).page, 0)
})
