import { describe, it, expect, vi, beforeEach } from 'vitest'

const calls = { bu: { accountId: 7, name: 'BU A' }, overview: [], usage: [], shared: 0, clearedShared: 0, clearedDE: 0, fields: 0, failUsage: null, gate: null }

vi.mock('@/utils/sfmcApi.js', () => ({
  fetchCurrentBU: async () => calls.bu,
  searchSharedDEs: async () => { calls.shared++; return [{ id: 's1' }, { id: 's2' }] },
  clearSharedDECache: () => { calls.clearedShared++ },
}))
vi.mock('@/utils/deApi.js', () => ({
  searchLocalDEs: async (stack, q, page) => ({ items: page === 1 ? [{ id: 'd1', categoryId: 5 }, { id: 'd2', categoryId: 5 }] : [], total: 2, fetched: page === 1 ? 2 : 0 }),
  searchSharedSyncDEs: async () => [{ id: 's1', categoryId: 9 }],
  fetchDEFieldList: async (stack, id) => { calls.fields++; if (id === 'd2') throw new Error('no'); return [] },
  fetchDEFolderPath: async () => 'Data Extensions',
  clearDECaches: () => { calls.clearedDE++ },
}))
vi.mock('@/utils/preloadOverviews.js', () => ({
  preloadOverviewPage: async (stack, buId, page, opts) => { calls.overview.push({ page, buId, maxAgeMs: opts.maxAgeMs }); return { list: [1, 2, 3], cached: false } },
}))
vi.mock('@/utils/usage/index.js', () => {
  class StoppedError extends Error { constructor() { super('Stopped.'); this.stopped = true } }
  return {
    StoppedError,
    preloadUsageSource: async (stack, buId, id, opts) => {
      calls.usage.push({ id, force: opts.force })
      if (calls.gate && id === 'queries') await calls.gate
      if (calls.failUsage === id) throw new Error('SFMC API error 500: down')
      if (opts.shouldStop()) throw new StoppedError()
      return { value: { items: [{}, {}], total: 2 }, cached: false, note: '' }
    },
  }
})

const { usePreload, preloadState, syncScope } = await import('../usePreload.js')
const { preloadSummary } = await import('@/utils/preloadSteps.js')

describe('usePreload (feedback #1037)', () => {
  beforeEach(() => {
    Object.assign(calls, { bu: { accountId: 7, name: 'BU A' }, overview: [], usage: [], shared: 0, clearedShared: 0, clearedDE: 0, fields: 0, failUsage: null, gate: null })
    syncScope('reset', null)
  })

  it('loads every part one after another; a failing part does not stop the others', async () => {
    calls.failUsage = 'imports'
    const p = usePreload()
    await p.loadEverything('s10')
    const st = preloadState.steps
    expect(st.automationOverview).toMatchObject({ state: 'done', count: 3 })
    expect(st.imports).toMatchObject({ state: 'failed', message: 'SFMC API error 500: down' })
    expect(st.scripts).toMatchObject({ state: 'done', count: 2 })
    expect(st.sharedDEs).toMatchObject({ state: 'done', count: 2 })
    expect(st.deDetails).toMatchObject({ state: 'done', count: 3, note: 'fields of 1 could not be read' })
    expect(typeof st.deDetails.ms).toBe('number')
    expect(preloadSummary(st)).toMatchObject({ failed: 1, loaded: Object.keys(st).length - 1 })
    expect(preloadState.scope).toBe('s10:7')
    expect(calls.overview.every((o) => o.buId === 7)).toBe(true)
    expect(preloadState.running).toBe(false)
  })

  it('keeps fresh parts on Load everything and reads all again on Refresh', async () => {
    const p = usePreload()
    await p.loadEverything('s10')
    calls.usage = []
    calls.overview = []
    await p.loadEverything('s10')
    expect(calls.usage).toEqual([])
    await p.refresh('s10')
    expect(calls.usage.length).toBeGreaterThan(5)
    expect(calls.usage.every((u) => u.force)).toBe(true)
    expect(calls.overview.every((o) => o.maxAgeMs === 0)).toBe(true)
    expect(calls.clearedShared).toBe(1)
    expect(calls.clearedDE).toBe(1)
  })

  it('Stop marks the rest as stopped', async () => {
    let release
    calls.gate = new Promise((r) => { release = r })
    const p = usePreload()
    const run = p.loadEverything('s10')
    await vi.waitFor(() => expect(preloadState.steps.queries.state).toBe('running'))
    p.stop()
    release()
    await run
    expect(preloadState.steps.queries.state).toBe('stopped')
    expect(preloadState.steps.deDetails.state).toBe('stopped')
    expect(preloadState.steps.automations.state).toBe('done')
    expect(preloadSummary(preloadState.steps).text).toMatch(/stopped$/)
  })

  it('starts again from nothing when the business unit changes', async () => {
    const p = usePreload()
    await p.loadEverything('s10')
    expect(preloadState.steps.queries.state).toBe('done')
    expect(syncScope('s10', { accountId: 7, name: 'BU A' })).toBe(false)
    expect(syncScope('s10', { accountId: 8, name: 'BU B' })).toBe(true)
    expect(preloadState.steps.queries.state).toBe('waiting')
    expect(preloadState.buName).toBe('BU B')
  })

  it('stops when the business unit changes while loading', async () => {
    let release
    calls.gate = new Promise((r) => { release = r })
    const run = usePreload().loadEverything('s10')
    await vi.waitFor(() => expect(preloadState.steps.queries.state).toBe('running'))
    calls.bu = { accountId: 8, name: 'BU B' }
    release()
    await run
    expect(preloadState.scope).toBe('s10:8')
    expect(preloadState.notice).toMatch(/changed to BU B/)
    expect(preloadState.running).toBe(false)
    expect(preloadState.steps.queries.state).toBe('waiting')
  })
})
