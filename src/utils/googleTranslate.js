/**
 * Applies Google Translate to the current page.
 * If langCode is omitted, dispatches custom event to open the global popup.
 * If langCode is 'id', clears cookies and resets language.
 * Otherwise, sets googtrans cookie and triggers change on the Translate select element.
 */
export function applyGoogleTranslate(langCode) {
  if (typeof window === 'undefined') {
    return
  }

  // No langCode -> open language popup globally
  if (!langCode) {
    window.dispatchEvent(new CustomEvent('open-language-popup'))
    return
  }

  const cookieValue = `/id/${langCode}`
  const expireDate = new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toUTCString()

  // Helper to set cookie for current domain and root domain
  const setCookie = (value, expires) => {
    document.cookie = `googtrans=${value}; expires=${expires}; path=/;`
    document.cookie = `googtrans=${value}; expires=${expires}; path=/; domain=${window.location.hostname};`
    
    const domainParts = window.location.hostname.split('.')
    if (domainParts.length > 2) {
      const rootDomain = domainParts.slice(-2).join('.')
      document.cookie = `googtrans=${value}; expires=${expires}; path=/; domain=.${rootDomain};`
    }
  }

  if (langCode === 'id') {
    // Clear cookies
    setCookie('', 'Thu, 01 Jan 1970 00:00:00 UTC')
  } else {
    setCookie(cookieValue, expireDate)
  }

  // Instant translate if select combo is available
  const select = document.querySelector('select.goog-te-combo')
  if (select) {
    select.value = langCode
    select.dispatchEvent(new Event('change'))
    
    // Refresh page briefly to clean up React state and ensure translations are applied cleanly
    setTimeout(() => {
      window.location.reload()
    }, 150)
    return
  }

  // If select combo is not available, we trigger reload so the script loads it with the cookie
  if (typeof window.google === 'undefined' || !window.google.translate) {
    if (!document.getElementById('google-translate-script')) {
      const container = document.createElement('div')
      container.id = 'google_translate_element'
      container.style.display = 'none'
      document.body.appendChild(container)

      window.googleTranslateElementInit = () => {
        new window.google.translate.TranslateElement(
          { pageLanguage: 'id', autoDisplay: false },
          'google_translate_element'
        )
      }

      const script = document.createElement('script')
      script.id = 'google-translate-script'
      script.src = 'https://translate.google.com/translate_a/element.js?cb=googleTranslateElementInit'
      document.head.appendChild(script)
    }

    setTimeout(() => {
      window.location.reload()
    }, 300)
  } else {
    window.location.reload()
  }
}
