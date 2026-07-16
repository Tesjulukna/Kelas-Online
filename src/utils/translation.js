export const SUPPORTED_LANGUAGES = [
  { code: 'id', label: 'Bahasa Indonesia', flag: '🇮🇩' },
  { code: 'ms', label: 'Bahasa Melayu (Malaysia)', flag: '🇲🇾' },
  { code: 'en', label: 'English', flag: '🇺🇸' },
  { code: 'ar', label: 'العربية (Arabic)', flag: '🇸🇦' },
  { code: 'zh-CN', label: '中文 (Chinese)', flag: '🇨🇳' },
  { code: 'ja', label: '日本語 (Japanese)', flag: '🇯🇵' },
]

export const getSelectedLanguage = () => {
  if (typeof window === 'undefined') {
    return 'id'
  }

  const match = document.cookie.match(/googtrans=\/id\/([^;]+)/)
  if (match) {
    return match[1]
  }

  return 'id'
}

export const changeLanguage = (langCode) => {
  if (typeof window === 'undefined') {
    return
  }

  // Clear existing cookies
  document.cookie = 'googtrans=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/;'
  document.cookie = `googtrans=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/; domain=${window.location.hostname};`
  document.cookie = `googtrans=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/; domain=.${window.location.hostname};`

  if (langCode && langCode !== 'id') {
    const value = `/id/${langCode}`
    document.cookie = `googtrans=${value}; path=/;`
    document.cookie = `googtrans=${value}; path=/; domain=${window.location.hostname};`
    document.cookie = `googtrans=${value}; path=/; domain=.${window.location.hostname};`
  }

  window.location.reload()
}
