// Reads Automation overview and Journey overview quietly after the app opens
// (feedback #78), into the page cache the two pages read first (utils/pageCache.js),
// so they show at once. Skips a page read in the last 10 minutes; never shows errors.
import { fetchCurrentBU } from './sfmcApi.js'
import { listAllAutomations, listAllJourneys } from './overview.js'
import { pageCacheKey, readPageCache, writePageCache, pendingPageCache, setPendingPageCache } from './pageCache.js'

export const PRELOAD_MAX_AGE_MS = 10 * 60 * 1000

const JOBS = [
  { page: 'automation-overview', read: listAllAutomations, patch: (list) => ({ list, trends: null }) },
  { page: 'journey-overview', read: listAllJourneys, patch: (list) => ({ list, sends: null }) },
]

/**
 * Reads one overview (`automation-overview` or `journey-overview`) into the page cache
 * unless it was read less than `maxAgeMs` ago. Waits for a read already in progress.
 * Resolves to { list, cached }; throws when SFMC fails (feedback #1037 shows the error).
 */
export async function preloadOverviewPage(stack, buId, page, { now = () => Date.now(), maxAgeMs = PRELOAD_MAX_AGE_MS, onProgress } = {}) {
  const job = JOBS.find((j) => j.page === page)
  if (!job) throw new Error(`Unknown overview: ${page}`)
  const key = pageCacheKey(page, stack, buId)
  const saved = readPageCache(key)
  if (saved?.list && now() - saved.savedAt < maxAgeMs) return { list: saved.list, cached: true }
  const pending = pendingPageCache(key)
  if (pending) {
    await pending
    const after = readPageCache(key)
    if (after?.list) return { list: after.list, cached: false }
  }
  const p = setPendingPageCache(key, job.read(stack, onProgress).then((list) => { writePageCache(key, job.patch(list)) }))
  await p
  return { list: readPageCache(key)?.list || [], cached: false }
}

/** One page after the other; resolves to the pages it read or waited for. */
export async function preloadOverviews(stack, { now = () => Date.now(), maxAgeMs = PRELOAD_MAX_AGE_MS } = {}) {
  if (!stack) return []
  const bu = await fetchCurrentBU(stack).catch(() => null)
  if (!bu) return []
  const read = []
  for (const job of JOBS) {
    const key = pageCacheKey(job.page, stack, bu.accountId)
    const saved = readPageCache(key)
    if (saved?.list && now() - saved.savedAt < maxAgeMs) continue
    // A read already in progress (the idle preload, or Home's own) is waited for, not
    // skipped: Home read the cache right after and showed "—" for journeys while the
    // other read was still going (live test, 2026-11-08).
    const p = pendingPageCache(key) || setPendingPageCache(key, job.read(stack).then((list) => { writePageCache(key, job.patch(list)) }))
    try { await p; read.push(job.page) } catch { /* quiet: the page reads again when opened */ }
  }
  return read
}

// Runs once per app tab, when the browser is idle.
let started = false
export function preloadWhenIdle(stack) {
  if (started || !stack) return
  started = true
  const run = () => { preloadOverviews(stack).catch(() => undefined) }
  if (typeof requestIdleCallback === 'function') requestIdleCallback(run, { timeout: 10000 })
  else setTimeout(run, 3000)
}
