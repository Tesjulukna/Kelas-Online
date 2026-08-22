import Icon from './Icon'
import { resolveBreadcrumbItemState } from '../utils/breadcrumb'

function PublicBreadcrumb({ items = [] }) {
  const visibleItems = items.filter((item) => item?.label)

  if (!visibleItems.length) {
    return null
  }

  return (
    <nav className="public-breadcrumb" aria-label="Breadcrumb">
      <ol>
        {visibleItems.map((item, index) => {
          const { isCurrent, isClickable } = resolveBreadcrumbItemState(
            item,
            index,
            visibleItems.length,
          )

          return (
            <li key={`${item.label}-${index}`}>
              {index > 0 && <Icon name="arrowRight" />}
              {isClickable ? (
                <button type="button" onClick={item.onClick}>{item.label}</button>
              ) : (
                <span aria-current={isCurrent ? 'page' : undefined}>{item.label}</span>
              )}
            </li>
          )
        })}
      </ol>
    </nav>
  )
}

export default PublicBreadcrumb
