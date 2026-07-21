import { useEffect, useRef, useState } from 'react'
import Icon from './Icon'

function ProfileMenu({
  session,
  onEditProfile,
  onLogout,
  publicTheme = 'light',
  onTogglePublicTheme = () => {},
}) {
  const [isOpen, setIsOpen] = useState(false)
  const menuRef = useRef(null)
  const isDarkTheme = publicTheme === 'dark'
  const canToggleTheme = session?.role === 'member'

  useEffect(() => {
    if (!isOpen) return undefined

    const handlePointerDown = (event) => {
      if (menuRef.current && !menuRef.current.contains(event.target)) {
        setIsOpen(false)
      }
    }

    const handleKeyDown = (event) => {
      if (event.key === 'Escape') {
        setIsOpen(false)
      }
    }

    document.addEventListener('pointerdown', handlePointerDown, true)
    document.addEventListener('keydown', handleKeyDown)

    return () => {
      document.removeEventListener('pointerdown', handlePointerDown, true)
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [isOpen])

  const closeAndEdit = () => {
    setIsOpen(false)
    onEditProfile()
  }

  const closeAndLogout = () => {
    setIsOpen(false)
    onLogout()
  }

  const toggleTheme = () => {
    onTogglePublicTheme()
  }

  return (
    <div className="profile-menu" ref={menuRef}>
      <button
        className="profile-trigger"
        type="button"
        aria-haspopup="menu"
        aria-expanded={isOpen}
        aria-label="Buka menu profil"
        onClick={() => setIsOpen((current) => !current)}
      >
        <span className="profile-avatar" aria-hidden="true">
          {session.avatar ? <img src={session.avatar} alt="" /> : <Icon name="user" />}
        </span>
        <span className="profile-name">{session.name}</span>
      </button>

      {isOpen && (
        <div className="profile-dropdown" role="menu">
          {canToggleTheme && (
            <button
              className="profile-theme-menu-item"
              type="button"
              role="menuitem"
              aria-pressed={isDarkTheme}
              onClick={toggleTheme}
            >
              <span className={`profile-theme-icon ${isDarkTheme ? 'is-dark' : ''}`}>
                {isDarkTheme ? (
                  <svg viewBox="0 0 24 24" aria-hidden="true">
                    <path d="M20.2 14.9A7.8 7.8 0 0 1 9.1 3.8a8.3 8.3 0 1 0 11.1 11.1Z" />
                  </svg>
                ) : (
                  <svg viewBox="0 0 24 24" aria-hidden="true">
                    <circle cx="12" cy="12" r="4.2" />
                    <path d="M12 2.5v2.2M12 19.3v2.2M4.6 4.6l1.6 1.6M17.8 17.8l1.6 1.6M2.5 12h2.2M19.3 12h2.2M4.6 19.4l1.6-1.6M17.8 6.2l1.6-1.6" />
                  </svg>
                )}
              </span>
              {isDarkTheme ? 'Mode terang' : 'Mode malam'}
            </button>
          )}
          <button type="button" role="menuitem" onClick={closeAndEdit}>
            <Icon name="userPen" />
            Edit profil
          </button>
          <button type="button" role="menuitem" onClick={closeAndLogout}>
            <Icon name="logOut" />
            Logout
          </button>
        </div>
      )}
    </div>
  )
}

export default ProfileMenu
