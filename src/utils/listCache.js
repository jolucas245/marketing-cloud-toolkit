// Stored search results for Emails, CloudPages, Journeys and Automations (feedback
// #1069). A search is stored per stack, business unit and search (text, folder,
// filters) for 30 days. Searching again asks SFMC only for what changed since the newest
// stored item (`changes(since)`) and merges it in; Refresh (`force`) reads it all again,
// which also drops deleted items (no list in SFMC reports deletions).
import { plural } from './format.js'
import { cacheKey, cacheScope, readCache, writeCache, newestModified, mergeChanges } from './localCache.js'

const keyFor = async (stack, kind, params) => cacheKey(await cacheScope(stack), `list-${kind}`, JSON.stringify(params))

/** The stored list without asking SFMC: { items, total, savedAt } or null. */
export async function storedList(stack, kind, params) {
  const hit = await readCache(await keyFor(stack, kind, params))
  return hit ? { ...hit.value, savedAt: hit.savedAt } : null
}

/** Stores the list as shown now (after Load more, for example). */
export async function saveList(stack, kind, params, items, total) {
  const rec = await writeCache(await keyFor(stack, kind, params), { items: JSON.parse(JSON.stringify(items)), total })
  return rec.savedAt
}

/**
 * The list for one search. Returns { items, total, savedAt, mode, changed }: mode is
 * 'full' (read from SFMC), or 'delta' (stored list plus `changed` items SFMC reported
 * as changed since). A failing delta read falls back to a full one.
 */
export async function cachedList({ stack, kind, params, full, changes, force = false, idOf = (i) => i.id, modOf = (i) => i.modifiedDate, sortBy = null }) {
  const key = await keyFor(stack, kind, params)
  const hit = force ? null : await readCache(key)
  if (hit && changes) {
    try {
      const since = newestModified(hit.value.items, modOf)
      const changed = since ? await changes(since) : []
      const known = new Set(hit.value.items.map((i) => String(idOf(i))))
      const added = changed.filter((i) => !known.has(String(idOf(i)))).length
      const items = mergeChanges(hit.value.items, changed, { idOf, sortBy })
      const total = (hit.value.total ?? hit.value.items.length) + added
      const rec = changed.length ? await writeCache(key, { items: JSON.parse(JSON.stringify(items)), total }) : hit
      return { items, total, savedAt: rec.savedAt, mode: 'delta', changed: changed.length }
    } catch { /* read it all instead */ }
  }
  const r = await full()
  const rec = await writeCache(key, { items: JSON.parse(JSON.stringify(r.items)), total: r.total })
  return { items: r.items, total: r.total, savedAt: rec.savedAt, mode: 'full', changed: null }
}

/** "Saved 3 days ago · 2 changes read" style note. */
export function listNote(r, ago) {
  if (!r?.savedAt) return ''
  if (r.mode === 'delta') return r.changed ? `Stored list, updated with ${plural(r.changed, 'change')} from SFMC` : 'Stored list, no changes in SFMC since the last read'
  if (r.mode === 'stored') return `Stored list from ${ago(r.savedAt)}: Search reads only the changes`
  return ''
}
