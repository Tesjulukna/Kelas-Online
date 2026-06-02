import { useState } from 'react'
import Icon from './Icon'

function ProfileMenu({ session, onEditProfile, onLogout }) {
  const [isOpen, setIsOpen] = useState(false)

  const closeAndEdit = () => {
    setIsOpen(false)
    onEditProfile()
  }

  const closeAndLogout = () => {
    setIsOpen(false)
    onLogout()
  }

  return (
    <div className="profile-menu">
      <button
        className="profile-trigger"
        type="button"
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
