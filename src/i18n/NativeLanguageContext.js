import { createContext, useContext } from 'react'

const LanguageContext = createContext(null)

export function useNativeLanguage() {
  const context = useContext(LanguageContext)

  if (!context) {
    throw new Error('useNativeLanguage must be used inside LanguageProvider')
  }

  return context
}

export default LanguageContext
