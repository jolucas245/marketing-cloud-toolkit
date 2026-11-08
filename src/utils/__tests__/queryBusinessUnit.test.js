import { describe, it, expect, vi } from 'vitest'
import { tagQueryBusinessUnit } from '../queryBusinessUnit.js'

// Live test, 2026-11-07: queries got their business unit only on their first run, so
// Query Builder saves and panels never run were hidden in "queries from <current BU>".
function fakeStorage(init = {}) {
  const store = { ...init }
  return { store, storage: () => ({ get: (k, cb) => cb({ [k]: store[k] }), set: (items, cb) => { Object.assign(store, items); cb?.() } }) }
}
const BU = { name: 'Mathes Sandbox', accountId: 515010937 }

describe('tagQueryBusinessUnit', () => {
  it('adds the current business unit to a saved query without one', async () => {
    const { store, storage } = fakeStorage({ sql_1: { id: 'sql_1', source: 'builder', queryText: 'SELECT 1' } })
    const fetchBU = vi.fn(async () => BU)
    await expect(tagQueryBusinessUnit('sql_1', 's10', { fetchBU, storage })).resolves.toEqual(BU)
    expect(fetchBU).toHaveBeenCalledWith('s10')
    expect(store.sql_1).toEqual({ id: 'sql_1', source: 'builder', queryText: 'SELECT 1', businessUnit: BU })
  })

  it('keeps a business unit already there and does not ask SFMC', async () => {
    const { store, storage } = fakeStorage({ sql_1: { id: 'sql_1', businessUnit: { name: 'Other' } } })
    const fetchBU = vi.fn(async () => BU)
    await tagQueryBusinessUnit('sql_1', 's10', { fetchBU, storage })
    expect(fetchBU).not.toHaveBeenCalled()
    expect(store.sql_1.businessUnit.name).toBe('Other')
  })

  it('asks SFMC once for saves close together', async () => {
    const { storage } = fakeStorage({ sql_1: { id: 'sql_1' } })
    const fetchBU = vi.fn(async () => BU)
    await Promise.all([tagQueryBusinessUnit('sql_1', 's10', { fetchBU, storage }), tagQueryBusinessUnit('sql_1', 's10', { fetchBU, storage })])
    expect(fetchBU).toHaveBeenCalledTimes(1)
  })

  it('never throws: no stack, no record, SFMC failing', async () => {
    const { store, storage } = fakeStorage({ sql_1: { id: 'sql_1' } })
    await expect(tagQueryBusinessUnit('sql_1', null, { storage })).resolves.toBeNull()
    await expect(tagQueryBusinessUnit('sql_9', 's10', { fetchBU: async () => BU, storage })).resolves.toBeNull()
    await expect(tagQueryBusinessUnit('sql_1', 's10', { fetchBU: async () => { throw new Error('SESSION_EXPIRED') }, storage })).resolves.toBeNull()
    expect(store.sql_1.businessUnit).toBeUndefined()
  })
})
