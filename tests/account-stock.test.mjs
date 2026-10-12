import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import test from 'node:test'

test('stok akun: pembagian, pembayaran berulang, reservasi dan akses pembeli', (t) => {
  const php = process.env.PHP_TEST_BINARY || 'php'
  const options = process.env.PHP_TEST_EXTENSION_DIR
    ? ['-d', `extension_dir=${process.env.PHP_TEST_EXTENSION_DIR}`, '-d', 'extension=pdo_sqlite'] : []
  const probe = spawnSync(php, [...options, '-m'], { encoding: 'utf8' })
  if (probe.error?.code === 'ENOENT' || !probe.stdout?.includes('pdo_sqlite')) {
    t.skip('PHP dengan pdo_sqlite diperlukan; tetapkan PHP_TEST_BINARY untuk menjalankan pengujian.')
    return
  }
  const result = spawnSync(php, [...options, 'tests/php/account-stock.test.php'], { encoding: 'utf8' })
  assert.equal(result.status, 0, result.stderr || result.stdout)
  assert.match(result.stdout, /PASS:/)
})
