/**
 * Applies Google Translate to the current page.
 * If langCode is omitted, opens the language picker popup.
 * If langCode is 'id', resets to the original language.
 * Otherwise, injects the Google Translate script if needed and triggers translation.
 */
export function applyGoogleTranslate(langCode) {
  if (typeof window === 'undefined') {
    return
  }

  // No langCode → dispatch custom event so LanguagePopup can be opened by parent
  if (!langCode) {
    window.dispatchEvent(new CustomEvent('open-language-popup'))
    return
  }

  if (langCode === 'id') {
    const select = document.querySelector('select.goog-te-combo')
    if (select) {
      select.value = langCode
      select.dispatchEvent(new Event('change'))
    }
    return
  }

  if (typeof window.google === 'undefined' || !window.google.translate) {
    if (!document.getElementById('google-translate-script')) {
      const container = document.createElement('div')
      container.id = 'google_translate_element'
      container.style.display = 'none'
      document.body.appendChild(container)

      window.googleTranslateElementInit = () => {
        new window.google.translate.TranslateElement(
          { pageLanguage: 'id', autoDisplay: false },
          'google_translate_element',
        )
        window.__pendingTranslateLang = langCode
      }

      const script = document.createElement('script')
      script.id = 'google-translate-script'
      script.src = '//translate.google.com/translate_a/element.js?cb=googleTranslateElementInit'
      document.head.appendChild(script)
    } else {
      window.__pendingTranslateLang = langCode
    }

    // poll until translate widget is ready
    const interval = setInterval(() => {
      const select = document.querySelector('select.goog-te-combo')
      if (select) {
        clearInterval(interval)
        if (window.__pendingTranslateLang) {
          select.value = window.__pendingTranslateLang
          select.dispatchEvent(new Event('change'))
          window.__pendingTranslateLang = null
        }
      }
    }, 300)
    return
  }

  const select = document.querySelector('select.goog-te-combo')
  if (select) {
    select.value = langCode
    select.dispatchEvent(new Event('change'))
  }
}
