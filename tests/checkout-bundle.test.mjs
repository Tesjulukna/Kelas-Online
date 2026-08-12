import assert from 'node:assert/strict'
import test from 'node:test'
import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { createServer } from 'vite'

test('member yang memiliki seluruh isi bundle melihat status selesai tanpa kontrol pembayaran', async (t) => {
  const vite = await createServer({
    appType: 'custom',
    logLevel: 'silent',
    server: { middlewareMode: true },
  })
  t.after(() => vite.close())

  const { default: CheckoutBundle } = await vite.ssrLoadModule('/src/pages/detail/CheckoutBundle.jsx')
  const html = renderToStaticMarkup(React.createElement(CheckoutBundle, {
    bundle: {
      id: 'bundle-1',
      title: 'Paket Desain',
      fixedPrice: 100000,
      maximumDiscount: 0,
    },
    items: [
      {
        id: 'class-1',
        itemType: 'class',
        title: 'Kelas Desain',
        price: 150000,
      },
    ],
    checkoutCustomer: {
      isMember: true,
      allowedClassIds: ['class-1'],
      ownedProductIds: [],
    },
    paymentMethods: [{ code: 'QRIS', label: 'QRIS' }],
    onBack: () => {},
    onCheckout: async () => ({}),
  }))

  assert.match(html, /Semua isi paket sudah dimiliki/)
  assert.match(html, /Buka Dashboard/)
  assert.doesNotMatch(html, /Punya kode voucher/)
  assert.doesNotMatch(html, /Bayar Sekarang/)
})
