// Automatic clean-up of Run Query's SFMC objects (feedback #1081, user 2026-11-06).
// Every run creates a target data extension and a Query activity (SFMCQS_...), and they
// piled up. SFMC's data retention can delete a data extension but not a Query activity,
// so the Toolkit deletes both itself: runs this browser made more than N days ago (7 by
// default, 0 turns it off) lose their activity and data extension; the run stays in the
// query's history, marked cleanedAt. Only ids recorded in this browser's run history are
// touched, only with SFMCQS_ names, and never an id a newer run still uses (Reuse the
// data extension and Query Activity). Settings > Clean up still covers everything else.
import { deleteDE, deleteQueryActivity } from './sfmcApi.js'
import { isToolkitName } from './cleanup.js'

export const RUN_CLEANUP_SETTING = '_queryRunCleanupDays'
export const DEFAULT_RUN_CLEANUP_DAYS = 7
const LAST_SWEEP_KEY = '_queryRunCleanupAt' // { [stack]: ms }
const DAY = 86400000

export function parseRunCleanupDays(v) {
  return Number.isInteger(v) && v >= 0 && v <= 365 ? v : DEFAULT_RUN_CLEANUP_DAYS
}

const isQueryRecord = (v) => v && String(v.id || '').startsWith('sql_') && Array.isArray(v.runs)

/**
 * The runs on `stack` older than `days` that still have an SFMC object to delete.
 * Returns [{ queryId, runId, deId, activityId }] where deId / activityId are null when
 * that object must be kept (no SFMCQS_ name, or a newer run still uses it).
 */
export function expiredRuns(storage, stack, days, now = Date.now()) {
  if (!(days > 0)) return []
  const cutoff = now - days * DAY
  const records = Object.values(storage || {}).filter(isQueryRecord)
  const inUse = new Set()
  for (const q of records) {
    for (const r of q.runs) {
      if (!(r?.runAt < cutoff)) { if (r?.deId) inUse.add(`de:${r.deId}`); if (r?.activityId) inUse.add(`act:${r.activityId}`) }
    }
  }
  const out = []
  for (const q of records) {
    for (const r of q.runs) {
      if (!r || !(r.runAt < cutoff) || (r.stack || null) !== stack) continue
      const deId = r.deId && isToolkitName(r.deName) && !inUse.has(`de:${r.deId}`) ? r.deId : null
      const activityId = r.activityId && isToolkitName(r.activityName) && !inUse.has(`act:${r.activityId}`) ? r.activityId : null
      if (deId || activityId) out.push({ queryId: q.id, runId: r.runId, deId, activityId })
    }
  }
  return out
}

// An object already deleted (by hand, Clean up or another browser) counts as cleaned up.
const gone = (e) => e?.status === 404 || /\b404\b/.test(e?.message || '')
async function attempt(del, id) {
  try { await del(id); return true } catch (e) { return gone(e) }
}

const getAll = () => new Promise((resolve) => chrome.storage.local.get(null, (all) => resolve(all || {})))
const setItems = (items) => new Promise((resolve) => chrome.storage.local.set(items, resolve))

/**
 * Deletes the expired runs' Query activities, then their data extensions, and records
 * that in each run. At most once a day per stack unless `force`. Returns the number of
 * runs cleaned up.
 */
export async function cleanUpOldRuns(stack, { days, force = false, now = Date.now() } = {}) {
  if (!stack) return 0
  const all = await getAll()
  const limit = days ?? parseRunCleanupDays(all[RUN_CLEANUP_SETTING])
  const last = all[LAST_SWEEP_KEY] || {}
  if (!(limit > 0) || (!force && now - (last[stack] || 0) < DAY)) return 0
  await setItems({ [LAST_SWEEP_KEY]: { ...last, [stack]: now } })

  const done = new Map() // runId -> { de, act }
  for (const run of expiredRuns(all, stack, limit, now)) {
    const act = run.activityId ? await attempt((id) => deleteQueryActivity(stack, id), run.activityId) : false
    const de = run.deId ? await attempt((id) => deleteDE(stack, id), run.deId) : false
    if (act || de) done.set(`${run.queryId}/${run.runId}`, { de, act })
  }
  if (!done.size) return 0

  // Re-read so a query saved meanwhile is not overwritten with old runs.
  const fresh = await getAll()
  const updates = {}
  for (const q of Object.values(fresh).filter(isQueryRecord)) {
    let changed = false
    const runs = q.runs.map((r) => {
      const d = r && done.get(`${q.id}/${r.runId}`)
      if (!d) return r
      changed = true
      return { ...r, ...(d.de ? { deId: null, deKey: null } : {}), ...(d.act ? { activityId: null } : {}), cleanedAt: now }
    })
    if (changed) updates[q.id] = { ...q, runs }
  }
  if (Object.keys(updates).length) await setItems(updates)
  return done.size
}
