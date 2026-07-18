const SOURCE_LANGUAGE = 'id'
const LANGUAGE_STORAGE_KEY = 'ibnucreative.language.v1'
const TRANSLATE_CONTAINER_ID = 'google_translate_element'
const TRANSLATE_SCRIPT_ID = 'google-translate-script'
const TRANSLATE_SELECT_SELECTOR = 'select.goog-te-combo'
const TRANSLATE_READY_EVENT = 'google-translate-ready'
const COOKIE_EXPIRES_AT = () => new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toUTCString()
const COOKIE_EXPIRED_AT = 'Thu, 01 Jan 1970 00:00:00 UTC'

let pendingLanguage = ''
let pendingAttempt = 0
let pendingTimer = null
let refreshTimer = null

function normalizeLanguageCode(value) {
  const languageCode = String(value || '').trim()

  return /^[a-z]{2,3}(?:-[a-z]{2,4})?$/i.test(languageCode)
    ? languageCode
    : SOURCE_LANGUAGE
}

function readCookieLanguage() {
  const cookie = document.cookie
    .split(';')
    .map((item) => item.trim())
    .find((item) => item.startsWith('googtrans='))
  const match = cookie?.match(/^googtrans=\/[^/]+\/([^;]+)$/)

  return match ? normalizeLanguageCode(decodeURIComponent(match[1])) : ''
}

export function getGoogleTranslateLanguage() {
  if (typeof window === 'undefined') {
    return SOURCE_LANGUAGE
  }

  try {
    const storedLanguage = normalizeLanguageCode(
      window.localStorage.getItem(LANGUAGE_STORAGE_KEY),
    )

    if (storedLanguage !== SOURCE_LANGUAGE || window.localStorage.getItem(LANGUAGE_STORAGE_KEY)) {
      return storedLanguage
    }
  } catch {
    return readCookieLanguage() || SOURCE_LANGUAGE
  }

  return readCookieLanguage() || SOURCE_LANGUAGE
}

function storeLanguage(languageCode) {
  try {
    window.localStorage.setItem(LANGUAGE_STORAGE_KEY, languageCode)
  } catch {
    return
  }
}

function getCookieDomains() {
  const hostname = window.location.hostname
  const domains = ['']

  if (!hostname || hostname === 'localhost' || /^(\d{1,3}\.){3}\d{1,3}$/.test(hostname)) {
    return domains
  }

  domains.push(hostname)

  const domainParts = hostname.split('.')

  if (domainParts.length > 2) {
    domains.push(`.${domainParts.slice(-2).join('.')}`)
  }

  return [...new Set(domains)]
}

function writeTranslateCookie(value, expires) {
  const secureAttributes = window.location.protocol === 'https:'
    ? '; Secure; SameSite=Lax'
    : '; SameSite=Lax'

  getCookieDomains().forEach((domain) => {
    const domainAttribute = domain ? `; domain=${domain}` : ''
    document.cookie = `googtrans=${value}; expires=${expires}; path=/${domainAttribute}${secureAttributes}`
  })
}

function getTranslateContainer() {
  let container = document.getElementById(TRANSLATE_CONTAINER_ID)

  if (!container) {
    container = document.createElement('div')
    container.id = TRANSLATE_CONTAINER_ID
    container.style.display = 'none'
    document.body.appendChild(container)
  }

  return container
}

function initializeTranslateWidget() {
  if (!window.google?.translate?.TranslateElement) {
    return false
  }

  if (window.__ibnucreativeGoogleTranslateInitialized) {
    return true
  }

  try {
    new window.google.translate.TranslateElement(
      { pageLanguage: SOURCE_LANGUAGE, autoDisplay: false },
      TRANSLATE_CONTAINER_ID,
    )
  } catch {
    return false
  }

  window.__ibnucreativeGoogleTranslateInitialized = true
  window.dispatchEvent(new Event(TRANSLATE_READY_EVENT))

  return true
}

function ensureTranslateWidget() {
  getTranslateContainer()

  if (initializeTranslateWidget()) {
    return
  }

  if (document.getElementById(TRANSLATE_SCRIPT_ID)) {
    return
  }

  window.googleTranslateElementInit = initializeTranslateWidget

  const script = document.createElement('script')
  script.id = TRANSLATE_SCRIPT_ID
  script.src = 'https://translate.google.com/translate_a/element.js?cb=googleTranslateElementInit'
  script.async = true
  script.defer = true
  document.head.appendChild(script)
}

function applyPendingTranslation() {
  const languageCode = pendingLanguage

  if (!languageCode || languageCode === SOURCE_LANGUAGE) {
    return
  }

  const select = document.querySelector(TRANSLATE_SELECT_SELECTOR)
  const hasLanguageOption = select && Array.from(select.options).some(
    (option) => option.value === languageCode,
  )

  if (select && hasLanguageOption) {
    select.value = languageCode
    select.dispatchEvent(new Event('change', { bubbles: true }))
    document.documentElement.lang = languageCode
    pendingLanguage = ''
    pendingAttempt = 0
    pendingTimer = null
    return
  }

  ensureTranslateWidget()
  pendingAttempt += 1

  if (pendingAttempt >= 40) {
    pendingLanguage = ''
    pendingAttempt = 0
    pendingTimer = null
    return
  }

  pendingTimer = window.setTimeout(applyPendingTranslation, 250)
}

function requestTranslation(languageCode) {
  pendingLanguage = normalizeLanguageCode(languageCode)
  pendingAttempt = 0

  if (pendingTimer) {
    window.clearTimeout(pendingTimer)
  }

  applyPendingTranslation()
}

export function refreshGoogleTranslate() {
  if (typeof window === 'undefined') {
    return
  }

  const languageCode = getGoogleTranslateLanguage()

  if (languageCode !== SOURCE_LANGUAGE) {
    requestTranslation(languageCode)
  }
}

export function scheduleGoogleTranslateRefresh(delay = 450) {
  if (typeof window === 'undefined' || getGoogleTranslateLanguage() === SOURCE_LANGUAGE) {
    return undefined
  }

  if (refreshTimer) {
    window.clearTimeout(refreshTimer)
  }

  const scheduledTimer = window.setTimeout(() => {
    if (refreshTimer === scheduledTimer) {
      refreshTimer = null
    }

    refreshGoogleTranslate()
  }, delay)

  refreshTimer = scheduledTimer

  return () => {
    if (refreshTimer === scheduledTimer) {
      window.clearTimeout(scheduledTimer)
      refreshTimer = null
    }
  }
}

export function applyGoogleTranslate(languageCode) {
  if (typeof window === 'undefined') {
    return
  }

  if (!languageCode) {
    window.dispatchEvent(new CustomEvent('open-language-popup'))
    return
  }

  const nextLanguage = normalizeLanguageCode(languageCode)

  storeLanguage(nextLanguage)

  if (nextLanguage === SOURCE_LANGUAGE) {
    writeTranslateCookie('', COOKIE_EXPIRED_AT)
    document.documentElement.lang = SOURCE_LANGUAGE
    window.location.reload()
    return
  }

  writeTranslateCookie(`/id/${nextLanguage}`, COOKIE_EXPIRES_AT())
  requestTranslation(nextLanguage)
}
