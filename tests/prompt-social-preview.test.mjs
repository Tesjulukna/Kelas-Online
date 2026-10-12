import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'
import { withPublicCodes } from '../src/utils/publicCodes.js'

test('preview prompt memuat thumbnail dan mempertahankan URL prompt', async (t) => {
  process.env.SUPABASE_URL = 'https://preview-test.supabase.co'
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-key'
  const { renderPublicDetailPage } = await import('../api-lib/supabase.js')
  const product = { id: 'prompt-example', title: 'Prompt Contoh', thumbnail: '/uploads/gambar/prompt.jpg', price: 0 }
  t.mock.method(globalThis, 'fetch', async () => new Response(JSON.stringify([product]), {
    headers: { 'Content-Type': 'application/json' },
  }))
  const code = withPublicCodes([product])[0].publicCode
  const request = { url: `/prompt/${code}`, headers: { host: 'ibnucreative.com' } }
  let html
  const response = { setHeader() {}, end(value) { html = value } }

  await renderPublicDetailPage(request, response, { type: 'prompt', code })
  assert.equal(response.statusCode, 200)
  assert.match(html, /property="og:image" content="https:\/\/ibnucreative.com\/uploads\/gambar\/prompt.jpg"/)
  assert.ok(html.includes(`property="og:url" content="https://ibnucreative.com/prompt/${code}"`))
  assert.match(html, /name="twitter:image" content="https:\/\/ibnucreative.com\/uploads\/gambar\/prompt.jpg"/)

  product.thumbnail = ''
  await renderPublicDetailPage(request, response, { type: 'prompt', code })
  assert.match(html, /property="og:image" content="https:\/\/ibnucreative.com\/og-default.png"/)
})

test('hosting meneruskan halaman prompt ke pembuat metadata', async () => {
  const config = JSON.parse(await readFile(new URL('../vercel.json', import.meta.url), 'utf8'))
  for (const source of ['/prompt/:code', '/prompt/:code/checkout']) {
    assert.equal(config.rewrites.find((rule) => rule.source === source)?.destination, '/api/public-page?type=prompt&code=:code')
  }
  const php = await readFile(new URL('../public/index.php', import.meta.url), 'utf8')
  assert.ok(php.includes("$route === 'produk' || $route === 'prompt'"))
})
