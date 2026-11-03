import { describe, it, expect, vi } from 'vitest'
import { fetchContactMembership, fetchContactHistory, historyBody, parseHistoryItem, groupByJourney, matchSteps, pathOnGraph, stepNumbers, journeySendsSql, HISTORY_PAGE_SIZE, splitEntries, entryFlowText, journeyForHistory } from '../contactJourneys.js'
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
  it("builds the body Journey Builder's page sends", () => {
    const b = historyBody('c1', { days: 7, now: new Date('2026-11-02T00:00:00Z') })
    expect(b).toEqual({ start: '2026-10-26T00:00:00.000Z', end: '2026-11-02T00:00:00.000Z', contactKeys: ['c1'], journeySearchKey: '' })
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
    { DefinitionId: 'd1', DefinitionName: 'Welcome', Version: 2, ActivityId: 'A2', ActivityName: 'Wait', ActivityType: 'WaitActivity', TransactionTime: '2026-10-02T00:00:00Z', Status: 'Complete' },
    { definitionId: 'd1', definitionName: 'Welcome', version: 2, activityId: 'a1', activityName: 'Email 1', activityType: 'EMAILV2', transactionTime: '2026-10-01T00:00:00Z', status: 'Complete' },
    { definitionId: 'd1', definitionName: 'Welcome', version: 2, activityId: 'a4', activityName: 'Email B', activityType: 'EMAILV2', transactionTime: '2026-10-03T00:00:00Z', status: 'Failed' },
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

describe('history rows as Journey Builder sends them (live, 2026-11-02)', async () => {
  const { stepLabel, isEntryRow } = await import('../contactJourneys.js')
  const row = (activityType, activityName, activityId, status, ms) => ({ definitionId: 'd1', definitionName: 'TK Journey Test', contactKey: 'c1', activityType, activityName, activityId, status, epochTimeInMilliseconds: ms, transactionTime: new Date(ms).toISOString() })
  const raw = [
    row('StopInteractionActivity', 'Stop', 's1', 'Complete', 1006),
    row('WaitActivity', 'Path B wait 2 minutes', 'id-b', 'Waiting', 1005),
    row('RANDOMSPLIT', 'Random split', 'id-s', 'Complete', 1004),
    row('WaitActivity', 'Wait 1 minute', 'id-w', 'Complete', 1003),
    row('WaitActivity', 'Wait 1 minute', 'id-w', 'Waiting', 1002),
    row('StartInteractionActivity', 'Start Activity', 'x', 'Complete', 1001),
    row('Trigger', 'TK Journey Test Event', 't', 'MetCriteria', 1000),
    { definitionId: 'd1', contactKey: 'c1', status: 'ContactAttempted', epochTimeInMilliseconds: 999, transactionTime: '2026-11-02T20:00:09.131Z' },
  ]
  const journey = {
    triggers: [{ name: 'Entry' }],
    activities: [
      { id: 'id-w', key: 'WAIT-1', name: 'Wait 1 minute', type: 'WAIT', outcomes: [{ next: 'SPLIT-1' }] },
      { id: 'id-s', key: 'SPLIT-1', name: 'Random split', type: 'RANDOMSPLIT', outcomes: [{ next: 'WAIT-A', arguments: { percentage: 50 } }, { next: 'WAIT-B', arguments: { percentage: 50 } }] },
      { id: 'id-a', key: 'WAIT-A', name: 'Path A wait 1 minute', type: 'WAIT', outcomes: [{}] },
      { id: 'id-b', key: 'WAIT-B', name: 'Path B wait 2 minutes', type: 'WAIT', outcomes: [{}] },
    ],
  }

  it('orders by the millisecond time and groups without a version', () => {
    const [g] = groupByJourney(raw.map(parseHistoryItem))
    expect(g.version).toBeNull()
    expect(g.steps.map(stepLabel)).toEqual(['Entry attempted', 'Entry: TK Journey Test Event', 'Journey started', 'Wait 1 minute', 'Wait 1 minute', 'Random split', 'Path B wait 2 minutes', 'Left the journey'])
    expect(isEntryRow(g.steps[0])).toBe(true)
  })

  it('places the activities, skips entry rows and reads the exit', () => {
    const [g] = groupByJourney(raw.map(parseHistoryItem))
    const m = matchSteps(journey, g.steps)
    expect(m).toEqual({ keys: ['WAIT-1', 'SPLIT-1', 'WAIT-B'], unmatched: [], ended: true })
    const graph = journeyGraph(journey)
    const { nodes, edges } = pathOnGraph(graph, m.keys, { ended: m.ended })
    expect(nodes.has('WAIT-A')).toBe(false)
    const pairs = [...edges].map((i) => `${graph.edges[i].from}>${graph.edges[i].to}`)
    expect(pairs).toEqual(expect.arrayContaining(['__entry>WAIT-1', 'WAIT-1>SPLIT-1', 'SPLIT-1>WAIT-B']))
    expect(pairs.some((p) => p.startsWith('WAIT-B>__exit'))).toBe(true)
  })
})

describe('entries by definitionInstanceId (feedback #1020)', () => {
  const row = (instanceId, ms, activityType, activityName = '', status = 'Complete') => ({ instanceId, ms, time: new Date(ms).toISOString(), activityType, activityName, status, activityId: '', activityKey: '', message: '' })
  it('splits a journey into entries, newest first, with loose rows placed by time', () => {
    const steps = [row('A', 1000, ''), row('A', 2000, 'Trigger', 'Evt'), row('A', 4000, 'EMAILV2', 'Hi'),
      row('B', 9000, 'Trigger', 'Evt'), row('B', 9500, 'StopInteractionActivity'), row('', 3000, 'WaitActivity', 'Wait')]
    const e = splitEntries(steps)
    expect(e.map((x) => x.id)).toEqual(['B', 'A'])
    expect(e[1].steps.map((s) => s.activityType)).toEqual(['', 'Trigger', 'WaitActivity', 'EMAILV2'])
    expect(entryFlowText(e[0])).toBe('Entry: Evt → Left the journey')
  })
  it('reads definitionInstanceId from a history item', () => {
    expect(parseHistoryItem({ definitionInstanceId: 'x-1' }).instanceId).toBe('x-1')
  })
})

describe('journey for a history group (feedback #1024)', () => {
  const nf = () => Object.assign(new Error('SFMC API error 404: Interaction matching criteria not found.'), { status: 404 })
  it('falls back to the journeys with that name, matched on definitionId', async () => {
    const calls = []
    const get = async (stack, id, v) => { calls.push([id, v]); if (id === 'v3-id') return { id: 'v3-id', version: 3 }; throw nf() }
    const fetcher = async () => ({ items: [{ id: 'v2-id', definitionId: 'def-1', version: 2, name: 'J' }, { id: 'v3-id', definitionId: 'def-1', version: 3, name: 'J' }] })
    const r = await journeyForHistory('s1', { definitionId: 'def-1', name: 'J', version: null }, { get, fetcher })
    expect(r).toEqual({ journey: { id: 'v3-id', version: 3 }, fallback: true })
    expect(calls[0]).toEqual(['def-1', null])
  })
  it('says plainly when the journey is gone', async () => {
    const get = async () => { throw nf() }
    await expect(journeyForHistory('s1', { definitionId: 'x', name: 'J' }, { get, fetcher: async () => ({ items: [] }) })).rejects.toThrow(/no longer has this journey/)
  })
})
