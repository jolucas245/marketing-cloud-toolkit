// Load everything (feedback #1037): reads the parts in utils/preloadSteps.js one after
// another into the caches the pages already read first, so pages, searches and Where
// used open without a wait. Nothing is written to a file and nothing is downloaded.
// The state lives at module level (one per app tab), so it survives the connection
// menu closing. It belongs to one stack and business unit: when either changes, it
// starts again from nothing. A part that fails is marked failed with its message and
// the next part still runs; Stop ends the run after the current request batch.
import { reactive } from 'vue'
import { PRELOAD_STEPS, emptyStepState, scopeKey, stepIsFresh } from '@/utils/preloadSteps.js'
import { fetchCurrentBU, searchSharedDEs, clearSharedDECache } from '@/utils/sfmcApi.js'
import { searchLocalDEs, searchSharedSyncDEs, fetchDEFieldList, fetchDEFolderPath, clearDECaches } from '@/utils/deApi.js'
import { preloadOverviewPage } from '@/utils/preloadOverviews.js'
import { preloadUsageSource, StoppedError } from '@/utils/usage/index.js'
import { runInBatches } from '@/utils/batchRunner.js'

const BATCH = 10
const MAX_DE_PAGES = 100 // 5,000 local data extensions (50 a page)

const freshSteps = () => Object.fromEntries(PRELOAD_STEPS.map((s) => [s.id, emptyStepState()]))

export const preloadState = reactive({
  scope: '', // stack:buId
  stack: null,
  buId: null,
  buName: '',
  running: false,
  notice: '',
  steps: freshSteps(),
})

let runId = 0
let stopRequested = false
const msg = (e) => e?.message || String(e)

/** Starts again from nothing when the stack or business unit is not the one the state is for. */
export function syncScope(stack, bu) {
  const key = scopeKey(stack, bu?.accountId)
  if (key === preloadState.scope) return false
  if (preloadState.running) { runId++; stopRequested = true; preloadState.running = false }
  Object.assign(preloadState, { scope: key, stack: stack || null, buId: bu?.accountId ?? null, buName: bu?.name || '', notice: '', steps: freshSteps() })
  return true
}

// ── Parts ─────────────────────────────────────────────────
// ctx = { stack, buId, force, stop(), progress(done, total) }; each returns
// { count, total?, capped?, cached?, note? }.

async function loadDEDetails(ctx) {
  const { stack, stop, progress, force } = ctx
  if (force) clearDECaches()
  const local = []
  let total = 0
  for (let page = 1; page <= MAX_DE_PAGES; page++) {
    if (stop()) throw new StoppedError()
    const r = await searchLocalDEs(stack, '', page)
    total = r.total
    local.push(...r.items)
    progress(local.length, total)
    if (!r.fetched || local.length >= total) break
  }
  const capped = local.length < total
  const shared = await searchSharedSyncDEs(stack, '').catch(() => [])
  const ids = new Set(local.map((d) => String(d.id)))
  const all = [...local, ...shared.filter((d) => !ids.has(String(d.id)))]
  let failed = 0
  await runInBatches(all, BATCH, async (de) => {
    try { await fetchDEFieldList(stack, de.id) } catch { failed++ }
  }, { shouldStop: stop, onProgress: (d, t) => progress(d, t) })
  if (stop()) throw new StoppedError()
  const cats = [...new Set(all.map((d) => d.categoryId).filter((c) => c != null && c !== ''))]
  await runInBatches(cats, BATCH, (c) => fetchDEFolderPath(stack, c).catch(() => ''), { shouldStop: stop })
  if (stop()) throw new StoppedError()
  return { count: all.length, total: total + all.length - local.length, capped, note: failed ? `fields of ${failed} could not be read` : '' }
}

const RUNNERS = {
  async overview(step, ctx) {
    const r = await preloadOverviewPage(ctx.stack, ctx.buId, step.page, { maxAgeMs: ctx.force ? 0 : undefined, onProgress: ctx.progress })
    return { count: r.list.length, cached: r.cached }
  },
  async usage(step, ctx) {
    const r = await preloadUsageSource(ctx.stack, ctx.buId, step.id, { force: ctx.force, shouldStop: ctx.stop, progress: ctx.progress })
    const v = r.value || {}
    return { count: v.items?.length ?? 0, total: v.total ?? v.items?.length ?? 0, capped: !!v.capped, cached: r.cached, note: r.note }
  },
  async sharedDEs(step, ctx) {
    if (ctx.force) clearSharedDECache(ctx.stack)
    const list = await searchSharedDEs(ctx.stack, '')
    return { count: list.length }
  },
  deDetails: (step, ctx) => loadDEDetails(ctx),
}

async function runStep(step, { stack, buId, force, id }) {
  const s = preloadState.steps[step.id]
  Object.assign(s, emptyStepState(), { state: 'running' })
  const started = Date.now()
  const ctx = {
    stack, buId, force,
    stop: () => stopRequested || id !== runId,
    progress: (done, total) => { if (id === runId) { s.done = done || 0; s.total = total || 0 } },
  }
  try {
    const r = await RUNNERS[step.kind](step, ctx)
    if (id !== runId) return
    Object.assign(s, { state: 'done', count: r.count, total: r.total ?? r.count, capped: !!r.capped, cached: !!r.cached, note: r.cached ? 'already loaded' : r.note || '' })
  } catch (e) {
    if (id !== runId) return
    if (e?.stopped || stopRequested) Object.assign(s, { state: 'stopped', message: 'Stopped.' })
    else Object.assign(s, { state: 'failed', message: msg(e) })
  } finally {
    if (id === runId) { s.ms = Date.now() - started; s.finishedAt = Date.now() }
  }
}

/**
 * Loads every part. Without `force`, a part loaded in the last 10 minutes is kept and
 * each cache's own freshness rules apply; with `force` (Refresh) everything is read
 * again from SFMC.
 */
export async function loadEverything(stack, { force = false } = {}) {
  if (!stack || preloadState.running) return
  const bu = await fetchCurrentBU(stack).catch(() => null)
  syncScope(stack, bu)
  if (!bu) { preloadState.notice = 'Could not read the business unit. Check the connection and try again.'; return }
  const id = ++runId
  stopRequested = false
  preloadState.running = true
  preloadState.notice = ''
  const now = Date.now()
  const todo = PRELOAD_STEPS.filter((st) => force || !stepIsFresh(preloadState.steps[st.id], now))
  for (const st of todo) Object.assign(preloadState.steps[st.id], emptyStepState())
  try {
    for (const step of todo) {
      if (id !== runId) return
      if (stopRequested) { Object.assign(preloadState.steps[step.id], { state: 'stopped', message: 'Stopped.' }); continue }
      // The business unit can change in SFMC while this runs: the caches are per BU.
      if (step !== todo[0]) {
        const cur = await fetchCurrentBU(stack).catch(() => bu)
        if (scopeKey(stack, cur?.accountId) !== preloadState.scope) {
          syncScope(stack, cur)
          preloadState.notice = `The business unit changed${cur?.name ? ` to ${cur.name}` : ''}. Load everything again for it.`
          return
        }
      }
      await runStep(step, { stack, buId: bu.accountId, force, id })
    }
  } finally {
    if (id === runId) preloadState.running = false
  }
}

export function stopPreload() {
  if (preloadState.running) stopRequested = true
}

export function usePreload() {
  return { state: preloadState, loadEverything, refresh: (stack) => loadEverything(stack, { force: true }), stop: stopPreload, syncScope }
}
