import Icon from './Icon'
import { useNativeLanguage } from '../i18n/NativeLanguageContext'

const LANGUAGE_OPTIONS = [
  { code: 'id', label: 'Indonesia', flag: '🇮🇩' },
  { code: 'en', label: 'English', flag: '🇬🇧' },
]

export default function LanguagePopup({ onClose }) {
  const { language: activeCode, setLanguage } = useNativeLanguage()

  const handleSelect = (langCode) => {
    setLanguage(langCode)
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
        <p className="language-popup-desc">Pilih bahasa tampilan website</p>
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
          Bahasa tersimpan di perangkat ini dan dapat diubah kapan saja.
        </p>
      </div>
    </div>
  )
}
