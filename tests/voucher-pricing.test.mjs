import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'
import { resolveVoucherCheckoutPricing } from '../src/lib/vouchers.js'

test('ringkasan voucher memakai subtotal server ketika item bundle milik pembeli dikeluarkan', () => {
  const pricing = resolveVoucherCheckoutPricing(200000, {
    valid: true,
    subtotal: 150000,
    discountAmount: 15000,
    finalAmount: 135000,
  })

  assert.deepEqual(pricing, {
    baseAmount: 150000,
    discountAmount: 15000,
    finalAmount: 135000,
    isAdjusted: true,
  })
})

test('ringkasan tanpa voucher tetap memakai harga lokal', () => {
  assert.deepEqual(resolveVoucherCheckoutPricing(200000, null), {
    baseAmount: 200000,
    discountAmount: 0,
    finalAmount: 200000,
    isAdjusted: false,
  })
})

test('penguncian stok mengecek ulang akses agar callback paralel tidak membuat akses ganda', async () => {
  const source = await readFile(new URL('../public/api/_commerce.php', import.meta.url), 'utf8')
  const lockStart = source.indexOf("if (!empty($args['enforceStockAtGrant']))")
  const insertStart = source.indexOf("$accessId = make_id('access')", lockStart)
  const lockedSection = source.slice(lockStart, insertStart)

  assert.ok(lockStart >= 0, 'blok enforceStockAtGrant harus tersedia')
  assert.ok(insertStart > lockStart, 'blok insert akses harus berada setelah penguncian stok')
  assert.match(lockedSection, /digital_product_access/)
  assert.ok(
    lockedSection.indexOf('digital_product_access') < lockedSection.indexOf('commerce_assert_product_stock_available'),
    'akses yang sudah dibuat transaksi paralel harus diperiksa sebelum stok habis ditolak',
  )
})

test('batas invoice voucher aktif berlaku juga saat email tamu cocok dengan akun lama', async () => {
  const source = await readFile(new URL('../public/api/_vouchers.php', import.meta.url), 'utf8')
  const rateStart = source.indexOf('$requestKey = voucher_request_key()')
  const rateEnd = source.indexOf('$snapshot = voucher_snapshot', rateStart)
  const rateSection = source.slice(rateStart, rateEnd)

  assert.ok(rateStart >= 0 && rateEnd > rateStart, 'blok pembatas invoice voucher harus tersedia')
  assert.doesNotMatch(rateSection, /context\['memberId'\]/)
  assert.match(rateSection, /status = 'reserved'/)
})

test('pencarian akses produk tamu mencocokkan email tanpa menganggap member_id kosong sebagai pemilik', async () => {
  const source = await readFile(new URL('../public/api/_commerce.php', import.meta.url), 'utf8')
  const helperStart = source.indexOf('function commerce_find_digital_product_access')
  const helperEnd = source.indexOf('function commerce_grant_digital_product_access', helperStart)
  const helperSection = source.slice(helperStart, helperEnd)

  assert.ok(helperStart >= 0 && helperEnd > helperStart, 'helper pencarian akses produk harus tersedia')
  assert.match(helperSection, /WHERE product_id = \? AND status = \? AND buyer_email = \?/)
  assert.match(helperSection, /if \(\$memberId !== '' && \$buyerEmail !== ''\)/)
})
