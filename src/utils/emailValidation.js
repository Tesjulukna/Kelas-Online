const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

const DOMAIN_SUGGESTIONS = {
  'gamil.com': 'gmail.com',
  'gmail.cim': 'gmail.com',
  'gmail.co': 'gmail.com',
  'gmail.comm': 'gmail.com',
  'gmail.con': 'gmail.com',
  'gmail.coom': 'gmail.com',
  'gmail.om': 'gmail.com',
  'gmai.com': 'gmail.com',
  'gmial.com': 'gmail.com',
  'gmil.com': 'gmail.com',
  'gnail.com': 'gmail.com',
  'hotmai.com': 'hotmail.com',
  'hotmail.cim': 'hotmail.com',
  'hotmail.con': 'hotmail.com',
  'icloud.cim': 'icloud.com',
  'icloud.con': 'icloud.com',
  'outlook.cim': 'outlook.com',
  'outlook.con': 'outlook.com',
  'yahho.com': 'yahoo.com',
  'yaho.com': 'yahoo.com',
  'yahoo.cim': 'yahoo.com',
  'yahoo.con': 'yahoo.com',
}

const TYPO_TLDS = new Set(['cim', 'comm', 'con', 'cpm', 'vom', 'xom'])

export function normalizeCheckoutEmail(value) {
  return String(value || '').trim().toLowerCase()
}

export function getCheckoutEmailWarning(value) {
  const email = normalizeCheckoutEmail(value)

  if (!email) {
    return ''
  }

  if (!EMAIL_PATTERN.test(email)) {
    return 'Format alamat email belum benar. Pastikan contoh penulisannya seperti nama@gmail.com.'
  }

  const [localPart, domain = ''] = email.split('@')
  const suggestedDomain = DOMAIN_SUGGESTIONS[domain]

  if (suggestedDomain) {
    return `Alamat email terlihat salah. Apakah maksudnya ${localPart}@${suggestedDomain}? Periksa kembali agar invoice dan akun terkirim.`
  }

  const tld = domain.split('.').pop()

  if (TYPO_TLDS.has(tld)) {
    return `Alamat email terlihat memakai ".${tld}". Pastikan domain email benar, misalnya .com, agar invoice dan akun terkirim.`
  }

  return ''
}
