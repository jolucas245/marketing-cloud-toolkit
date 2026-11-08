// Display helpers shared by the result screens.

// SFMC sends 0001-01-01 (and sometimes 1900-01-01) for "no date": a draft journey's
// last publish, an automation with no next run (live test, 2026-11-07).
export function isPlaceholderDate(d) {
  return d instanceof Date && !Number.isNaN(d.getTime()) && d.getFullYear() <= 1900
}

export function formatDateTime(value) {
  if (!value) return ''
  const d = new Date(value)
  if (Number.isNaN(d.getTime())) return String(value)
  if (isPlaceholderDate(d)) return ''
  return d.toLocaleString(undefined, { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
}

export function formatDate(value) {
  if (!value) return ''
  const d = new Date(value)
  if (Number.isNaN(d.getTime())) return String(value)
  return isPlaceholderDate(d) ? '' : d.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })
}

// "1 run", "3 runs" (live test, 2026-11-07: "1 runs ... across 1 automations").
/**
 * SFMC's joined-up status names in words: "PausedSchedule" -> "Paused schedule",
 * "ScheduledToPublish" -> "Scheduled to publish" (live test, 2026-11-08). Anything
 * else is returned as is.
 */
export function statusWords(v) {
  const s = String(v ?? '')
  return /^[A-Z][a-z]+(?:[A-Z][a-z]+)+$/.test(s) ? s.replace(/(?!^)([A-Z])/g, (c) => ` ${c.toLowerCase()}`) : s
}

export function plural(n, word, many = `${word}s`) {
  const count = Number(n) || 0
  return `${count.toLocaleString()} ${count === 1 ? word : many}`
}

// [Name] when the identifier needs brackets in SFMC SQL.
export function sqlName(name) {
  const n = String(name)
  return /^[A-Za-z_][A-Za-z0-9_]*$/.test(n) ? n : `[${n.replace(/]/g, ']]')}]`
}
