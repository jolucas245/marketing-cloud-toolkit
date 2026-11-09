// Background jobs for the whole app tab (feedback #1092). A job started here keeps
// running when the user moves to another Toolkit page in the same tab, because it lives
// in this module, not in the page component. Closing or reloading the tab stops it
// (the tab asks first while one runs).
//
// What is kept:
// - this tab's jobs, with their results (`job.data`), in memory until the tab closes;
//   only the last KEEP_DATA finished jobs keep their data;
// - a history entry per job in chrome.storage.local (`toolkit_job_history`, last 50):
//   what, when, status, progress and a short summary. Never rows or email addresses
//   (utils/jobs.js historyEntry masks them).
//
// When a job ends: a message in the message bar with a link back to its page (unless the
// user is on that page), an entry in the bell, and a Chrome notification when the
// optional notifications permission is already granted (background/jobNotify.js).
import { computed, reactive, ref } from 'vue'
import {
  JOB_HISTORY_KEY, HEARTBEAT_MS, historyEntry, upsertHistory, newJobId, jobRoute, finishText,
} from '@/utils/jobs.js'
import { showToast } from '@/composables/useToast.js'
import { sendToBackground } from '@/utils/messaging.js'

export const KEEP_DATA = 5

/** This tab's jobs, newest first. */
export const jobs = reactive([])
/** The stored history (all tabs), newest first. */
export const jobHistory = ref([])

export const runningJobs = computed(() => jobs.filter((j) => j.status === 'running'))
/** Finished jobs the user has not seen yet (the bell's count). */
export const unseenJobs = computed(() => jobs.filter((j) => j.status !== 'running' && !j.seen))

export const findJob = (id) => jobs.find((j) => j.id === id) || null
export const latestJob = (kind) => jobs.find((j) => j.kind === kind) || null

export function markJobsSeen() {
  for (const j of jobs) if (j.status !== 'running') j.seen = true
}

// ── Stored history ──
let writing = Promise.resolve()
function persist(job) {
  writing = writing.then(async () => {
    try {
      const r = await chrome.storage.local.get(JOB_HISTORY_KEY)
      const list = upsertHistory(r?.[JOB_HISTORY_KEY], historyEntry(job))
      await chrome.storage.local.set({ [JOB_HISTORY_KEY]: list })
      jobHistory.value = list
    } catch { /* not in an extension, or storage unavailable */ }
  })
  return writing
}

let listening = false
export async function loadJobHistory() {
  try {
    const r = await chrome.storage.local.get(JOB_HISTORY_KEY)
    jobHistory.value = r?.[JOB_HISTORY_KEY] || []
    if (!listening) {
      listening = true
      chrome.storage.onChanged.addListener((c, area) => {
        if (area === 'local' && JOB_HISTORY_KEY in c) jobHistory.value = c[JOB_HISTORY_KEY].newValue || []
      })
    }
  } catch { jobHistory.value = [] }
  return jobHistory.value
}

/** Removes stored entries, except jobs still running in this tab. */
export async function clearJobHistory() {
  const keep = jobHistory.value.filter((e) => runningJobs.value.some((j) => j.id === e.id))
  writing = writing.then(async () => {
    try { await chrome.storage.local.set({ [JOB_HISTORY_KEY]: keep }) } catch { /* ignore */ }
    jobHistory.value = keep
  })
  return writing
}

// ── Where the user is ──
const currentPath = () => {
  try { return String(window.location.hash || '').replace(/^#/, '').split('?')[0] } catch { return '' }
}
const pathOf = (route) => String(route || '').split('?')[0]
const pageVisible = () => {
  try { return document.visibilityState !== 'hidden' } catch { return true }
}

function announce(job) {
  const onPage = currentPath() === pathOf(job.route)
  if (onPage) job.seen = true
  const { title, message } = finishText(job)
  if (!onPage) {
    showToast(`${title}. ${message}`, 12000, {
      kind: job.status === 'failed' ? 'error' : job.status === 'done' ? 'success' : 'info',
      action: { label: 'Open results', to: job.route },
    })
  }
  // A Chrome notification when the user is not looking at the results. The service
  // worker shows it only when the optional notifications permission is granted.
  if (!onPage || !pageVisible()) sendToBackground({ type: 'JOB_NOTIFY', title, message, path: job.route })
}

// Older finished jobs drop their data (results), to keep memory in check.
function trimData() {
  let finished = 0
  for (const j of jobs) {
    if (j.status === 'running') continue
    finished++
    if (finished > KEEP_DATA && j.data) { j.data = null; j.dataDropped = true }
  }
}

/**
 * Starts a job. `run(job)` does the work and may return a short summary (no email
 * addresses); it reads `job.stopRequested` to stop early and updates `job.progress`
 * ({ done, total, stage }) and `job.data` as it goes. Returns the reactive job.
 * `path` is the page to come back to; the job's route adds `?job=<id>`.
 */
export function startJob({ kind, title, path, data = {}, run }) {
  const id = newJobId()
  const job = reactive({
    id, kind, title, route: jobRoute(path, id), status: 'running',
    startedAt: Date.now(), finishedAt: null,
    progress: { done: 0, total: 0, stage: '' },
    summary: '', error: '', stopRequested: false, seen: false, data,
  })
  jobs.unshift(job)
  persist(job)
  const beat = setInterval(() => persist(job), HEARTBEAT_MS)
  job.done = Promise.resolve()
    .then(() => run(job))
    .then((summary) => {
      if (typeof summary === 'string' && summary) job.summary = summary
      job.status = job.stopRequested ? 'stopped' : 'done'
    })
    .catch((e) => {
      job.error = e?.message || String(e)
      job.status = job.stopRequested ? 'stopped' : 'failed'
    })
    .finally(() => {
      clearInterval(beat)
      job.finishedAt = Date.now()
      trimData()
      persist(job)
      announce(job)
    })
  return job
}

export function stopJob(job) {
  if (job && job.status === 'running') job.stopRequested = true
}

// Closing or reloading the tab ends every job: ask first while one runs.
try {
  window.addEventListener('beforeunload', (e) => {
    if (!runningJobs.value.length) return
    e.preventDefault()
    e.returnValue = ''
  })
} catch { /* no window */ }

/** For tests: forget this tab's jobs. */
export function _resetJobs() {
  jobs.splice(0)
  jobHistory.value = []
}

export function useJobs() {
  return { jobs, jobHistory, runningJobs, unseenJobs, startJob, stopJob, findJob, latestJob, markJobsSeen, loadJobHistory, clearJobHistory }
}
