import { describe, it, expect } from 'vitest'
import { planJoin, joinInsertPoint, newAlias } from '../joinInsert.js'
import { DATA_VIEW_FIELDS } from '../dataViews.js'

const dv = (n) => DATA_VIEW_FIELDS[n.toUpperCase()]
const apply = (sql, p) => sql.slice(0, p.at) + p.insert + sql.slice(p.at)

describe('Join to the query', () => {
  it('joins a data view on its known keys, before WHERE', async () => {
    const sql = 'SELECT s.SubscriberKey\nFROM _Sent s\nWHERE s.EventDate > GETDATE() - 7'
    const p = await planJoin(sql, { name: '_Job' }, dv('_Job'), (n) => dv(n))
    expect(apply(sql, p)).toBe('SELECT s.SubscriberKey\nFROM _Sent s\nLEFT JOIN _Job AS j\n  ON s.JobID = j.JobID\nWHERE s.EventDate > GETDATE() - 7')
    expect(p.matched).toBe(true)
  })
  it('joins a DE on a shared key at the end, or asks for the ON', async () => {
    const sql = 'SELECT * FROM [My DE] m'
    const p = await planJoin(sql, { name: '_Subscribers' }, dv('_Subscribers'), () => [{ name: 'SubscriberKey' }])
    expect(apply(sql, p)).toBe('SELECT * FROM [My DE] m\nLEFT JOIN _Subscribers AS s\n  ON m.SubscriberKey = s.SubscriberKey\n')
    const q = await planJoin(sql, { name: 'Other DE' }, [{ name: 'X' }], () => [{ name: 'Y' }])
    expect(q.insert).toContain('LEFT JOIN [Other DE] AS od\n  ON /* set the join condition */')
    expect((await planJoin(sql, { name: 'My DE' }, [], () => [])).error).toMatch(/already/)
    expect(joinInsertPoint('SELECT 1')).toBe(null)
  })
})

// "Joined as de." for Demo_Orders read oddly (live test, 2026-11-07).
describe('join aliases', () => {
  const none = new Set()
  it('uses the initials, else the last word, else the whole name', () => {
    expect(newAlias('Demo_Customers', none)).toBe('dc')
    expect(newAlias('Demo_Orders', none)).toBe('orders')          // "do" reads as a keyword
    expect(newAlias('ENT.Demo_Products', none)).toBe('dp')
    expect(newAlias('_SMSMessageTracking', none)).toBe('smt')
    expect(newAlias('_Sent', new Set(['s']))).toBe('sent')
    expect(newAlias('Demo_Orders', new Set(['orders']))).toBe('demo_orders')
  })
  it('never picks a reserved word or a taken alias', () => {
    expect(newAlias('Index', none)).toBe('i')
    expect(newAlias('Is_Null', none)).toBe('is_null')               // "in" and "null" are reserved
    expect(newAlias('Left_Join', none)).toBe('lj')
    expect(newAlias('Order', none)).toBe('o')
    expect(newAlias('Top_Products', new Set(['tp']))).toBe('products')
    expect(newAlias('Sales_Count', new Set(['sc']))).toBe('sales_count') // COUNT is a function
  })
  it('numbers the initials when every readable choice is taken', () => {
    expect(newAlias('Demo_Orders', new Set(['orders', 'demo_orders']))).toBe('do2')
    expect(newAlias('2024', none)).toBe('t2')
  })
  it('does not reuse the name of a table written without an alias', async () => {
    const sql = 'SELECT * FROM Orders JOIN Demo_Customers dc ON 1 = 1'
    const p = await planJoin(sql, { name: 'Demo_Orders' }, [], () => [])
    expect(p.alias).toBe('demo_orders')
  })
})
