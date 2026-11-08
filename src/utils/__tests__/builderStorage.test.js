import { describe, it, expect, beforeEach } from 'vitest'
import { saveBuilderRecord } from '../builderStorage.js'

let data
beforeEach(() => {
  data = {}
  globalThis.chrome = { storage: { local: {
    get: (k, cb) => cb(k in data ? { [k]: structuredClone(data[k]) } : {}),
    set: (obj, cb) => { Object.assign(data, structuredClone(obj)); cb?.() },
  } } }
})

describe('saveBuilderRecord (live test, 2026-11-07)', () => {
  it('keeps the business unit across autosaves', async () => {
    data.sql_1 = { id: 'sql_1', name: 'Mine', timeStamp: 1, businessUnit: { name: 'Sandbox', accountId: 5 } }
    await saveBuilderRecord({ id: 'sql_1', sql: 'SELECT 1', state: {} })
    expect(data.sql_1.businessUnit).toEqual({ name: 'Sandbox', accountId: 5 })
    expect(data.sql_1.queryText).toBe('SELECT 1')
  })
  it('adds none when the record has none', async () => {
    const id = await saveBuilderRecord({ sql: 'SELECT 2', state: {} })
    expect(data[id].businessUnit).toBeUndefined()
  })
})
