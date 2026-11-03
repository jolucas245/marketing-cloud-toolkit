// Load everything in the connection menu (feedback #1037): the parts it reads, one
// after another, into the caches the pages already use. Nothing is written to a file.
// Pure helpers for the status text, counts, times and the "Loaded N of M" summary;
// the reading itself is in composables/usePreload.js.

// kind: 'overview' (utils/pageCache.js via preloadOverviews.js), 'usage' (Where used
// saved data, utils/usage/store.js), 'sharedDEs' (Shared and Synchronized catalog in
// sfmcApi.js), 'deDetails' (deApi.js field and folder caches).
export const PRELOAD_STEPS = [
  { id: 'automationOverview', kind: 'overview', page: 'automation-overview', label: 'Automation overview', noun: ['automation', 'automations'], usedBy: 'Automation overview and Home' },
  { id: 'journeyOverview', kind: 'overview', page: 'journey-overview', label: 'Journey overview', noun: ['journey', 'journeys'], usedBy: 'Journey overview and Home' },
  { id: 'automations', kind: 'usage', label: 'Automations and their steps', noun: ['automation', 'automations'], usedBy: 'Where used' },
  { id: 'emailsends', kind: 'usage', label: 'Send Email activities', noun: ['Send Email activity', 'Send Email activities'], usedBy: 'Where used' },
  { id: 'queries', kind: 'usage', label: 'SQL Query activities', noun: ['query activity', 'query activities'], usedBy: 'Where used' },
  { id: 'imports', kind: 'usage', label: 'Import activities', noun: ['import', 'imports'], usedBy: 'Where used' },
  { id: 'filters', kind: 'usage', label: 'Filter activities', noun: ['filter', 'filters'], usedBy: 'Where used' },
  { id: 'dataextracts', kind: 'usage', label: 'Data Extract activities', noun: ['data extract', 'data extracts'], usedBy: 'Where used' },
  { id: 'filetransfers', kind: 'usage', label: 'File Transfer activities', noun: ['file transfer', 'file transfers'], usedBy: 'Where used' },
  { id: 'scripts', kind: 'usage', label: 'Script activities', noun: ['script', 'scripts'], usedBy: 'Where used' },
  { id: 'journeys', kind: 'usage', label: 'Journeys and their activities', noun: ['journey', 'journeys'], usedBy: 'Where used' },
  { id: 'events', kind: 'usage', label: 'Journey entry events', noun: ['entry event', 'entry events'], usedBy: 'Where used' },
  { id: 'locations', kind: 'usage', label: 'File locations', noun: ['file location', 'file locations'], usedBy: 'Where used' },
  { id: 'assets', kind: 'usage', label: 'Emails, templates, content blocks and CloudPages', noun: ['item', 'items'], usedBy: 'Where used' },
  { id: 'sharedDEs', kind: 'sharedDEs', label: 'Shared and Synchronized data extensions', noun: ['data extension', 'data extensions'], usedBy: 'Data Extensions, Query Builder and Run Query searches' },
  { id: 'deDetails', kind: 'deDetails', label: 'Data extension fields and folders', noun: ['data extension', 'data extensions'], usedBy: 'Data Extensions, Run Query schema, Where used and Save dialogs' },
]

// waiting | running | done | failed | stopped
export function emptyStepState() {
  return { state: 'waiting', done: 0, total: 0, count: null, capped: false, cached: false, note: '', message: '', ms: null, finishedAt: null }
}

export const plural = (n, [one, many]) => `${Number(n).toLocaleString('en-US')} ${n === 1 ? one : many}`

/** "326 data extensions", "120 of 326" while loading, "" when nothing is known. */
export function countText(step, s) {
  if (!s) return ''
  if (s.state === 'running') return s.total ? `${Number(s.done).toLocaleString('en-US')} of ${Number(s.total).toLocaleString('en-US')}` : ''
  if (s.state !== 'done' || s.count == null) return ''
  const shown = plural(s.count, step.noun)
  return s.capped && s.total > s.count ? `${shown} (first ${Number(s.count).toLocaleString('en-US')} of ${Number(s.total).toLocaleString('en-US')})` : shown
}

/** 850 ms, 1.2 s, 2 min 5 s. */
export function durationText(ms) {
  if (ms == null || !Number.isFinite(ms)) return ''
  if (ms < 1000) return `${Math.max(0, Math.round(ms))} ms`
  if (ms < 60000) return `${(ms / 1000).toFixed(1)} s`
  const m = Math.floor(ms / 60000)
  const s = Math.round((ms % 60000) / 1000)
  return s ? `${m} min ${s} s` : `${m} min`
}

/** Counts for the bar and the "Loaded N of M" line. `states` maps step id to state. */
export function preloadSummary(states, steps = PRELOAD_STEPS) {
  const list = steps.map((st) => states?.[st.id]?.state || 'waiting')
  const loaded = list.filter((x) => x === 'done').length
  const failed = list.filter((x) => x === 'failed').length
  const stopped = list.filter((x) => x === 'stopped').length
  const total = steps.length
  const finished = loaded + failed
  let text = `Loaded ${loaded} of ${total}`
  if (failed) text += `, ${failed} failed`
  if (stopped) text += ', stopped'
  return { loaded, failed, stopped, finished, total, percent: total ? Math.round((100 * finished) / total) : 0, text }
}

/** Whether a part that finished at `finishedAt` can be kept by Load everything. */
export const STEP_FRESH_MS = 10 * 60 * 1000
export function stepIsFresh(s, now = Date.now(), maxAgeMs = STEP_FRESH_MS) {
  return s?.state === 'done' && s.finishedAt != null && now - s.finishedAt < maxAgeMs
}

/** Key for the state: the same stack serves several business units. */
export const scopeKey = (stack, buId) => (stack ? `${stack}:${buId ?? ''}` : '')
