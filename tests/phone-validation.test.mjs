import assert from 'node:assert/strict'
import test from 'node:test'

import {
  getTripayPhoneWarning,
  normalizeTripayPhone,
} from '../src/utils/phoneValidation.js'

test('nomor Indonesia dinormalisasi ke format 08 yang diterima Tripay', () => {
  assert.equal(normalizeTripayPhone('+62 812-3456-7890'), '081234567890')
  assert.equal(normalizeTripayPhone('6281234567890'), '081234567890')
  assert.equal(normalizeTripayPhone('81234567890'), '081234567890')
  assert.equal(normalizeTripayPhone('081234567890'), '081234567890')
})

test('nomor yang tidak sesuai format Tripay ditolak sebelum checkout', () => {
  assert.equal(normalizeTripayPhone('+14155552671'), '')
  assert.match(getTripayPhoneWarning('+14155552671'), /nomor HP Indonesia/i)
  assert.match(getTripayPhoneWarning('0812345'), /nomor HP Indonesia/i)
  assert.equal(getTripayPhoneWarning('+6281234567890'), '')
})
