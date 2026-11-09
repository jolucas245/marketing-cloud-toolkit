import { describe, it, expect, vi } from 'vitest'
import { journeyGraph, layoutJourney } from '../journeys.js'
import { journeyCanvasModel } from '../journeyCanvas.js'
import { parseHistoryItem, HISTORY_PAGE_SIZE } from '../contactJourneys.js'
import {
  parseContactKeys, periodRange, journeyMatcher, fetchMembershipMany, contactInJourney, fetchJourneyHistory,
  aggregatePaths, pathRows, journeySendCountsSql, MEMBERSHIP_BATCH,
} from '../journeyPaths.js'

const JB = 'https://jbinteractions.s7.marketingcloudapps.com/fuelapi/interaction/v1'

const journey = {
  id: 'J-ID', key: 'welcome-key', name: 'Welcome', version: 2, definitionId: 'def-v2',
  triggers: [{ name: 'Entry' }],
  activities: [
    { id: 'A1', key: 'E1', name: 'Email 1', type: 'EMAILV2', outcomes: [{ next: 'S1' }] },
    { id: 'A2', key: 'S1', name: 'Split', type: 'RANDOMSPLIT', outcomes: [{ next: 'EA', metaData: { label: 'Path 1' } }, { next: 'EB', metaData: { label: 'Path 2' } }] },
    { id: 'A3', key: 'EA', name: 'Email A', type: 'EMAILV2', outcomes: [] },
    { id: 'A4', key: 'EB', name: 'Email B', type: 'EMAILV2', outcomes: [] },
  ],
}
const versions = [
  { id: 'J-ID', definitionId: 'def-v2', key: 'welcome-key', version: 2 },
  { id: 'J-ID', definitionId: 'def-v1', key: 'welcome-key', version: 1 },
]
const row = (contactKey, activityId, activityType, t, extra = {}) => ({ contactKey, definitionId: 'def-v2', definitionName: 'Welcome', activityId, activityType, activityName: '', transactionTime: `2026-11-0${t}T00:00:00Z`, status: 'Complete', ...extra })
const parsed = (raw) => ({ ...parseHistoryItem(raw), contactKey: raw.contactKey })

describe('parseContactKeys and periodRange', () => {
  it('splits on lines, commas and semicolons and drops duplicates', () => {
    expect(parseContactKeys(' a\nb, c;a\n\n')).toEqual(['a', 'b', 'c'])
  })
  it('gives the last n days, or a custom range with the end day included', () => {
    expect(periodRange({ days: 7, now: new Date('2026-11-09T00:00:00Z') })).toEqual({ start: '2026-11-02T00:00:00.000Z', end: '2026-11-09T00:00:00.000Z' })
    const r = periodRange({ from: '2026-11-01', to: '2026-11-03' })
    expect(new Date(r.end) > new Date(r.start)).toBe(true)
    expect(() => periodRange({ from: '2026-11-05', to: '2026-11-01' })).toThrow(/after/)
  })
})

describe('journeyMatcher', () => {
  const m = journeyMatcher(journey, versions)
  it('keeps rows of any version of this journey and memberships by key', () => {
    expect(m.row({ definitionId: 'def-v1' })).toBe(true)
    expect(m.row({ definitionId: 'J-ID' })).toBe(true)
    expect(m.row({ definitionId: 'other' })).toBe(false)
    expect(m.row({ definitionId: '', definitionKey: '', journeyName: 'welcome' })).toBe(true)
    expect(m.membership({ definitionKey: 'WELCOME-KEY' })).toBe(true)
    expect(m.membership({ definitionKey: 'other' })).toBe(false)
  })
  it('names the version from a version definitionId, never from the shared id', () => {
    expect(m.versionOf({ definitionId: 'def-v1' })).toBe(1)
    expect(m.versionOf({ definitionId: 'J-ID' })).toBe(null)
  })
})

describe('fetchMembershipMany', () => {
  it('posts the keys in batches of 50', async () => {
    const keys = Array.from({ length: MEMBERSHIP_BATCH + 1 }, (_, i) => `k${i}`)
    const fetcher = vi.fn(async (_u, _m, body) => ({ results: { contactMemberships: body.ContactKeyList.slice(0, 1).map((k) => ({ contactKey: k, definitionKey: 'welcome-key', version: 2 })) } }))
    const r = await fetchMembershipMany('s7', keys, fetcher)
    expect(fetcher).toHaveBeenCalledTimes(2)
    expect(fetcher.mock.calls[0][0]).toBe(`${JB}/interactions/contactMembership`)
    expect(fetcher.mock.calls[1][2]).toEqual({ ContactKeyList: [`k${MEMBERSHIP_BATCH}`] })
    expect(r.memberships.map((x) => x.contactKey)).toEqual(['k0', `k${MEMBERSHIP_BATCH}`])
  })
})

describe('contactInJourney', () => {
  const matcher = journeyMatcher(journey, versions)
  it('says in now with the version, the last step and the entry time, only for this journey', () => {
    const items = [row('c1', '', 'Trigger', 1), row('c1', 'A1', 'EMAILV2', 2), row('c1', 'x', 'EMAILV2', 3, { definitionId: 'other' })].map(parseHistoryItem)
    const r = contactInJourney({ contactKey: 'c1', memberships: [{ contactKey: 'c1', definitionKey: 'welcome-key', version: 2 }, { contactKey: 'c1', definitionKey: 'other', version: 1 }], items, matcher })
    expect(r).toMatchObject({ inNow: true, versions: [2], entries: 1, entered: '2026-11-01T00:00:00Z', lastStatus: 'Complete', left: false })
    expect(r.lastStep).toBe('Email 1')
  })
  it('says not in now, version from the history, and left', () => {
    const items = [row('c2', 'A1', 'EMAILV2', 1, { definitionId: 'def-v1', activityName: 'Email 1' }), row('c2', '', 'StopInteractionActivity', 2, { definitionId: 'def-v1' })].map(parseHistoryItem)
    const r = contactInJourney({ contactKey: 'c2', memberships: [], items, matcher })
    expect(r).toMatchObject({ inNow: false, versions: [1], left: true, lastStep: 'Left the journey' })
  })
  it('has nothing for a contact with no rows', () => {
    expect(contactInJourney({ contactKey: 'c3', items: [], matcher })).toMatchObject({ inNow: false, entries: 0, lastStep: '', entered: '' })
  })
})

describe('fetchJourneyHistory', () => {
  const matcher = journeyMatcher(journey, versions)
  it('searches without contact keys by journey key, pages, keeps this journey and caps the read', async () => {
    const page = Array.from({ length: HISTORY_PAGE_SIZE }, (_, i) => row(`c${i}`, 'A1', 'EMAILV2', 1, i % 2 ? { definitionId: 'other' } : {}))
    const fetcher = vi.fn(async () => ({ items: page, count: 5000 }))
    const progress = vi.fn()
    const r = await fetchJourneyHistory('s7', journey, { start: 's', end: 'e', matcher, max: 1200, onProgress: progress, fetcher })
    expect(fetcher.mock.calls[0][2]).toEqual({ start: 's', end: 'e', contactKeys: [], journeySearchKey: 'welcome-key' })
    expect(fetcher.mock.calls[0][0]).toMatch(`${JB}/interactions/journeyhistory/search?`)
    expect(fetcher).toHaveBeenCalledTimes(3)
    expect(r).toMatchObject({ read: 1200, capped: true, searchKey: 'welcome-key' })
    expect(r.items).toHaveLength(600)
    expect(r.items[0].contactKey).toBe('c0')
    expect(progress).toHaveBeenLastCalledWith({ read: 1200, total: 5000, kept: 600 })
  })
  it('tries an empty search key when the journey key finds nothing or is refused', async () => {
    const fetcher = vi.fn()
      .mockResolvedValueOnce({ items: [], count: 0 })
      .mockResolvedValueOnce({ items: [row('c1', 'A1', 'EMAILV2', 1)], count: 1 })
    const r = await fetchJourneyHistory('s7', journey, { start: 's', end: 'e', matcher, fetcher })
    expect(fetcher.mock.calls[1][2].journeySearchKey).toBe('')
    expect(r).toMatchObject({ searchKey: '', capped: false })
    expect(r.items).toHaveLength(1)

    const refused = Object.assign(new Error('SFMC API error 400: bad request'), { status: 400 })
    const f2 = vi.fn().mockRejectedValueOnce(refused).mockResolvedValueOnce({ items: [], count: 0 })
    const r2 = await fetchJourneyHistory('s7', journey, { start: 's', end: 'e', matcher, fetcher: f2 })
    expect(r2.items).toEqual([])
  })
  it('says the search is refused when every form fails, and passes other errors on', async () => {
    const refused = Object.assign(new Error('SFMC API error 400'), { status: 400 })
    await expect(fetchJourneyHistory('s7', journey, { start: 's', end: 'e', matcher, fetcher: vi.fn().mockRejectedValue(refused) }))
      .rejects.toMatchObject({ code: 'HISTORY_SEARCH_REFUSED' })
    const session = Object.assign(new Error('session expired'), { status: 401 })
    await expect(fetchJourneyHistory('s7', journey, { start: 's', end: 'e', matcher, fetcher: vi.fn().mockRejectedValue(session) }))
      .rejects.toThrow('session expired')
  })
})

describe('aggregatePaths', () => {
  const graph = journeyGraph(journey)
  const items = [
    // c1: Email 1, Split, Email A, left.
    row('c1', '', 'Trigger', 1), row('c1', 'A1', 'EMAILV2', 2), row('c1', 'A2', 'RANDOMSPLIT', 3), row('c1', 'A3', 'EMAILV2', 4), row('c1', '', 'StopInteractionActivity', 5),
    // c2: Email 1, Split, Email B failed.
    row('c2', 'A1', 'EMAILV2', 2), row('c2', 'A2', 'RANDOMSPLIT', 3), row('c2', 'A4', 'EMAILV2', 4, { status: 'Failed' }),
    // c3: entered, nothing else yet; plus one row of a removed activity.
    row('c3', '', 'Trigger', 1), row('c3', 'gone', 'WaitActivity', 2),
  ].map(parsed)
  const agg = aggregatePaths(journey, graph, items)
  const edgeIndex = (from, to) => graph.edges.findIndex((e) => e.from === from && e.to === to)

  it('counts entries per activity and per route, exits and failures', () => {
    expect(agg).toMatchObject({ entries: 3, contacts: 3, exited: 1, failed: 1, unmatched: 1 })
    expect(agg.nodes.get('__entry').count).toBe(3)
    expect(agg.nodes.get('E1').count).toBe(2)
    expect(agg.nodes.get('EA').count).toBe(1)
    expect(agg.nodes.get('EB')).toEqual({ count: 1, failed: 1 })
    expect(agg.edges.get(edgeIndex('E1', 'S1'))).toBe(2)
    expect(agg.edges.get(edgeIndex('S1', 'EA'))).toBe(1)
    expect(agg.edges.get(edgeIndex('S1', 'EB'))).toBe(1)
    expect(agg.maxEdge).toBe(2)
  })
  it('lists per-activity rows without exits', () => {
    const rows = pathRows(graph, agg)
    expect(rows.find((r) => r.key === 'EB')).toMatchObject({ name: 'Email B', count: 1, failed: 1 })
    expect(rows.some((r) => r.key.startsWith('__exit'))).toBe(false)
  })
  it('puts the counts on the canvas model and dims what no one reached', () => {
    const model = journeyCanvasModel(graph, layoutJourney(graph), 'horizontal', null, { counts: agg })
    const node = (k) => model.nodes.find((n) => n.id === k).data
    expect(node('E1')).toMatchObject({ count: 2, visited: true })
    expect(node('EB')).toMatchObject({ count: 1, failed: 1 })
    const edge = model.edges.find((e) => e.source === 'E1' && e.target === 'S1').data
    expect(edge).toMatchObject({ count: 2, weight: 1, visited: true })
    const none = journeyCanvasModel(graph, layoutJourney(graph), 'horizontal', null, { counts: aggregatePaths(journey, graph, []) })
    expect(none.nodes.find((n) => n.id === 'E1').data).toMatchObject({ count: 0, visited: false })
  })
})

describe('journeySendCountsSql', () => {
  it('counts email sends per activity and version for this journey in the period', () => {
    const sql = journeySendCountsSql("Bob's journey", 7)
    expect(sql).toContain("j.JourneyName = 'Bob''s journey'")
    expect(sql).toContain('DATEADD(DAY, -7, GETDATE())')
    expect(sql).toContain('GROUP BY j.VersionNumber, ja.ActivityName')
  })
})
