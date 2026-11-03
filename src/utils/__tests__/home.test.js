import { describe, it, expect } from 'vitest'
import { countVisit, readVisits, mostUsed, recentQueries, sqlLine } from '../home.js'

const mem = () => { const d = {}; return { getItem: (k) => d[k] ?? null, setItem: (k, v) => { d[k] = v } } }

describe('home page (feedback #1025)', () => {
  it('counts visits to sidebar pages only and lists the most used', () => {
    const s = mem()
    countVisit('/automation-overview', s); countVisit('/automation-overview', s); countVisit('/contacts', s); countVisit('/automations/abc', s)
    expect(readVisits(s)).toEqual({ '/automation-overview': 2, '/contacts': 1 })
    expect(mostUsed(readVisits(s)).map((i) => [i.path, i.count])).toEqual([['/automation-overview', 2], ['/contacts', 1]])
  })
  it('lists recent saved queries, newest first, without empty workspace panels', () => {
    const raw = { a: { id: 'sql_1', queryText: 'SELECT 1', timeStamp: 1 }, b: { id: 'sql_2', queryText: 'SELECT 2', timeStamp: 5, name: 'Two' }, c: { id: 'sql_3', queryText: '  ', timeStamp: 9 }, d: { id: 'x', queryText: 'no' } }
    expect(recentQueries(raw).map((q) => q.id)).toEqual(['sql_2', 'sql_1'])
    expect(sqlLine('SELECT  a,\n b FROM x', 12)).toBe('SELECT a, b…')
  })
})
