import { describe, it, expect } from 'vitest'
import { directReadPlan, readDirect, projectRow } from '../directRead.js'

// Feedback #1076: a plain read of one DE is read directly, without a Query Activity.
describe('directReadPlan', () => {
  it.each([
    ['select TOP 1000 GUID from [Master_DE]', { table: 'Master_DE', columns: ['GUID'], top: 1000 }],
    ['SELECT * FROM Master_DE', { table: 'Master_DE', columns: '*', top: null }],
    ['select top (5) [First Name], m.Email from [My DE] m;', { table: 'My DE', columns: ['First Name', 'Email'], top: 5 }],
    ['-- latest\nSELECT /* all */ * FROM [Subs] AS s', { table: 'Subs', columns: '*', top: null }],
  ])('%s', (sql, plan) => expect(directReadPlan(sql)).toEqual(plan))

  it.each([
    'select * from [Master_DE] where GUID = 1',
    'select * from Master_DE order by GUID',
    'select top 10 * from Master_DE order by GUID',
    'select * from A join B on A.x = B.x',
    'select distinct GUID from Master_DE',
    'select count(*) from Master_DE',
    'select GUID as Id from Master_DE',
    'select * from _Sent',
    'select * from ENT.Master_DE',
    'select * from Master_DE union select * from Other',
    'select top 10 percent * from Master_DE',
    'select GUID, GUID from Master_DE',
    'update Master_DE set x = 1',
  ])('not a plain read: %s', (sql) => expect(directReadPlan(sql)).toBeNull())
})

describe('readDirect', () => {
  const api = (count = 3) => ({
    searchLocalDEsByName: async () => ({ items: [{ id: 'd1', name: 'Master_DE', customerKey: 'MK' }, { id: 'd2', name: 'Master_DE_Old', customerKey: 'OK' }] }),
    fetchDEFieldList: async () => [{ name: 'Email', ordinal: 1, isPrimaryKey: true }, { name: 'GUID', ordinal: 0 }],
    fetchDERows: async (stack, key, page, size) => ({ count, items: Array.from({ length: Math.min(size, count) }, (_, i) => ({ keys: { guid: `g${i}` }, values: { email: `e${i}@x.co` } })) }),
  })

  it('reads the exact DE, in DE order for *, capped by TOP', async () => {
    const r = await readDirect('s13', { table: 'master_de', columns: '*', top: 2 }, { api: api() })
    expect(r.de).toEqual({ id: 'd1', key: 'MK', name: 'Master_DE' })
    expect(r.columns).toEqual(['GUID', 'Email'])
    expect(r.rows).toEqual([{ GUID: 'g0', Email: 'e0@x.co' }, { GUID: 'g1', Email: 'e1@x.co' }])
    expect(r.total).toBe(2)
  })

  it('goes back to a Query Activity when the DE or a column is not found', async () => {
    expect(await readDirect('s13', { table: 'Nope', columns: '*', top: null }, { api: api() })).toBeNull()
    expect(await readDirect('s13', { table: 'Master_DE', columns: ['Missing'], top: null }, { api: api() })).toBeNull()
  })

  it('maps lowercased rowset names back to the query\'s columns', () => {
    expect(projectRow({ keys: { guid: 'a' }, values: { 'first name': 'Ann' } }, ['GUID', 'First Name'])).toEqual({ GUID: 'a', 'First Name': 'Ann' })
  })
})
