export function publicCodeFromId(id, takenCodes = new Set()) {
  const source = String(id || 'item')
  let hash = 0x811c9dc5

  for (let index = 0; index < source.length; index += 1) {
    hash ^= source.charCodeAt(index)
    hash = Math.imul(hash, 0x01000193) >>> 0
  }

  for (let salt = 0; salt < 100; salt += 1) {
    const code = String(10000 + ((hash + salt * 9973) % 90000)).padStart(5, '0')

    if (!takenCodes.has(code)) {
      takenCodes.add(code)
      return code
    }
  }

  return String(10000 + (hash % 90000)).padStart(5, '0')
}

export function withPublicCodes(items) {
  const takenCodes = new Set()

  return items.map((item) => ({
    ...item,
    publicCode: publicCodeFromId(item.id, takenCodes),
  }))
}
