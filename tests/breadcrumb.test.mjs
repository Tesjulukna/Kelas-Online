import test from 'node:test'
import assert from 'node:assert/strict'

test('item breadcrumb terakhir tetap dapat menjadi tautan ketika current bernilai false', async () => {
  let resolveBreadcrumbItemState

  try {
    ({ resolveBreadcrumbItemState } = await import('../src/utils/breadcrumb.js'))
  } catch {
    // RED: helper belum tersedia sebelum dukungan tautan terakhir dibuat.
  }

  assert.equal(typeof resolveBreadcrumbItemState, 'function')
  assert.deepEqual(
    resolveBreadcrumbItemState({ current: false, onClick: () => {} }, 1, 2),
    { isCurrent: false, isClickable: true },
  )
})

test('item terakhir tetap menjadi halaman aktif secara default', async () => {
  const { resolveBreadcrumbItemState } = await import('../src/utils/breadcrumb.js')

  assert.deepEqual(
    resolveBreadcrumbItemState({}, 1, 2),
    { isCurrent: true, isClickable: false },
  )
})
