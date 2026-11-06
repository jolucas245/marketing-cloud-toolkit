import { describe, it, expect, vi, beforeEach } from 'vitest'

// Feedback #1080: publication list counts by status, read asynchronously with SQL.
const toasts = []
vi.mock('@/composables/useToast.js', () => ({ showToast: (m, ms, o) => toasts.push({ m, kind: o?.kind }) }))

let store
global.chrome = {
  storage: { local: {
    get: (k, cb) => cb(k === null ? { ...store } : { [k]: store[k] }),
    set: (items, cb) => { Object.assign(store, JSON.parse(JSON.stringify(items))); cb?.() },
  } },
}

const ROWS = [
  { keys: {}, values: { listname: 'News', status: 'active', subscribercount: '10' } },
  { keys: {}, values: { listname: 'News', status: 'unsubscribed', subscribercount: '2' } },
  { keys: {}, values: { listname: 'Events', status: 'held', subscribercount: '3' } },
  { keys: {}, values: { listname: 'Events', status: 'deleted', subscribercount: '1' } },
]

function fakeApi({ running = 2, deGone = false } = {}) {
  const calls = []
  let polls = 0
  const api = {
    wait: async () => {},
    getOrCreateDEFolder: async () => 11,
    getOrCreateQAFolder: async () => 22,
    createTargetDE: async (stack, p) => { calls.push(['createDE', p.name, p.fields.map((f) => f.name)]); return { id: 'de1', customerKey: 'KEY1', name: p.name } },
    createQueryActivity: async (stack, p) => { calls.push(['createQA', p.queryText.includes('_ListSubscribers'), p.targetKey]); return { queryDefinitionId: 'qa1' } },
    deleteQueryActivity: async (stack, id) => { calls.push(['deleteQA', id]) },
    startQueryActivity: async (stack, id) => { calls.push(['start', id]) },
    getQueryActivityStatus: async () => ({ isRunning: polls++ < running }),
    fetchDERows: async (stack, key, page, size) => {
      if (size === 1) { calls.push(['check', key]); if (deGone) throw Object.assign(new Error('SFMC API error 404'), { status: 404 }); return { items: [] } }
      return { items: ROWS }
    },
  }
  return { api, calls }
}

describe('Publication Lists (feedback #1080)', () => {
  beforeEach(async () => {
    store = {}
    toasts.length = 0
    const m = await import('../publicationLists.js')
    m._reset()
  })

  it('pivots the rows into one per list, statuses as columns, with a total', async () => {
    const { pivotSummary } = await import('../publicationLists.js')
    const { columns, rows } = pivotSummary(ROWS.map((r) => r.values))
    expect(columns).toEqual(['List', 'Active', 'Unsubscribed', 'Held', 'Bounced', 'Deleted', 'Total'])
    expect(rows).toEqual([
      { List: 'News', Active: 10, Unsubscribed: 2, Held: 0, Bounced: 0, Deleted: 0, Total: 12 },
      { List: 'Events', Active: 0, Unsubscribed: 0, Held: 3, Bounced: 0, Deleted: 1, Total: 4 },
    ])
  })

  it('creates the DE and Query Activity, runs it, stores the rows and says so', async () => {
    const { requestSummary, jobs, results, scopeOf } = await import('../publicationLists.js')
    const { api, calls } = fakeApi()
    const started = await requestSummary('s13', 123, { api })
    expect(started.status).toBe('running')
    await vi.waitFor(() => expect(jobs[scopeOf('s13', 123)].status).toBe('done'))
    expect(calls[0]).toEqual(['createDE', expect.stringMatching(/^SFMCQS_publist_/), ['ListName', 'Status', 'SubscriberCount']])
    expect(calls.slice(1)).toEqual([['createQA', true, 'KEY1'], ['start', 'qa1']])
    expect(store._publicationLists['s13:123']).toMatchObject({ status: 'done', ids: { deKey: 'KEY1', activityId: 'qa1' } })
    // The counts stay in SFMC's data extension; only the job's status and ids are stored.
    expect(store._publicationLists['s13:123'].rows).toBeUndefined()
    expect(results[scopeOf('s13', 123)]).toHaveLength(4)
    expect(toasts).toEqual([{ m: expect.stringContaining('Publication list counts are ready'), kind: 'success' }])
  })

  it('reuses the DE and Query Activity, and makes new ones when the DE is gone', async () => {
    const { requestSummary, jobs, scopeOf } = await import('../publicationLists.js')
    store._publicationLists = { 's13:123': { status: 'done', ids: { deId: 'old', deKey: 'OLD', activityId: 'oldqa' }, rows: [] } }
    let { api, calls } = fakeApi()
    await requestSummary('s13', 123, { api })
    await vi.waitFor(() => expect(jobs[scopeOf('s13', 123)].status).toBe('done'))
    expect(calls).toEqual([['check', 'OLD'], ['start', 'oldqa']])

    ;({ api, calls } = fakeApi({ deGone: true }))
    await requestSummary('s13', 123, { api })
    await vi.waitFor(() => expect(jobs[scopeOf('s13', 123)].status).toBe('done'))
    expect(calls.map((c) => c[0])).toEqual(['check', 'deleteQA', 'createDE', 'createQA', 'start'])
  })

  it('picks up a running job after a reload, and reports a failure', async () => {
    const { resumeSummary, requestSummary, jobs, scopeOf } = await import('../publicationLists.js')
    store._publicationLists = { 's13:123': { status: 'running', startedAt: Date.now(), ids: { deKey: 'K', activityId: 'q' } } }
    const { api } = fakeApi({ running: 0 })
    await resumeSummary('s13', 123, { api })
    await vi.waitFor(() => expect(jobs[scopeOf('s13', 123)].status).toBe('done'))

    const failing = { ...fakeApi().api, createTargetDE: async () => { throw new Error('SFMC API error 403: Forbidden') } }
    await requestSummary('s13', 999, { api: failing })
    expect(jobs[scopeOf('s13', 999)]).toMatchObject({ status: 'error', error: 'SFMC API error 403: Forbidden' })
    expect(toasts.at(-1)).toEqual({ m: expect.stringContaining('failed: SFMC API error 403'), kind: 'error' })
  })

  it('reads the last counts from the data extension when the page opens again', async () => {
    const { loadResults, scopeOf, results } = await import('../publicationLists.js')
    store._publicationLists = { 's13:123': { status: 'done', finishedAt: 1, ids: { deKey: 'K', activityId: 'q' } } }
    const { api } = fakeApi()
    expect(await loadResults('s13', 123, { api })).toHaveLength(4)
    expect(results[scopeOf('s13', 123)]).toHaveLength(4)
  })
})
