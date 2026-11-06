import { describe, it, expect, vi, beforeEach } from 'vitest'
import { defineComponent, h, nextTick } from 'vue'
import { mount, flushPromises } from '@vue/test-utils'

// Feedback #1076 follow-up (user, 2026-11-06): after a direct read, the rest of the
// data extension's rows load on their own, up to 50,000, and Load more / Load all are
// offered (the panel had only offered them for a DE the run created).
const PAGE = 2500
let total = 5000
const totals = {} // per DE, when a test needs two
const pageCalls = []
let gate = null

vi.mock('@/composables/useToast.js', () => ({ showToast: vi.fn() }))
vi.mock('../useToast.js', () => ({ showToast: vi.fn() }))
vi.mock('../../utils/sfmcApi.js', async (orig) => ({
  ...(await orig()),
  sfmcCallCount: () => 0,
  fetchCurrentBU: async () => null,
  fetchDERows: async (stack, key, page, size) => {
    pageCalls.push([key, page, size])
    if (gate && key === 'First' && page > 1) await gate
    const start = (page - 1) * size
    const all = totals[key] ?? total
    const n = Math.max(0, Math.min(size, all - start))
    return { count: all, items: Array.from({ length: n }, (_, i) => ({ keys: {}, values: { id: String(start + i), name: `${key}-${start + i}` } })) }
  },
}))
vi.mock('../../utils/directRead.js', async (orig) => {
  const real = await orig()
  return {
    ...real,
    readDirect: async (stack, plan) => {
      const columns = ['id', 'name']
      const data = await (await import('../../utils/sfmcApi.js')).fetchDERows(stack, plan.table, 1, PAGE)
      const rows = data.items.map((item) => real.projectRow(item, columns))
      return { de: { id: 'd1', key: plan.table, name: plan.table }, columns, rows, total: data.count, top: plan.top, pageSize: PAGE }
    },
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
}

async function panel() {
  const { useQueryPanel } = await import('../useQueryPanel.js')
  let api
  mount(defineComponent({ setup() { api = useQueryPanel({ queryId: 'sql_1', stack: 's13' }); return () => h('div') } }))
  await flushPromises()
  return api
}

describe('Direct read loads the rest of the rows (feedback #1076)', () => {
  beforeEach(() => { total = 5000; pageCalls.length = 0; gate = null; for (const k of Object.keys(store)) delete store[k]; for (const k of Object.keys(totals)) delete totals[k] })

  it('loads every remaining page after the first and offers Load more', async () => {
    const p = await panel()
    await p.runQuery(0, { sql: 'SELECT * FROM Big' })
    await vi.waitFor(() => expect(p.resultRows.value).toHaveLength(5000))
    expect(p.totalRowCount.value).toBe(5000)
    expect(p.canLoadMore.value).toBe(true)
    expect(pageCalls).toEqual([['Big', 1, PAGE], ['Big', 2, PAGE]])
    expect(p.resultRows.value.at(-1)).toEqual({ id: '4999', name: 'Big-4999' })
    await vi.waitFor(() => expect(p.isFetchingMore.value).toBe(false))
  })

  it('stops at 50,000 rows', async () => {
    total = 80000
    const p = await panel()
    await p.runQuery(0, { sql: 'SELECT * FROM Huge' })
    await vi.waitFor(() => expect(p.isFetchingMore.value).toBe(false), { timeout: 5000 })
    expect(p.resultRows.value).toHaveLength(50000)
    expect(p.totalRowCount.value).toBe(80000)
  })

  it('drops rows still loading for an earlier run', async () => {
    totals.First = 5000
    totals.Second = 30000
    const p = await panel()
    let open
    gate = new Promise((r) => { open = r }) // page 2 of First is held
    await p.runQuery(0, { sql: 'SELECT * FROM First' })
    await vi.waitFor(() => expect(pageCalls.at(-1)).toEqual(['First', 2, PAGE]))
    await p.runQuery(0, { sql: 'SELECT * FROM Second' })
    await vi.waitFor(() => expect(p.isFetchingMore.value).toBe(false))
    expect(p.resultRows.value).toHaveLength(30000)
    const held = gate
    open(); await held; await flushPromises(); await nextTick()
    expect(p.resultRows.value.every((r) => r.name.startsWith('Second-'))).toBe(true)
    expect(p.resultRows.value).toHaveLength(30000)
  })
})
