// SFMC data kept in this browser so the Toolkit asks SFMC as little as possible
// (feedback #1069, #1066): folder trees, lists and automation details, per stack and
// business unit, for up to CACHE_DAYS. Stored in IndexedDB (usage/store.js: the
// browser's site quota, not chrome.storage's 10 MB) under keys starting `cache:`.
// Refresh on a page reads SFMC again; Settings > Storage can forget it all.
import { loadSaved, save, forget, peekSaved } from './usage/store.js'
import { fetchCurrentBU } from './sfmcApi.js'

export const CACHE_DAYS = 30
export const CACHE_MAX_AGE = CACHE_DAYS * 24 * 60 * 60 * 1000
export const CACHE_PREFIX = 'cache:'

// The business unit of a stack, asked once per app tab (switching BU in SFMC is seen
// on the next app tab, or with forgetScope).
const scopes = new Map()
export function cacheScope(stack, fetchBU = fetchCurrentBU) {
  if (!stack) return Promise.resolve('none:0')
  if (!scopes.has(stack)) {
    const p = fetchBU(stack).then((bu) => `${stack}:${bu?.accountId ?? 0}`).catch(() => `${stack}:0`)
    scopes.set(stack, p)
  }
  return scopes.get(stack)
}
export function forgetScope(stack) { if (stack) scopes.delete(stack); else scopes.clear() }

export const cacheKey = (scope, kind, sub = '') => `${CACHE_PREFIX}${kind}:${scope}${sub !== '' ? `:${sub}` : ''}`

/** { value, savedAt } when stored and younger than maxAge, else null. */
export async function readCache(key, maxAge = CACHE_MAX_AGE) {
  const hit = await loadSaved(key)
  if (!hit || Date.now() - hit.savedAt > maxAge) return null
  return hit
}
export const writeCache = (key, value) => save(key, value)
export const peekCache = (key) => peekSaved(key)

/** Forgets one kind (or everything stored by this module when kind is empty). */
export function forgetCache(kind = '', scope = '') {
  return forget(kind ? `${CACHE_PREFIX}${kind}:${scope ? `${scope}:` : ''}` : CACHE_PREFIX)
}

/**
 * The stored value, or `fetcher()`'s (then stored). `force` reads SFMC even when stored.
 * Returns { value, savedAt, fromCache }.
 */
export async function cached(key, fetcher, { force = false, maxAge = CACHE_MAX_AGE } = {}) {
  if (!force) {
    const hit = await readCache(key, maxAge)
    if (hit) return { value: hit.value, savedAt: hit.savedAt, fromCache: true }
  }
  const value = await fetcher()
  const rec = await writeCache(key, value)
  return { value, savedAt: rec.savedAt, fromCache: false }
}

// ── Delta ────────────────────────────────────────────────
const time = (v) => { const t = Date.parse(v ?? ''); return Number.isFinite(t) ? t : 0 }

/** The newest modified date among items (ISO string from the item, or null). */
export function newestModified(items, modOf = (i) => i.modifiedDate) {
  let best = null
  for (const i of items || []) if (time(modOf(i)) > time(best)) best = modOf(i)
  return best
}

/**
 * Stored items with the changed ones put in (matched by id; new ones added), sorted by
 * `sortBy` when given, else in the stored order with new items first.
 */
export function mergeChanges(stored, changed, { idOf = (i) => i.id, sortBy = null } = {}) {
  const byId = new Map(changed.map((i) => [String(idOf(i)), i]))
  const kept = stored.map((i) => byId.get(String(idOf(i))) ?? i)
  const known = new Set(stored.map((i) => String(idOf(i))))
  const added = changed.filter((i) => !known.has(String(idOf(i))))
  const out = [...added, ...kept]
  return sortBy ? out.sort(sortBy) : out
}

/**
 * Items changed since `since`, from a list sorted newest change first: pages are read
 * until one holds an item older than `since` (or `maxPages`). The Where used deltaList
 * method, for one list.
 */
export async function changesSince(since, fetchPage, { modOf = (i) => i.modifiedDate, maxPages = 10 } = {}) {
  const out = []
  const limit = time(since)
  for (let page = 1; page <= maxPages; page++) {
    const items = (await fetchPage(page)) || []
    const newer = items.filter((i) => time(modOf(i)) > limit)
    out.push(...newer)
    if (!items.length || newer.length < items.length) break
  }
  return out
}

/** "today", "yesterday" or "12 days ago", for the Saved note. */
export function savedAgo(savedAt, now = Date.now()) {
  const days = Math.floor((now - savedAt) / 86400000)
  if (days <= 0) {
    const mins = Math.max(1, Math.round((now - savedAt) / 60000))
    return mins < 60 ? `${mins} min ago` : `${Math.round(mins / 60)} h ago`
  }
  return days === 1 ? 'yesterday' : `${days} days ago`
}
