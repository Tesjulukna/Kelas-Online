const PHONE_FORMAT_PATTERN = /^\+?[0-9().\-\s]+$/

export function normalizeCheckoutPhone(value) {
  const phone = String(value || '').trim()

  if (!phone) {
    return ''
  }

  const compactPhone = phone.replace(/[().\-\s]/g, '')
  const internationalPhone = compactPhone.startsWith('00')
    ? `+${compactPhone.slice(2)}`
    : compactPhone
  const digits = internationalPhone.replace(/\D/g, '')

  return internationalPhone.startsWith('+') ? `+${digits}` : digits
}

export function getCheckoutPhoneWarning(value) {
  const phone = String(value || '').trim()

  if (!phone) {
    return ''
  }

  if (!PHONE_FORMAT_PATTERN.test(phone)) {
    return 'Format nomor HP belum benar. Gunakan angka serta tanda +, -, spasi, atau kurung.'
  }

  const normalizedPhone = normalizeCheckoutPhone(phone)
  const digits = normalizedPhone.replace(/\D/g, '')

  if (digits.length < 7 || digits.length > 15) {
    return 'Gunakan 7–15 digit. Untuk nomor luar Indonesia, awali dengan +kode negara, contoh +14155552671.'
  }

  if (normalizedPhone.startsWith('+') && !/^\+[1-9]/.test(normalizedPhone)) {
    return 'Setelah tanda +, masukkan kode negara tanpa angka 0 di depannya.'
  }

  return ''
}

export function normalizeTripayPhone(value) {
  const normalizedPhone = normalizeCheckoutPhone(value)
  const digits = normalizedPhone.replace(/\D/g, '')

  if (normalizedPhone.startsWith('+62') && digits.startsWith('628')) {
    return `0${digits.slice(2)}`
  }

  if (normalizedPhone.startsWith('+')) {
    return ''
  }

  if (digits.startsWith('628')) {
    return `0${digits.slice(2)}`
  }

  if (digits.startsWith('8')) {
    return `0${digits}`
  }

  return digits.startsWith('08') ? digits : ''
}

export function getTripayPhoneWarning(value) {
  const genericWarning = getCheckoutPhoneWarning(value)

  if (!String(value || '').trim() || genericWarning) {
    return genericWarning
  }

  if (!/^08[0-9]{8,11}$/.test(normalizeTripayPhone(value))) {
    return 'Gunakan nomor HP Indonesia aktif, contoh 081234567890 atau +6281234567890.'
  }

  return ''
}
