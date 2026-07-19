import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'
import { LanguageProvider, NativeLanguageBridge } from './i18n/NativeLanguage.jsx'

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <LanguageProvider>
      <NativeLanguageBridge />
      <App />
    </LanguageProvider>
  </StrictMode>,
)
