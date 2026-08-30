import assert from 'node:assert/strict'
import test from 'node:test'
import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { createServer } from 'vite'

test('section bundling memberi petunjuk geser saat tersedia lebih dari satu paket', async (t) => {
  const vite = await createServer({ appType: 'custom', logLevel: 'silent', server: { middlewareMode: true } })
  t.after(() => vite.close())
  const { default: FeaturedBundleSection } = await vite.ssrLoadModule('/src/components/FeaturedBundleSection.jsx')

  const html = renderToStaticMarkup(React.createElement(FeaturedBundleSection, {
    fixedPrograms: [
      { id: 'hemat', title: 'Paket Hemat', fixedPrice: 100000, description: 'Deskripsi paket pertama' },
      { id: 'lengkap', title: 'Paket Lengkap', fixedPrice: 200000, description: 'Deskripsi paket kedua' },
    ],
    getProgramItems: () => [],
  }))

  assert.match(html, /Geser untuk lihat paket lainnya/)
  assert.match(html, /bundle-swipe-hint/)
})

test('detail bundling mempertahankan baris baru pada deskripsi', async (t) => {
  const vite = await createServer({ appType: 'custom', logLevel: 'silent', server: { middlewareMode: true } })
  t.after(() => vite.close())
  const { default: DetailBundle } = await vite.ssrLoadModule('/src/pages/detail/DetailBundle.jsx')

  const html = renderToStaticMarkup(React.createElement(DetailBundle, {
    bundle: { id: 'hemat', title: 'Paket Hemat', description: 'Baris pertama\nBaris kedua', priceMode: 'fixed', fixedPrice: 100000 },
    onBack: () => {}, onChoose: () => {}, onCustomChoose: () => {},
  }))

  assert.match(html, /bundle-detail-description/)
  assert.match(html, /Baris pertama\nBaris kedua/)
})
