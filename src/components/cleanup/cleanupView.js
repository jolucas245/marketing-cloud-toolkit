// Display helpers for Settings > Clean up: how old an item is, and why it can go.
const DAY = 86400000

/** Whole days since the item was created (modified date as a fallback), or null when unknown. */
export function ageDays(item, now = Date.now()) {
  const t = Date.parse(item?.createdDate || item?.modifiedDate || '')
  if (Number.isNaN(t)) return null
  return Math.max(0, Math.floor((now - t) / DAY))
}

/** "today", "yesterday", "6 days ago", "over 2 months ago", "over a year ago". */
export function relativeAge(days) {
  if (days == null) return ''
  if (days < 1) return 'today'
  if (days < 2) return 'yesterday'
  if (days < 30) return `${days} days ago`
  if (days < 365) {
    const m = Math.floor(days / 30)
    return m === 1 ? 'over a month ago' : `over ${m} months ago`
  }
  const y = Math.floor(days / 365)
  return y === 1 ? 'over a year ago' : `over ${y} years ago`
}

/**
 * Why each listed item can be deleted, from the lists themselves: a Query activity
 * names the data extension it writes to; a data extension is either still the
 * target of a listed activity or no longer written by any of them.
 */
export function reasons(activities = [], des = []) {
  const deNames = new Set(des.map((d) => d.name))
  const writers = new Map()
  activities.forEach((a) => { if (a.targetName && !writers.has(a.targetName)) writers.set(a.targetName, a.name) })
  return {
    activity: (a) => ({ target: a.targetName || '', targetListed: !!a.targetName && deNames.has(a.targetName) }),
    de: (d) => ({ writer: writers.get(d.name) || '' }),
  }
}
