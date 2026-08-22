export function resolveBreadcrumbItemState(item, index, totalItems) {
  const isCurrent = typeof item.current === 'boolean'
    ? item.current
    : index === totalItems - 1

  return {
    isCurrent,
    isClickable: !isCurrent && typeof item.onClick === 'function',
  }
}
