import { getSelectedLanguage, changeLanguage, SUPPORTED_LANGUAGES } from '../utils/translation'
import Icon from './Icon'

function LanguageModal({ isOpen, onClose }) {
  if (!isOpen) {
    return null
  }

  const activeLang = getSelectedLanguage()

  const handleSelectLanguage = (code) => {
    changeLanguage(code)
    onClose()
  }

  return (
    <div
      className="language-modal-backdrop"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) {
          onClose()
        }
      }}
    >
      <div className="language-modal" role="dialog" aria-modal="true" aria-labelledby="language-modal-title">
        <div className="language-modal-header">
          <div className="language-modal-title-group">
            <Icon name="globe" className="language-modal-globe-icon" />
            <h2 id="language-modal-title">Pilih Bahasa / Select Language</h2>
          </div>
          <button className="language-modal-close" type="button" onClick={onClose} aria-label="Tutup">
            <Icon name="x" />
          </button>
        </div>

        <div className="language-modal-list">
          {SUPPORTED_LANGUAGES.map((lang) => (
            <button
              key={lang.code}
              type="button"
              className={`language-modal-item ${activeLang === lang.code ? 'active' : ''}`}
              onClick={() => handleSelectLanguage(lang.code)}
            >
              <span className="language-flag" aria-hidden="true">{lang.flag}</span>
              <span className="language-label">{lang.label}</span>
              {activeLang === lang.code && (
                <Icon name="checkCircle" className="language-active-check" />
              )}
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}

export default LanguageModal
