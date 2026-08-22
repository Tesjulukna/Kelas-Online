import Icon from './Icon'

function PublicBreadcrumb({ items = [] }) {
  const visibleItems = items.filter((item) => item?.label)

  if (!visibleItems.length) {
    return null
  }

  return (
    <nav className="public-breadcrumb" aria-label="Breadcrumb">
      <ol>
        {visibleItems.map((item, index) => {
          const isCurrent = index === visibleItems.length - 1 || item.current

          return (
            <li key={`${item.label}-${index}`}>
              {index > 0 && <Icon name="arrowRight" />}
              {isCurrent || typeof item.onClick !== 'function' ? (
                <span aria-current={isCurrent ? 'page' : undefined}>{item.label}</span>
              ) : (
                <button type="button" onClick={item.onClick}>{item.label}</button>
              )}
            </li>
          )
        })}
      </ol>
    </nav>
  )
}

export default PublicBreadcrumb
