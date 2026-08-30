import assert from 'node:assert/strict'
import { access, readFile } from 'node:fs/promises'
import test from 'node:test'

test('rilis PHP menyertakan metadata gambar lengkap untuk crawler sosial', async () => {
  const releaseEntry = await readFile(new URL('../dist/index.php', import.meta.url), 'utf8')

  assert.match(releaseEntry, /property="og:image"/)
  assert.match(releaseEntry, /property="og:image:secure_url"/)
  assert.match(releaseEntry, /property="og:image:type" content=".*imageType/)
  assert.match(releaseEntry, /property="og:image:width" content=".*imageWidth/)
  assert.match(releaseEntry, /property="og:image:height" content=".*imageHeight/)
  assert.match(releaseEntry, /property="og:image:alt"/)
  assert.match(releaseEntry, /name="twitter:image:alt"/)
})

test('rilis menyediakan fallback favicon PNG dan ICO untuk crawler sosial', async () => {
  const releaseHtml = await readFile(new URL('../dist/index.html', import.meta.url), 'utf8')

  assert.match(releaseHtml, /rel="icon" type="image\/png" sizes="32x32" href="\/favicon-32\.png"/)
  assert.match(releaseHtml, /rel="shortcut icon" href="\/favicon\.ico"/)
  assert.match(releaseHtml, /rel="apple-touch-icon" sizes="180x180" href="\/apple-touch-icon\.png"/)
  await access(new URL('../dist/favicon-32.png', import.meta.url))
  await access(new URL('../dist/favicon.ico', import.meta.url))
  await access(new URL('../dist/apple-touch-icon.png', import.meta.url))
})
