export function accountRowStatus(row, stockStatuses = {}) {
  const status = stockStatuses[String(row[0] ?? '').trim()] || String(row[3] ?? '').trim().toLowerCase() || 'available'
  return ({ tersedia: 'available', nonaktif: 'disabled', terjual: 'sold', external_sold: 'sold' })[status] || status
}

export function accountSheetPage(rows, stockStatuses, { query = '', status = 'all', page = 0, pageSize = 20 } = {}) {
  const needle = query.trim().toLowerCase()
  const filtered = rows.filter(row => {
    if (status !== 'all' && accountRowStatus(row, stockStatuses) !== status) return false
    return !needle || [row[0], row[1], row[4], row[5]].some(value => String(value ?? '').toLowerCase().includes(needle))
  })
  const size = pageSize === 50 ? 50 : 20
  const pages = Math.max(1, Math.ceil(filtered.length / size))
  const currentPage = Math.max(0, Math.min(page, pages - 1))
  return { total: filtered.length, pages, page: currentPage, size, rows: filtered.slice(currentPage * size, (currentPage + 1) * size) }
}
