import { useState, useEffect, useRef } from 'react'
import { getSelectedLanguage, changeLanguage, SUPPORTED_LANGUAGES } from '../utils/translation'
import Icon from './Icon'

function TranslateWidget() {
  const [isOpen, setIsOpen] = useState(false)
  const widgetRef = useRef(null)
  const activeLang = getSelectedLanguage()
  const activeLangObj = SUPPORTED_LANGUAGES.find((l) => l.code === activeLang) || SUPPORTED_LANGUAGES[0]

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (widgetRef.current && !widgetRef.current.contains(event.target)) {
        setIsOpen(false)
      }
    }

    document.addEventListener('mousedown', handleClickOutside)
    return () => {
      document.removeEventListener('mousedown', handleClickOutside)
    }
  }, [])

  const handleSelectLanguage = (code) => {
    changeLanguage(code)
    setIsOpen(false)
  }

  return (
    <div className="translate-widget-container" ref={widgetRef} style={{ position: 'relative', display: 'inline-block', alignSelf: 'flex-end', marginLeft: 'auto' }}>
      <button
        type="button"
        className="translate-btn"
        onClick={() => setIsOpen(!isOpen)}
        aria-expanded={isOpen}
        aria-haspopup="listbox"
        style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}
      >
        <Icon name="globe" />
        <span>Translate ({activeLangObj.flag} {activeLangObj.code.toUpperCase()})</span>
      </button>

      {isOpen && (
        <div
          className="translate-dropdown"
          role="listbox"
          style={{
            position: 'absolute',
            top: 'calc(100% + 6px)',
            right: 0,
            zIndex: 100,
            width: '210px',
            background: '#ffffff',
            border: '1.5px solid #e2e8f0',
            borderRadius: '12px',
            boxShadow: '0 10px 25px rgba(15, 23, 42, 0.12)',
            padding: '6px',
            display: 'flex',
            flexDirection: 'column',
            gap: '4px',
          }}
        >
          {SUPPORTED_LANGUAGES.map((lang) => (
            <button
              key={lang.code}
              type="button"
              role="option"
              aria-selected={activeLang === lang.code}
              className={`translate-dropdown-item ${activeLang === lang.code ? 'active' : ''}`}
              onClick={() => handleSelectLanguage(lang.code)}
              style={{
                width: '100%',
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                padding: '8px 10px',
                border: 'none',
                background: activeLang === lang.code ? '#eff6ff' : 'transparent',
                borderRadius: '8px',
                fontSize: '0.82rem',
                fontWeight: '700',
                color: activeLang === lang.code ? '#2563eb' : '#334155',
                cursor: pointer_event(),
                textAlign: 'left',
              }}
            >
              <span aria-hidden="true">{lang.flag}</span>
              <span style={{ flexGrow: 1 }}>{lang.label}</span>
              {activeLang === lang.code && (
                <Icon name="checkCircle" style={{ width: '12px', height: '12px', color: '#2563eb' }} />
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

// Safely evaluate cursor type
function pointer_event() {
  return 'pointer'
}

export default TranslateWidget
