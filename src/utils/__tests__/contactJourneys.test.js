import { describe, it, expect, vi } from 'vitest'
import { fetchContactMembership, fetchContactHistory, historyBody, parseHistoryItem, groupByJourney, matchSteps, pathOnGraph, stepNumbers, journeySendsSql, HISTORY_PAGE_SIZE } from '../contactJourneys.js'
import { journeyGraph } from '../journeys.js'

const JB = 'https://jbinteractions.s7.marketingcloudapps.com/fuelapi/interaction/v1'

describe('fetchContactMembership', () => {
  it('posts the key list and reads the memberships', async () => {
    const fetcher = vi.fn(async () => ({ results: { contactMemberships: [{ contactKey: 'c1', definitionKey: 'J1', version: 3 }], contactMembershipErrors: [] } }))
    const r = await fetchContactMembership('s7', 'c1', fetcher)
    expect(fetcher).toHaveBeenCalledWith(`${JB}/interactions/contactMembership`, 'POST', { ContactKeyList: ['c1'] })
    expect(r.memberships).toEqual([{ contactKey: 'c1', definitionKey: 'J1', version: 3 }])
  })
})

describe('fetchContactHistory', () => {
  it('builds the body for the period and one journey', () => {
    const b = historyBody('c1', { days: 7, definitionIds: ['d1'], now: new Date('2026-11-02T00:00:00Z') })
    expect(b).toEqual({ contactKey: 'c1', start: '2026-10-26T00:00:00.000Z', end: '2026-11-02T00:00:00.000Z', definitionIds: ['d1'] })
  })
  it('pages until a short page and keeps only this contact', async () => {
    const full = Array.from({ length: HISTORY_PAGE_SIZE }, (_, i) => ({ contactKey: 'c1', activityName: `s${i}` }))
    const fetcher = vi.fn()
      .mockResolvedValueOnce({ items: full, count: HISTORY_PAGE_SIZE + 2 })
      .mockResolvedValueOnce({ items: [{ contactKey: 'c1' }, { contactKey: 'other' }], count: HISTORY_PAGE_SIZE + 2 })
    const r = await fetchContactHistory('s7', 'c1', { days: 30 }, fetcher)
    expect(fetcher).toHaveBeenCalledTimes(2)
    expect(fetcher.mock.calls[0][0]).toMatch(`${JB}/interactions/journeyhistory/search?`)
    expect(fetcher.mock.calls[1][0]).toMatch(/%24page=2/)
    expect(r.items).toHaveLength(HISTORY_PAGE_SIZE + 1)
  })
})

describe('grouping and paths', () => {
  const items = [
    { DefinitionId: 'd1', DefinitionName: 'Welcome', Version: 2, ActivityId: 'A2', ActivityName: 'Wait', TransactionTime: '2026-10-02T00:00:00Z', Status: 'Complete' },
    { definitionId: 'd1', definitionName: 'Welcome', version: 2, activityId: 'a1', activityName: 'Email 1', transactionTime: '2026-10-01T00:00:00Z', status: 'Complete' },
    { definitionId: 'd1', definitionName: 'Welcome', version: 2, activityId: 'a4', activityName: 'Email B', transactionTime: '2026-10-03T00:00:00Z', status: 'Failed' },
    { definitionId: 'd9', definitionName: 'Other', version: 1, activityId: 'z', transactionTime: '2026-09-01T00:00:00Z' },
  ].map(parseHistoryItem)

  it('parses either spelling and groups per journey version, steps oldest first', () => {
    const g = groupByJourney(items)
    expect(g.map((x) => x.name)).toEqual(['Welcome', 'Other'])
    expect(g[0].steps.map((s) => s.activityName)).toEqual(['Email 1', 'Wait', 'Email B'])
    expect(g[0].failed).toBe(1)
    expect(g[0].version).toBe(2)
  })

  const journey = {
    triggers: [{ name: 'Entry' }],
    activities: [
      { id: 'A1', key: 'E1', name: 'Email 1', type: 'EMAILV2', outcomes: [{ next: 'W1' }] },
      { id: 'A2', key: 'W1', name: 'Wait', type: 'WAIT', outcomes: [{ next: 'S1' }] },
      { id: 'A3', key: 'S1', name: 'Split', type: 'MULTICRITERIADECISION', outcomes: [{ next: 'EA', metaData: { label: 'Yes' } }, { next: 'EB', metaData: { label: 'No' } }] },
      { id: 'A4', key: 'EB', name: 'Email B', type: 'EMAILV2', outcomes: [] },
      { id: 'A5', key: 'EA', name: 'Email A', type: 'EMAILV2', outcomes: [] },
    ],
  }

  it('matches steps to canvas nodes by id, case-insensitive', () => {
    const { keys, unmatched } = matchSteps(journey, groupByJourney(items)[0].steps)
    expect(keys).toEqual(['E1', 'W1', 'EB'])
    expect(unmatched).toEqual([])
  })

  it('marks the visited nodes and the edges between consecutive ones', () => {
    const graph = journeyGraph(journey)
    const { nodes, edges } = pathOnGraph(graph, ['E1', 'W1', 'S1', 'EB'], { ended: true })
    expect([...nodes]).toEqual(expect.arrayContaining(['__entry', 'E1', 'W1', 'S1', 'EB']))
    const pairs = [...edges].map((i) => `${graph.edges[i].from}>${graph.edges[i].to}`)
    expect(pairs).toEqual(expect.arrayContaining(['__entry>E1', 'E1>W1', 'W1>S1', 'S1>EB']))
    expect(pairs.some((p) => p.startsWith('EB>__exit'))).toBe(true)
    expect(pairs).not.toContain('S1>EA')
  })

  it('numbers the steps, repeating a node visited twice', () => {
    expect([...stepNumbers(['E1', 'W1', 'E1'])]).toEqual([['E1', [1, 3]], ['W1', [2]]])
  })
})

describe('journeySendsSql', () => {
  it('quotes the key', () => {
    const sql = journeySendsSql("o'brien")
    expect(sql).toMatch(/WHERE s\.SubscriberKey = 'o''brien'/)
    expect(sql).toMatch(/FROM _Sent s/)
  })
})
