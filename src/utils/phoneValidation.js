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
