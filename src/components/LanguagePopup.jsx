import { useState } from 'react'
import Icon from './Icon'
import { applyGoogleTranslate as triggerGoogleTranslate } from '../utils/googleTranslate'

const LANGUAGE_OPTIONS = [
  { code: 'id', label: 'Indonesia', flag: '🇮🇩' },
  { code: 'en', label: 'English', flag: '🇬🇧' },
  { code: 'ar', label: 'العربية', flag: '🇸🇦' },
  { code: 'zh-CN', label: '中文 (简体)', flag: '🇨🇳' },
  { code: 'ja', label: '日本語', flag: '🇯🇵' },
  { code: 'ko', label: '한국어', flag: '🇰🇷' },
  { code: 'ms', label: 'Melayu', flag: '🇲🇾' },
  { code: 'fr', label: 'Français', flag: '🇫🇷' },
  { code: 'de', label: 'Deutsch', flag: '🇩🇪' },
  { code: 'es', label: 'Español', flag: '🇪🇸' },
  { code: 'pt', label: 'Português', flag: '🇧🇷' },
  { code: 'ru', label: 'Русский', flag: '🇷🇺' },
  { code: 'hi', label: 'हिन्दी', flag: '🇮🇳' },
  { code: 'th', label: 'ภาษาไทย', flag: '🇹🇭' },
  { code: 'vi', label: 'Tiếng Việt', flag: '🇻🇳' },
  { code: 'tr', label: 'Türkçe', flag: '🇹🇷' },
]

export default function LanguagePopup({ onClose }) {
  const [activeCode, setActiveCode] = useState(() => {
    const cookieLang = document.cookie.match(/googtrans=\/[^/]+\/([^;]+)/)
    return cookieLang ? cookieLang[1] : 'id'
  })

  const handleSelect = (langCode) => {
    setActiveCode(langCode)
    triggerGoogleTranslate(langCode)
    onClose()
  }

  return (
    <div
      className="language-popup-backdrop"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
    >
      <div className="language-popup-modal" role="dialog" aria-modal="true" aria-labelledby="lang-popup-title">
        <div className="language-popup-header">
          <div className="language-popup-title-group">
            <span className="language-popup-icon" aria-hidden="true">🌐</span>
            <h2 id="lang-popup-title">Pilih Bahasa</h2>
          </div>
          <button className="language-popup-close" type="button" onClick={onClose} aria-label="Tutup">
            <Icon name="x" />
          </button>
        </div>
        <p className="language-popup-desc">Terjemahkan halaman ini menggunakan Google Translate</p>
        <div className="language-popup-grid">
          {LANGUAGE_OPTIONS.map((lang) => (
            <button
              key={lang.code}
              type="button"
              className={`language-option-btn ${activeCode === lang.code ? 'active' : ''}`}
              onClick={() => handleSelect(lang.code)}
            >
              <span className="language-flag" aria-hidden="true">{lang.flag}</span>
              <span className="language-label">{lang.label}</span>
              {activeCode === lang.code && (
                <span className="language-check" aria-hidden="true">
                  <Icon name="checkCircle" />
                </span>
              )}
            </button>
          ))}
        </div>
        <p className="language-popup-note">
          Terjemahan otomatis oleh Google Translate. Beberapa teks mungkin kurang akurat.
        </p>
      </div>
    </div>
  )
}
