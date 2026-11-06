import { describe, it, expect, vi, beforeEach } from 'vitest'

// Feedback #1081: Run Query's data extensions and Query activities are deleted after 7 days.
const deleted = []
let missing = new Set()
vi.mock('../sfmcApi.js', () => {
  const del = (kind) => async (stack, id) => {
    if (missing.has(id)) throw Object.assign(new Error('SFMC API error 404: not found'), { status: 404 })
    if (id === 'boom') throw Object.assign(new Error('SFMC API error 500'), { status: 500 })
    deleted.push(`${kind}:${stack}:${id}`)
  }
  return { deleteDE: del('de'), deleteQueryActivity: del('act') }
})

let store
global.chrome = {
  storage: { local: {
    get: (keys, cb) => cb(keys === null ? { ...store } : Object.fromEntries([].concat(keys).map((k) => [k, store[k]]))),
    set: (items, cb) => { Object.assign(store, items); cb?.() },
  } },
}

const DAY = 86400000
const NOW = Date.UTC(2026, 10, 6)
const run = (id, daysAgo, extra = {}) => ({
  runId: id, runAt: NOW - daysAgo * DAY, stack: 's13', queryText: 'select 1',
  deId: `de-${id}`, deKey: `key-${id}`, deName: `SFMCQS_sql_${id}`, activityId: `act-${id}`, activityName: `SFMCQS_act_${id}`, ...extra,
})

describe('Delete old runs from SFMC (feedback #1081)', () => {
  beforeEach(() => { deleted.length = 0; missing = new Set(); store = {} })

  it('picks runs older than the limit on this stack, with SFMCQS_ names, not ids a newer run uses', async () => {
    const { expiredRuns } = await import('../runCleanup.js')
    store = {
      sql_1: { id: 'sql_1', runs: [run('new', 2), run('old', 8), run('other', 9, { stack: 's50' })] },
      sql_2: { id: 'sql_2', runs: [run('named', 10, { deName: 'My_DE' }), run('shared', 12), run('reused', 1, { deId: 'de-shared', activityId: 'act-shared' })] },
      notAQuery: { runs: [run('x', 30)] },
    }
    expect(expiredRuns(store, 's13', 7, NOW)).toEqual([
      { queryId: 'sql_1', runId: 'old', deId: 'de-old', activityId: 'act-old' },
      { queryId: 'sql_2', runId: 'named', deId: null, activityId: 'act-named' },
    ])
    expect(expiredRuns(store, 's13', 0, NOW)).toEqual([])
  })

  it('deletes the activity then the data extension, keeps the run in history, once a day', async () => {
    const { cleanUpOldRuns } = await import('../runCleanup.js')
    store = { sql_1: { id: 'sql_1', name: 'Q', runs: [run('new', 2), run('old', 8)] } }
    expect(await cleanUpOldRuns('s13', { now: NOW })).toBe(1)
    expect(deleted).toEqual(['act:s13:act-old', 'de:s13:de-old'])
    const [kept, cleaned] = store.sql_1.runs
    expect(kept.deId).toBe('de-new')
    expect(cleaned).toMatchObject({ runId: 'old', deId: null, deKey: null, activityId: null, cleanedAt: NOW, queryText: 'select 1' })
    expect(store.sql_1.name).toBe('Q')
    store.sql_1.runs.push(run('old2', 9))
    expect(await cleanUpOldRuns('s13', { now: NOW + 1000 })).toBe(0)
    expect(await cleanUpOldRuns('s13', { now: NOW + DAY + 1 })).toBe(1)
  })

  it('counts an object already gone as cleaned up, and keeps what failed for next time', async () => {
    const { cleanUpOldRuns } = await import('../runCleanup.js')
    missing = new Set(['de-old'])
    store = { sql_1: { id: 'sql_1', runs: [run('old', 8), run('fail', 8, { deId: 'boom', activityId: 'boom' })] } }
    expect(await cleanUpOldRuns('s13', { now: NOW })).toBe(1)
    expect(store.sql_1.runs[0]).toMatchObject({ deId: null, activityId: null })
    expect(store.sql_1.runs[1]).toMatchObject({ deId: 'boom', activityId: 'boom' })
    expect(store.sql_1.runs[1].cleanedAt).toBeUndefined()
  })

  it('does nothing when switched off in Settings', async () => {
    const { cleanUpOldRuns } = await import('../runCleanup.js')
    store = { _queryRunCleanupDays: 0, sql_1: { id: 'sql_1', runs: [run('old', 30)] } }
    expect(await cleanUpOldRuns('s13', { now: NOW })).toBe(0)
    expect(deleted).toEqual([])
  })
})
