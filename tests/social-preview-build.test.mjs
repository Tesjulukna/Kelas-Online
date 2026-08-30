import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
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
