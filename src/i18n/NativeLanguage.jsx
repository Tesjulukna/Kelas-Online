import { useEffect, useMemo, useState } from 'react'
import LanguageContext, { useNativeLanguage } from './NativeLanguageContext'
import { translateUiText } from './translations'

const LANGUAGE_STORAGE_KEY = 'ibnucreative.native-language.v1'
const textRecords = new WeakMap()
const attributeRecords = new WeakMap()
const translatedAttributes = ['aria-label', 'placeholder', 'title']

function readLanguage() {
  if (typeof window === 'undefined') {
    return 'id'
  }

  try {
    return window.localStorage.getItem(LANGUAGE_STORAGE_KEY) === 'en' ? 'en' : 'id'
  } catch {
    return 'id'
  }
}

function shouldSkipElement(element) {
  return Boolean(element?.closest(
    'script, style, [contenteditable="true"], .notranslate, .admin-layout',
  ))
}

function shouldSkipTextElement(element) {
  return shouldSkipElement(element) || Boolean(element?.closest('textarea, code, pre'))
}

function translateTextNode(node, language) {
  const parent = node.parentElement

  if (!parent || shouldSkipTextElement(parent)) {
    return
  }

  const current = node.nodeValue || ''
  const record = textRecords.get(node)

  if (language === 'id') {
    if (record && current === record.translated) {
      node.nodeValue = record.source
    }

    textRecords.delete(node)
    return
  }

  if (record && current === record.translated) {
    return
  }

  const source = current
  const translated = translateUiText(source, language)

  if (translated !== source) {
    textRecords.set(node, { source, translated })
    node.nodeValue = translated
  } else {
    textRecords.delete(node)
  }
}

function translateElementAttributes(element, language) {
  if (shouldSkipElement(element)) {
    return
  }

  const records = attributeRecords.get(element) || {}

  translatedAttributes.forEach((attribute) => {
    if (!element.hasAttribute(attribute)) {
      return
    }

    const current = element.getAttribute(attribute) || ''
    const record = records[attribute]

    if (language === 'id') {
      if (record && current === record.translated) {
        element.setAttribute(attribute, record.source)
      }

      delete records[attribute]
      return
    }

    if (record && current === record.translated) {
      return
    }

    const translated = translateUiText(current, language)

    if (translated !== current) {
      records[attribute] = { source: current, translated }
      element.setAttribute(attribute, translated)
    } else {
      delete records[attribute]
    }
  })

  if (Object.keys(records).length) {
    attributeRecords.set(element, records)
  } else {
    attributeRecords.delete(element)
  }
}

function translateTree(root, language) {
  if (root.nodeType === Node.TEXT_NODE) {
    translateTextNode(root, language)
    return
  }

  if (root.nodeType !== Node.ELEMENT_NODE) {
    return
  }

  translateElementAttributes(root, language)

  const walker = document.createTreeWalker(
    root,
    NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_TEXT,
  )
  let current = walker.nextNode()

  while (current) {
    if (current.nodeType === Node.TEXT_NODE) {
      translateTextNode(current, language)
    } else {
      translateElementAttributes(current, language)
    }

    current = walker.nextNode()
  }
}

export function LanguageProvider({ children }) {
  const [language, setLanguageState] = useState(readLanguage)

  const setLanguage = (nextLanguage) => {
    const safeLanguage = nextLanguage === 'en' ? 'en' : 'id'

    setLanguageState(safeLanguage)
    document.documentElement.lang = safeLanguage

    try {
      window.localStorage.setItem(LANGUAGE_STORAGE_KEY, safeLanguage)
    } catch {
      return
    }
  }

  const value = useMemo(() => ({ language, setLanguage }), [language])

  return <LanguageContext.Provider value={value}>{children}</LanguageContext.Provider>
}

export function NativeLanguageBridge() {
  const { language } = useNativeLanguage()

  useEffect(() => {
    const root = document.getElementById('root')

    if (!root) {
      return undefined
    }

    document.documentElement.lang = language
    translateTree(root, language)

    const observer = new MutationObserver((mutations) => {
      mutations.forEach((mutation) => {
        if (mutation.type === 'characterData') {
          translateTextNode(mutation.target, language)
          return
        }

        mutation.addedNodes.forEach((node) => translateTree(node, language))
      })
    })

    observer.observe(root, {
      childList: true,
      characterData: true,
      subtree: true,
    })

    return () => observer.disconnect()
  }, [language])

  return null
}
