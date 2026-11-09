import { describe, it, expect, vi } from 'vitest'
import { journeyGraph, layoutJourney } from '../journeys.js'
import { journeyCanvasModel } from '../journeyCanvas.js'
import { parseHistoryItem, HISTORY_PAGE_SIZE } from '../contactJourneys.js'
import {
  parseContactKeys, periodRange, journeyMatcher, fetchMembershipMany, contactInJourney, fetchJourneyHistory, historySearchForms,
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

describe('fetchJourneyHistory (feedback #1094, #1095: this journey only)', () => {
  const matcher = journeyMatcher(journey, versions)
  const mine = (n, extra = {}) => Array.from({ length: n }, (_, i) => row(`c${i}`, 'A1', 'EMAILV2', 1, extra))
  const withEvent = { ...journey, triggers: [{ name: 'Entry', metaData: { eventDefinitionId: 'ev-1' } }] }

  it('searches by the entry event, as Journey Builder does, and never by journeySearchKey alone', () => {
    expect(historySearchForms(withEvent, versions)).toEqual([{ label: 'entry event', body: { eventIds: ['ev-1', 'EV-1'], journeySearchKey: '' }, exact: true }])
    const noEvent = historySearchForms(journey, versions)
    expect(noEvent).toEqual([{ label: 'version IDs', body: { definitionIds: ['def-v2', 'def-v1'], journeySearchKey: '' } }])
    expect(historySearchForms({ name: 'x', key: 'k' }, [])).toEqual([])
  })
  it('reads the entry event search and caps the read', async () => {
    const fetcher = vi.fn(async () => ({ items: mine(HISTORY_PAGE_SIZE), count: 5000 }))
    const progress = vi.fn()
    const r = await fetchJourneyHistory('s7', withEvent, { start: 's', end: 'e', matcher, versions, max: 1200, onProgress: progress, fetcher })
    expect(fetcher.mock.calls[0][2]).toEqual({ start: 's', end: 'e', contactKeys: [], eventIds: ['ev-1', 'EV-1'], journeySearchKey: '' })
    expect(fetcher.mock.calls[0][0]).toMatch(`${JB}/interactions/journeyhistory/search?`)
    expect(r).toMatchObject({ read: 1200, capped: true, form: 'entry event' })
    expect(r.items).toHaveLength(1200)
    expect(progress).toHaveBeenLastCalledWith({ read: 1200, total: 5000, kept: 1200 })
  })
  it('takes no rows from the entry event search as no entries, without other searches', async () => {
    const fetcher = vi.fn(async () => ({ items: [], count: 0 }))
    const r = await fetchJourneyHistory('s7', withEvent, { start: 's', end: 'e', matcher, versions, fetcher })
    expect(r).toMatchObject({ items: [], read: 0, form: 'entry event' })
    expect(fetcher).toHaveBeenCalledTimes(1)
  })
  it('stops without reading more when a search returns other journeys', async () => {
    const fetcher = vi.fn(async () => ({ items: mine(5, { definitionId: 'other' }), count: 900000 }))
    await expect(fetchJourneyHistory('s7', withEvent, { start: 's', end: 'e', matcher, versions, fetcher }))
      .rejects.toMatchObject({ code: 'HISTORY_NOT_FILTERED' })
    expect(fetcher).toHaveBeenCalledTimes(1)
    await expect(fetchJourneyHistory('s7', journey, { start: 's', end: 'e', matcher, versions, fetcher }))
      .rejects.toMatchObject({ code: 'HISTORY_NOT_FILTERED' })
  })
  it('says when the search is refused, and passes other errors on', async () => {
    const refused = Object.assign(new Error('SFMC API error 400'), { status: 400 })
    await expect(fetchJourneyHistory('s7', withEvent, { start: 's', end: 'e', matcher, versions, fetcher: vi.fn().mockRejectedValue(refused) }))
      .rejects.toMatchObject({ code: 'HISTORY_SEARCH_REFUSED' })
    const session = Object.assign(new Error('session expired'), { status: 401 })
    await expect(fetchJourneyHistory('s7', withEvent, { start: 's', end: 'e', matcher, versions, fetcher: vi.fn().mockRejectedValue(session) }))
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
