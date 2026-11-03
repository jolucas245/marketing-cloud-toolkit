// Home page (feedback #1025, like Data Cloud Inspector's): the pages used most, from
// a per-browser visit count, and the recent saved queries. Visits are counts per
// page path in localStorage only.
import { NAV_ITEMS } from '../app/nav.js'

export const VISITS_KEY = 'toolkit_visits'

export function readVisits(storage = globalThis.localStorage) {
  try { const v = JSON.parse(storage?.getItem(VISITS_KEY) || '{}'); return v && typeof v === 'object' ? v : {} } catch { return {} }
}

/** Counts a visit to a sidebar page (other routes, such as one automation, are not counted). */
export function countVisit(path, storage = globalThis.localStorage) {
  const item = NAV_ITEMS.find((i) => i.path === path)
  if (!item) return
  try {
    const v = readVisits(storage)
    v[path] = (Number(v[path]) || 0) + 1
    storage?.setItem(VISITS_KEY, JSON.stringify(v))
  } catch { /* storage blocked */ }
}

/** The `n` sidebar pages visited most, as nav items with `count`. */
export function mostUsed(visits, n = 6) {
  return NAV_ITEMS.filter((i) => visits[i.path] > 0)
    .map((i) => ({ ...i, count: Number(visits[i.path]) }))
    .sort((a, b) => b.count - a.count)
    .slice(0, n)
}

/** Saved queries from chrome.storage.local's raw contents, newest first. */
export function recentQueries(raw, n = 5) {
  return Object.values(raw || {})
    .filter((v) => v && typeof v.queryText === 'string' && String(v.id || '').startsWith('sql_') && (v.queryText.trim() || v.runs?.length))
    .map((v) => ({ id: v.id, name: v.name || '', sql: v.queryText || v.runs?.[0]?.queryText || '', at: Number(v.timeStamp) || 0, source: v.source || '' }))
    .sort((a, b) => b.at - a.at)
    .slice(0, n)
}

/** One line of SQL for a list. */
export const sqlLine = (sql, max = 90) => { const t = String(sql || '').replace(/\s+/g, ' ').trim(); return t.length > max ? `${t.slice(0, max - 1)}…` : t }
