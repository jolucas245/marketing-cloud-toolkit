// Next / Previous on automation and journey pages (feedback #1043): the list a detail page
// was opened from, in the order it was shown (search, filters and sort). Kept for this tab
// in memory and sessionStorage, ids and names only.
const lists = new Map()
const KEY = (kind) => `toolkit_browse_${kind}`

/** rows: [{ id, name?, query? }] as shown on the list page. */
export function setBrowseList(kind, rows) {
  const list = (rows || []).filter((r) => r?.id != null).map((r) => ({ id: String(r.id), name: r.name || '', ...(r.query ? { query: r.query } : {}) }))
  lists.set(kind, list)
  try { sessionStorage.setItem(KEY(kind), JSON.stringify(list)) } catch { /* storage blocked or full */ }
}

export function getBrowseList(kind) {
  if (lists.has(kind)) return lists.get(kind)
  try {
    const saved = JSON.parse(sessionStorage.getItem(KEY(kind)) || 'null')
    if (Array.isArray(saved)) { lists.set(kind, saved); return saved }
  } catch { /* storage blocked */ }
  return []
}

/** Where `id` sits in the list: { index, total, prev, next } (prev/next null at the ends), or null. */
export function browseNeighbours(kind, id) {
  const list = getBrowseList(kind)
  const i = list.findIndex((r) => r.id.toLowerCase() === String(id || '').toLowerCase())
  if (i < 0) return null
  return { index: i, total: list.length, prev: list[i - 1] || null, next: list[i + 1] || null }
}

export function clearBrowseLists() {
  lists.clear()
}
