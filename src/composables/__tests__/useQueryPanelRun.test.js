import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { defineComponent, h } from 'vue'
import { mount, flushPromises } from '@vue/test-utils'

// Run Query through a Query Activity, bugs from the live test, 2026-11-07: names unique
// per run (409 on runs started in the same second, with Contact Builder advice), failed
// runs shown as "Completed · 0 rows", SFMC calls counted across panels, lower-case
// result columns, and the business unit tagged only on the first run.

const sfmc = vi.hoisted(() => ({
  deNames: [],
  actNames: [],
  clashOnce: false,
  runFails: false,
  markerInDE: {},
  bu: { name: 'Mathes Sandbox', accountId: 1 },
}))

vi.mock('@/composables/useToast.js', () => ({ showToast: vi.fn() }))
vi.mock('../useToast.js', () => ({ showToast: vi.fn() }))
vi.mock('../../utils/deApi.js', async (orig) => ({
  ...(await orig()),
  fetchDEFieldList: async () => [{ name: 'Sku', ordinal: 0 }, { name: 'Price', ordinal: 1 }],
}))
vi.mock('../../utils/openTab.js', () => ({ openTab: vi.fn(async () => ({ id: 1 })) }))
vi.mock('../../utils/sfmcApi.js', async (orig) => {
  const real = await orig()
  // Every mock answers through the `fetch` it is given, as the real functions do, so
  // the run's own call count can be checked.
  const call = (fetch, answer) => (fetch ? fetch('u', 'GET').then(() => answer()) : Promise.resolve(answer()))
  return {
    ...real,
    sfmcFetch: vi.fn(async () => ({})),
    fetchCurrentBU: vi.fn(async () => sfmc.bu),
    searchLocalDEsByName: (stack, name, size, fetch) => call(fetch, () => ({
      items: name === 'Demo_Products' ? [{ id: 'p1', customerKey: 'Demo_Products', name: 'Demo_Products' }] : [],
    })),
    getAnyQueryActivityId: (stack, fetch) => call(fetch, () => 'qa0'),
    validateQueryText: (stack, id, sql, fetch) => call(fetch, () => ({ queryValid: true })),
    getOrCreateDEFolder: (stack, fetch) => call(fetch, () => 11),
    getOrCreateQAFolder: (stack, fetch) => call(fetch, () => 22),
    fetchDEMetadata: (stack, name, fetch) => call(fetch, () => ({ id: `id-${name}` })),
    fetchDEFields: (stack, id, fetch) => call(fetch, () => ({ fields: [
      { name: 'OrderID', type: 1, isPrimaryKey: true, isNullable: false },
      { name: 'FirstName', type: 0, length: 50 },
    ] })),
    createTargetDE: (stack, payload, fetch) => call(fetch, () => {
      sfmc.deNames.push(payload.name)
      sfmc.lastFields = payload.fields
      if (sfmc.clashOnce) {
        sfmc.clashOnce = false
        throw Object.assign(new Error('SFMC API error 409: {"message":"A CustomObject with that name already exists"}'), { status: 409 })
      }
      return { id: `de-${payload.name}`, customerKey: `key-${payload.name}` }
    }),
    createQueryActivity: (stack, payload, fetch) => call(fetch, () => {
      sfmc.actNames.push(payload.name)
      sfmc.target[`qd-${payload.name}`] = payload.targetKey
      return { queryDefinitionId: `qd-${payload.name}` }
    }),
      createRunAutomation: (stack, payload, fetch) => call(fetch, () => {
      if (sfmc.noAutomation) throw new Error('SFMC API error 403: {"message":"Insufficient privileges"}')
      sfmc.autoNames.push(payload.name)
      sfmc.autoActivity[`auto-${payload.name}`] = payload.activityId
      return { id: `auto-${payload.name}` }
    }),
    runAutomationOnce: (stack, id, fetch) => call(fetch, () => { sfmc.started.add(sfmc.target[sfmc.autoActivity[id]]); sfmc.autoRuns[id] = 0 }),
    fetchLatestAutomationRun: (stack, id, fetch) => call(fetch, () => {
      // SFMC shows the run record a little after Run Once (live test, 2026-11-08).
      if (!(id in sfmc.autoRuns) || sfmc.autoRuns[id]++ < 1) return null
      if (!sfmc.runFails) return { status: 'Complete' }
      return { status: 'Error', processes: [{ workerCounts: [{ name: 'QueryDefinition', status: 'Error', error: { translatedMsg: "Query failed during execution. Error: Conversion failed when converting the nvarchar value 'Leo' to data type int." } }] }] }
    }),
    deleteAutomation: (stack, id, fetch) => call(fetch, () => { sfmc.autoDeleted.push(id) }),
    insertDERowsAsync: (stack, key, items, fetch) => call(fetch, () => { sfmc.markerInDE[key] = items[0] }),
    startQueryActivity: (stack, id, fetch) => call(fetch, () => { sfmc.started.add(sfmc.target[id]) }),
    getQueryActivityStatus: (stack, id, fetch) => call(fetch, () => ({ isRunning: false })),
    fetchDERows: (stack, key, page, size, fetch) => call(fetch, () => {
      // A run that completes overwrites the DE (marker gone); a failed run leaves it.
      if (sfmc.started.has(key) && !sfmc.runFails) delete sfmc.markerInDE[key]
      if (sfmc.markerInDE[key]) return { count: 1, items: [{ keys: { orderid: '0' }, values: { firstname: '', sfmcqs_runmarker: 'pending' } }] }
      if (sfmc.runFails || sfmc.empty) return { count: 0, items: [] }
      return { count: 2, items: [
        { keys: { orderid: '1' }, values: { firstname: 'Ann', sfmcqs_runmarker: '' } },
        { keys: { orderid: '2' }, values: { firstname: 'Bo', sfmcqs_runmarker: '' } },
      ] }
    }),
  }
})

const store = {}
global.chrome = {
  storage: {
    local: {
      get: (k, cb) => cb(typeof k === 'string' ? { [k]: store[k] } : { ...store }),
      set: (items, cb) => { Object.assign(store, items); cb?.() },
    },
    onChanged: { addListener: () => {}, removeListener: () => {} },
  },
  runtime: { sendMessage: vi.fn() },
  tabs: { remove: vi.fn() },
}

async function panel(queryId = 'sql_1', stack = 's10') {
  const { useQueryPanel } = await import('../useQueryPanel.js')
  let api
  mount(defineComponent({ setup() { api = useQueryPanel({ queryId, stack }); return () => h('div') } }))
  await flushPromises()
  return api
}

// Runs with fake timers until the run is over.
async function finish(p, promise) {
  for (let i = 0; i < 400 && p.isRunning.value; i++) await vi.advanceTimersByTimeAsync(1000)
  await promise
}

const SQL = 'SELECT OrderID, FirstName FROM Demo_Orders'

const reset = (extra = {}) => Object.assign(sfmc, {
  deNames: [], actNames: [], autoNames: [], autoActivity: {}, autoRuns: {}, autoDeleted: [],
  clashOnce: false, runFails: false, empty: false, noAutomation: false, markerInDE: {}, started: new Set(), target: {}, ...extra,
})

describe('Why a run failed: SFMC\'s reason from a rerun inside an automation (live test, 2026-11-08)', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    reset()
    for (const k of Object.keys(store)) delete store[k]
  })
  afterEach(() => { vi.useRealTimers() })

  it('a run that works creates no automation', async () => {
    const p = await panel()
    await finish(p, p.runQuery(0, { sql: SQL }))
    expect(p.stepErrors.value.filter(Boolean)).toEqual([])
    expect(sfmc.autoNames).toEqual([])
    expect(p.resultRows.value).toHaveLength(2)
  })

  it('a failed run shows SFMC\'s reason and deletes the automation', async () => {
    sfmc.runFails = true
    const p = await panel()
    await finish(p, p.runQuery(0, { sql: 'SELECT SubscriberKey, CAST(FirstName AS INT) AS N FROM Demo_Customers' }))
    await flushPromises()
    expect(p.stepStatuses.value[3]).toBe('error')
    expect(p.stepErrors.value[3]).toBe("The query failed in SFMC: Conversion failed when converting the nvarchar value 'Leo' to data type int.")
    expect(sfmc.autoNames).toEqual(sfmc.deNames.map((n) => n.replace('SFMCQS_sql_', 'SFMCQS_run_')))
    expect(sfmc.autoDeleted).toEqual([`auto-${sfmc.autoNames[0]}`])
    expect(p.stepDetails.value[3]).toBeNull() // the "running it once more" note is gone
    expect(p.completedSummary.value).toBeNull()
  })

  it('without the right to create automations, the failure keeps the general message', async () => {
    Object.assign(sfmc, { runFails: true, noAutomation: true })
    const p = await panel()
    await finish(p, p.runQuery(0, { sql: 'SELECT TOP 10 JobID, 1/0 AS Ratio FROM _Job' }))
    expect(p.stepErrors.value[3]).toMatch(/^The query failed in SFMC: the run ended without writing/)
  })
})

describe('Run Query through a Query Activity (live test, 2026-11-07)', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    reset({ noAutomation: true })
    for (const k of Object.keys(store)) delete store[k]
  })
  afterEach(() => { vi.useRealTimers() })

  it('shows rows and columns with the DE field names, the marker column left out', async () => {
    const p = await panel()
    await finish(p, p.runQuery(0, { sql: SQL }))
    expect(p.stepErrors.value.filter(Boolean)).toEqual([])
    expect(p.resultColumns.value).toEqual(['OrderID', 'FirstName'])
    expect(p.resultRows.value).toEqual([{ OrderID: '1', FirstName: 'Ann' }, { OrderID: '2', FirstName: 'Bo' }])
    expect(p.totalRowCount.value).toBe(2)
    expect(sfmc.lastFields.map((f) => f.name)).toEqual(['OrderID', 'FirstName', 'SFMCQS_RunMarker'])
    // No primary key and no required field, though the source has both (live test, 2026-11-08).
    expect(sfmc.lastFields.map((f) => [f.isPrimaryKey, f.isNullable])).toEqual([[false, true], [false, true], [false, true]])
    expect(p.runs.value[0]).toMatchObject({ fields: ['OrderID', 'FirstName'], marker: true })
  })

  it('a failed run is an error at Run, not "Completed · 0 rows"', async () => {
    sfmc.runFails = true
    const p = await panel()
    await finish(p, p.runQuery(0, { sql: 'SELECT TOP 10 JobID, 1/0 AS Ratio FROM _Job' }))
    expect(p.stepStatuses.value[3]).toBe('error')
    expect(p.stepErrors.value[3]).toMatch(/The query failed in SFMC/)
    expect(p.completedSummary.value).toBeNull()
    expect(p.resultsMode.value).toBe('running') // the stepper stays, with the failure
  })

  it('a 0-row run completes and shows the DE field names as columns', async () => {
    sfmc.empty = true
    const p = await panel()
    await finish(p, p.runQuery(0, { sql: SQL }))
    expect(p.completedSummary.value).toMatch(/· 0 rows ·/)
    expect(p.resultRows.value).toEqual([])
    expect(p.resultColumns.value).toEqual(['OrderID', 'FirstName'])
  })

  it('names are unique per run, the DE and the activity share them', async () => {
    const p = await panel('sql_1')
    const q = await panel('sql_2')
    await finish(p, Promise.all([p.runQuery(0, { sql: SQL }), q.runQuery(0, { sql: SQL })]))
    expect(new Set(sfmc.deNames).size).toBe(2)
    expect(sfmc.actNames).toEqual(sfmc.deNames.map((n) => n.replace('SFMCQS_sql_', 'SFMCQS_act_')))
  })

  it('a 409 name clash is retried with a new name and never asks for Contact Builder', async () => {
    sfmc.clashOnce = true
    const p = await panel()
    await finish(p, p.runQuery(0, { sql: SQL }))
    expect(sfmc.deNames).toHaveLength(2)
    expect(sfmc.deNames[0]).not.toBe(sfmc.deNames[1])
    expect(p.contactBuilderNeeded.value).toBe(false)
    expect(p.stepDetails.value[1]?.prompt).toBeUndefined()
    expect(p.stepStatuses.value).toEqual(Array(5).fill('done'))
  })

  it('counts only the run\'s own SFMC calls, also with another panel running', async () => {
    const solo = await panel('sql_1')
    await finish(solo, solo.runQuery(0, { sql: SQL }))
    const n = Number(solo.completedSummary.value.match(/(\d+) SFMC calls/)[1])
    expect(n).toBeGreaterThan(5)

    const p = await panel('sql_2')
    const q = await panel('sql_3')
    await finish(p, Promise.all([p.runQuery(0, { sql: SQL }), q.runQuery(0, { sql: SQL })]))
    expect(p.completedSummary.value).toMatch(new RegExp(`· ${n} SFMC calls$`))
    expect(q.completedSummary.value).toMatch(new RegExp(`· ${n} SFMC calls$`))
  })
})

describe('Direct read (live test, 2026-11-07)', () => {
  it('counts its own calls and says "in under a second"', async () => {
    reset()
    const p = await panel('sql_direct')
    await p.runQuery(0, { sql: 'SELECT Sku, Price FROM Demo_Products' })
    expect(p.completedSummary.value).toBe('Read directly from Demo_Products in under a second · 2 rows · no Query Activity · 2 SFMC calls')
    expect(p.resultColumns.value).toEqual(['Sku', 'Price'])
  })
})

describe('Business unit of a saved query (live test, 2026-11-07)', () => {
  beforeEach(() => { for (const k of Object.keys(store)) delete store[k] })

  it('is tagged when the panel is created, without a run', async () => {
    await panel('sql_new')
    await flushPromises()
    expect(store.sql_new.businessUnit).toMatchObject({ name: 'Mathes Sandbox' })
  })

  it('is tagged on the first save of an older untagged query', async () => {
    store.sql_old = { id: 'sql_old', name: 'Old', queryText: 'SELECT 1' }
    const p = await panel('sql_old')
    expect(store.sql_old.businessUnit).toBeUndefined()
    vi.useFakeTimers()
    p.onEditorChange('SELECT 2')
    await vi.advanceTimersByTimeAsync(600)
    vi.useRealTimers()
    await flushPromises()
    expect(store.sql_old).toMatchObject({ queryText: 'SELECT 2', businessUnit: { name: 'Mathes Sandbox' } })
  })
})
