// Background jobs in the app tab (feedback #1092): long processes such as Email
// validation run outside the page that started them, so the user can move to another
// Toolkit page in the same tab. Closing or reloading the tab stops them.
//
// Pure parts: the history entry kept in chrome.storage.local (small metadata only,
// never result rows or email addresses), the list trimming, and how an entry reads.
// The runner itself is composables/useJobs.js.

export const JOB_HISTORY_KEY = 'toolkit_job_history'
export const MAX_HISTORY = 50
// A running job writes its entry again every HEARTBEAT_MS; an entry still marked
// running with no heartbeat for STALE_MS belonged to a tab that was closed or reloaded.
export const HEARTBEAT_MS = 15000
export const STALE_MS = 60000
const TEXT_MAX = 300

export const STATUS_LABEL = {
  running: 'Running',
  done: 'Finished',
  stopped: 'Stopped',
  failed: 'Failed',
  interrupted: 'Stopped (tab closed)',
}

// Anything shaped like an email address, so no address reaches the stored history or a
// notification even when an error message quotes one.
const EMAIL_RE = /[^\s@<>"'(),;:[\]]+@[^\s@<>"'(),;:[\]]+/g
export const maskEmails = (s) => String(s ?? '').replace(EMAIL_RE, '[email address]')

const cut = (s, n = TEXT_MAX) => {
  const t = maskEmails(s).trim()
  return t.length > n ? `${t.slice(0, n - 1)}…` : t
}

export function newJobId(now = Date.now()) {
  return `${now.toString(36)}${Math.random().toString(36).slice(2, 7)}`
}

/** The route of a job's page with the job's id, e.g. /email-validation?job=abc. */
export function jobRoute(path, id) {
  const p = String(path || '/').startsWith('/') ? String(path || '/') : `/${path}`
  return `${p}${p.includes('?') ? '&' : '?'}job=${encodeURIComponent(id)}`
}

/** What is stored for a job: no rows, no addresses, text cut short. */
export function historyEntry(job, now = Date.now()) {
  return {
    id: String(job.id),
    kind: String(job.kind || ''),
    title: cut(job.title, 120),
    route: String(job.route || ''),
    status: job.status || 'running',
    startedAt: job.startedAt || now,
    finishedAt: job.finishedAt || null,
    heartbeat: now,
    progress: { done: Number(job.progress?.done) || 0, total: Number(job.progress?.total) || 0 },
    summary: cut(job.summary),
    error: cut(job.error),
  }
}

/** `list` with `entry` added or replaced (by id), newest start first, at most `max`. */
export function upsertHistory(list, entry, max = MAX_HISTORY) {
  const rest = (Array.isArray(list) ? list : []).filter((e) => e && e.id !== entry.id)
  return [entry, ...rest].sort((a, b) => (b.startedAt || 0) - (a.startedAt || 0)).slice(0, max)
}

/**
 * The status to show: a stored "running" entry that is not running in this tab and has
 * had no heartbeat for STALE_MS is shown as interrupted (its tab was closed).
 */
export function displayStatus(entry, { now = Date.now(), liveIds = new Set() } = {}) {
  if (entry?.status !== 'running') return entry?.status || 'done'
  if (liveIds.has(entry.id)) return 'running'
  return now - (entry.heartbeat || entry.startedAt || 0) > STALE_MS ? 'interrupted' : 'running'
}

/** "2 min 5 s", "45 s", or '' without a start. */
export function durationText(startedAt, finishedAt, now = Date.now()) {
  if (!startedAt) return ''
  const s = Math.max(0, Math.round(((finishedAt || now) - startedAt) / 1000))
  if (s < 60) return `${s} s`
  const m = Math.floor(s / 60)
  if (m < 60) return `${m} min${s % 60 ? ` ${s % 60} s` : ''}`
  return `${Math.floor(m / 60)} h ${m % 60} min`
}

/** "120 of 500", or '' when there is no total. */
export function progressText(p) {
  if (!p?.total) return p?.done ? `${Number(p.done).toLocaleString()}` : ''
  return `${Number(p.done || 0).toLocaleString()} of ${Number(p.total).toLocaleString()}`
}

/** The in-app and Chrome notification text for a finished job. */
export function finishText(job) {
  const what = cut(job.title, 120)
  if (job.status === 'failed') return { title: `${what} failed`, message: cut(job.error) || 'See Activity history for details.' }
  if (job.status === 'stopped') return { title: `${what} stopped`, message: cut(job.summary) || 'Stopped before the end.' }
  return { title: `${what} finished`, message: cut(job.summary) || 'Done.' }
}

/**
 * The list the Activity history page shows: this tab's jobs (live) first replace their
 * stored entry, then the stored ones from other tabs and earlier sessions.
 */
export function mergeHistory(live = [], stored = [], now = Date.now()) {
  const byId = new Map()
  for (const e of stored || []) if (e?.id) byId.set(e.id, { ...e, live: false })
  for (const j of live || []) byId.set(j.id, { ...historyEntry(j, now), live: true })
  return [...byId.values()].sort((a, b) => (b.startedAt || 0) - (a.startedAt || 0)).slice(0, MAX_HISTORY)
}
