// Publication Lists (feedback #1080, user 2026-11-06): subscribers per list and status,
// read with the user's SQL on the _ListSubscribers data view. A query activity can take
// minutes to run, so the request is asynchronous: it is started, the page says it will
// tell the user, and a toast does once the counts are in. The job's state (status and
// SFMC ids, never the counts) is kept in chrome.storage, so it survives leaving the page
// and is picked up again after a reload. The counts stay in Marketing Cloud, in the
// target data extension, and are read from there (PRIVACY.md: query results are never
// stored in the browser).
// One target data extension and Query Activity per business unit are reused for every
// refresh (SFMCQS_ names, so Settings > Clean up can remove them); when either is gone
// they are created again.
import { reactive } from 'vue'
import {
  getOrCreateDEFolder, getOrCreateQAFolder, createTargetDE, buildDEFields, createQueryActivity,
  startQueryActivity, getQueryActivityStatus, fetchDERows, deleteQueryActivity,
} from './sfmcApi.js'
import { showToast } from '@/composables/useToast.js'

// The user's query (2026-11-06). ORDER BY needs OFFSET in an SFMC query activity.
export const SUMMARY_SQL = `SELECT
    ListName,
    Status,
    COUNT(*) AS SubscriberCount
FROM _ListSubscribers
GROUP BY
    ListName,
    Status
ORDER BY
    ListName,
    Status
OFFSET 0 ROWS`

export const SUMMARY_FIELDS = [
  { name: 'ListName', type: 'Text', length: 500 },
  { name: 'Status', type: 'Text', length: 50 },
  { name: 'SubscriberCount', type: 'Number' },
]

// The statuses SFMC gives a subscriber on a list, in the order the page shows them.
export const STATUSES = ['Active', 'Unsubscribed', 'Held', 'Bounced']

export const STATE_KEY = '_publicationLists' // { [stack:accountId]: job }
const POLL_MS = 10000

// Shown wherever the user is in the Toolkit when the job ends.
export function notifyDone(job) {
  if (job?.status === 'done') showToast('Publication list counts are ready: Contacts > Publication Lists.', 8000, { kind: 'success' })
  else if (job?.status === 'error') showToast(`Publication list counts failed: ${job.error}`, 10000, { kind: 'error' })
}
const MAX_MINUTES = 30

/** One row per list: { List, Active, Unsubscribed, Held, Bounced, [other statuses], Total }. */
export function pivotSummary(rows) {
  const lists = new Map()
  const extra = new Set()
  for (const raw of rows || []) {
    const r = Object.fromEntries(Object.entries(raw || {}).map(([k, v]) => [k.toLowerCase(), v]))
    const name = String(r.listname ?? '').trim()
    if (!name) continue
    const s = String(r.status ?? '').trim().toLowerCase()
    const status = STATUSES.find((x) => x.toLowerCase() === s) || (s ? s[0].toUpperCase() + s.slice(1) : 'Unknown')
    if (!STATUSES.includes(status)) extra.add(status)
    const n = Number(r.subscribercount) || 0
    const row = lists.get(name) || { List: name }
    row[status] = (row[status] || 0) + n
    lists.set(name, row)
  }
  const columns = ['List', ...STATUSES, ...[...extra].sort(), 'Total']
  const out = [...lists.values()].map((row) => {
    const full = { List: row.List }
    let total = 0
    for (const c of columns.slice(1, -1)) { full[c] = row[c] || 0; total += full[c] }
    full.Total = total
    return full
  })
  return { columns, rows: out }
}

// ── Job state ────────────────────────────────────────────

/** Reactive jobs by scope, mirrored in chrome.storage. */
export const jobs = reactive({})
/** The counts' rows by scope, in memory only. */
export const results = reactive({})
const polling = new Set()
let loaded = null

const getKey = (k) => new Promise((resolve) => chrome.storage.local.get(k, (r) => resolve(r?.[k])))
const setKey = (k, v) => new Promise((resolve) => chrome.storage.local.set({ [k]: v }, resolve))

export const scopeOf = (stack, accountId) => `${stack}:${accountId ?? 'bu'}`

function loadJobs() {
  if (!loaded) loaded = getKey(STATE_KEY).then((saved) => { Object.assign(jobs, saved || {}) })
  return loaded
}
async function saveJob(scope, { rows, ...job }) {
  jobs[scope] = job
  const saved = (await getKey(STATE_KEY)) || {}
  await setKey(STATE_KEY, { ...saved, [scope]: job })
}

const gone = (e) => e?.status === 404 || /\b404\b/.test(e?.message || '')
const wait = (ms) => new Promise((r) => setTimeout(r, ms))

async function ensureObjects(stack, ids, api) {
  if (ids?.deKey && ids?.activityId) {
    try { await api.fetchDERows(stack, ids.deKey, 1, 1); return ids } catch (e) { if (!gone(e)) throw e }
    await api.deleteQueryActivity(stack, ids.activityId).catch(() => undefined)
  }
  const stamp = Date.now()
  const deName = `SFMCQS_publist_${stamp}`
  const de = await api.createTargetDE(stack, { name: deName, fields: buildDEFields(SUMMARY_FIELDS), categoryID: await api.getOrCreateDEFolder(stack) })
  const deKey = de?.customerKey || de?.key
  if (!de?.id || !deKey) throw new Error('SFMC did not return the new data extension\'s key.')
  const qa = await api.createQueryActivity(stack, {
    name: `SFMCQS_publist_${stamp}`,
    description: 'Publication list counts for Marketing Cloud Toolkit (Contacts > Publication Lists)',
    queryText: SUMMARY_SQL, targetName: deName, targetKey: deKey, targetId: de.id,
    updateType: 0, categoryId: await api.getOrCreateQAFolder(stack),
  })
  const activityId = qa?.queryDefinitionId || qa?.id
  if (!activityId) throw new Error('SFMC did not return the Query Activity\'s ID.')
  return { deId: de.id, deKey, deName, activityId }
}

const API = { getOrCreateDEFolder, getOrCreateQAFolder, createTargetDE, createQueryActivity, startQueryActivity, getQueryActivityStatus, fetchDERows, deleteQueryActivity, wait }

/**
 * Starts the query for this business unit (unless one is running) and polls it in the
 * background. `onDone(job)` is called when it finishes, with or without an error.
 */
export async function requestSummary(stack, accountId, { onDone = notifyDone, api: overrides } = {}) {
  const api = { ...API, ...overrides }
  await loadJobs()
  const scope = scopeOf(stack, accountId)
  const prev = jobs[scope] || {}
  if (prev.status === 'running' && polling.has(scope)) return prev
  let job = { ...prev, status: 'running', startedAt: Date.now(), error: null }
  await saveJob(scope, job)
  try {
    const ids = await ensureObjects(stack, prev.ids, api)
    await api.startQueryActivity(stack, ids.activityId)
    job = { ...job, ids }
    await saveJob(scope, job)
  } catch (e) {
    await saveJob(scope, { ...job, status: 'error', error: e.message, finishedAt: Date.now() })
    onDone?.(jobs[scope])
    return jobs[scope]
  }
  poll(stack, scope, { onDone, api })
  return job
}

/** Picks up a job that was running when the Toolkit was closed or reloaded. */
export async function resumeSummary(stack, accountId, { onDone = notifyDone, api: overrides } = {}) {
  await loadJobs()
  const scope = scopeOf(stack, accountId)
  const job = jobs[scope]
  if (job?.status !== 'running' || !job.ids?.activityId || polling.has(scope)) return
  poll(stack, scope, { onDone, api: { ...API, ...overrides }, resumed: true })
}

async function poll(stack, scope, { onDone, api, resumed = false }) {
  polling.add(scope)
  const job = jobs[scope]
  try {
    let seenRunning = false
    for (let i = 0; ; i++) {
      await api.wait(POLL_MS)
      const { isRunning } = await api.getQueryActivityStatus(stack, job.ids.activityId)
      if (isRunning === true) seenRunning = true
      // A resumed job may have finished while the Toolkit was closed.
      if (isRunning === false && (seenRunning || resumed || i >= 3)) break
      if (Date.now() - job.startedAt > MAX_MINUTES * 60000) throw new Error(`SFMC was still running the query after ${MAX_MINUTES} minutes. Try again later.`)
    }
    results[scope] = await readRows(stack, job.ids.deKey, api)
    await saveJob(scope, { ...job, status: 'done', error: null, finishedAt: Date.now() })
  } catch (e) {
    await saveJob(scope, { ...job, status: 'error', error: e.message, finishedAt: Date.now() })
  } finally {
    polling.delete(scope)
  }
  onDone?.(jobs[scope])
}

async function readRows(stack, deKey, api) {
  const data = await api.fetchDERows(stack, deKey, 1, 2500)
  return (data.items || []).map((item) => ({ ...(item.keys || {}), ...(item.values || {}) }))
}

/** The last counts of a finished job, read from its data extension (once per session). */
export async function loadResults(stack, accountId, { api: overrides } = {}) {
  await loadJobs()
  const scope = scopeOf(stack, accountId)
  const job = jobs[scope]
  if (results[scope] || !job?.ids?.deKey || !job.finishedAt) return results[scope] || null
  try {
    results[scope] = await readRows(stack, job.ids.deKey, { ...API, ...overrides })
  } catch (e) {
    if (!gone(e)) throw e
    // The data extension was deleted (Settings > Clean up): the next Refresh makes a new one.
    results[scope] = null
  }
  return results[scope]
}

/** For tests. */
export function _reset() {
  for (const k of Object.keys(jobs)) delete jobs[k]
  for (const k of Object.keys(results)) delete results[k]
  polling.clear(); loaded = null
}
