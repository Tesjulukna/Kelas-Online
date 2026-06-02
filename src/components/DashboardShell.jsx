import Icon from './Icon'

function DashboardShell({
  role,
  loginName,
  avatar,
  menuItems,
  activeMenu,
  onMenuChange,
  isMenuOpen = false,
  onCloseMenu = () => {},
  children,
}) {
  const roleLabel = role === 'admin' ? 'Admin' : 'Member'

  const handleMenuClick = (menuId) => {
    onMenuChange(menuId)
    onCloseMenu()
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  return (
    <section className={`dashboard-layout ${role}-layout`}>
      {isMenuOpen && (
        <button
          className="drawer-backdrop"
          type="button"
          aria-label="Tutup menu dashboard"
          onClick={onCloseMenu}
        />
      )}

      <aside className={`dashboard-sidebar ${role}-sidebar ${isMenuOpen ? 'open' : ''}`}>
        <div className="sidebar-profile">
          <span className="sidebar-avatar" aria-hidden="true">
            {avatar ? <img src={avatar} alt="" /> : <Icon name="user" />}
          </span>
          <div>
            <p className="eyebrow">{roleLabel} area</p>
            <h1>{loginName}</h1>
          </div>
          <button
            className="drawer-close"
            type="button"
            aria-label="Tutup menu"
            onClick={onCloseMenu}
          >
            <Icon name="x" />
          </button>
        </div>

        <nav className="dashboard-menu" aria-label={`Menu ${roleLabel}`}>
          {menuItems.map((item) => (
            <button
              key={item.id}
              className={activeMenu === item.id ? 'active' : ''}
              type="button"
              onClick={() => handleMenuClick(item.id)}
            >
              <Icon name={item.icon} />
              {item.label}
            </button>
          ))}
        </nav>
      </aside>

      <div className="dashboard-main">{children}</div>
    </section>
  )
}

export default DashboardShell
