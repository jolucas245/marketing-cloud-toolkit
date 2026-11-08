// Journey versions, entry event cards and email step profile names (live test, 2026-11-07).
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { primaryVersion, groupJourneyVersions, fetchSendNames, describeJourneyNode, journeyGraph, hasEmailStep } from '../journeys.js'
import { describeEventDefinition, eventIconType, eventAutomationId } from '../journeyApi.js'
import { groupVersions, journeyVersionKey } from '../usage/sources.js'
import { formatDateTime } from '../format.js'
import { formatValue } from '../activityTypes.js'

// One journey with three versions, as Journey Builder lists them with mostRecentVersionOnly=false.
const VERSIONS = [
  { id: 'J1', key: 'k1', name: 'Onboarding', version: 3, status: 'Draft', modifiedDate: '2025-05-12T00:08:02.64' },
  { id: 'J2', key: 'k2', name: 'Renewal', version: 1, status: 'Draft', modifiedDate: '2025-05-01T00:00:00' },
  { id: 'J1', key: 'k1', name: 'Onboarding', version: 1, status: 'Unpublished', modifiedDate: '2025-04-19T23:24:36.427' },
  { id: 'J1', key: 'k1', name: 'Onboarding', version: 2, status: 'Published', modifiedDate: '2025-04-19T23:24:36.427' },
]

describe('journey versions', () => {
  it('prefers the published version over a newer draft', () => {
    expect(primaryVersion(VERSIONS.filter((v) => v.id === 'J1')).version).toBe(2)
    expect(primaryVersion([{ version: 1, status: 'Stopped' }, { version: 2, status: 'Draft' }]).version).toBe(2)
    expect(primaryVersion([{ version: 1, status: 'Paused' }, { version: 2, status: 'Draft' }]).version).toBe(1)
    expect(primaryVersion([])).toBeNull()
  })

  it('groups the versions of each journey for the Contact journeys picker', () => {
    const groups = groupJourneyVersions(VERSIONS)
    expect(groups.map((g) => g.id)).toEqual(['J1', 'J2'])
    expect(groups[0].versions.map((v) => `${v.version} ${v.status}`)).toEqual(['3 Draft', '2 Published', '1 Unpublished'])
    expect(groups[0].primary).toMatchObject({ version: 2, status: 'Published' })
    expect(groups[1].primary).toMatchObject({ version: 1, status: 'Draft' })
  })

  it('keeps versions together, newest first, in the Where used list', () => {
    expect(groupVersions(VERSIONS).map(journeyVersionKey)).toEqual(['J1#3', 'J1#2', 'J1#1', 'J2#1'])
  })
})

describe('entry event card', () => {
  const ev = {
    id: 'EV1', type: 'EmailAudience', name: 'Onboarding entry', eventDefinitionKey: 'DEAudience-1', category: 'Audience',
    createdDate: '2025-04-18T12:18:03.773', createdBy: 715000001, modifiedDate: '2025-04-18T12:20:35.21', modifiedBy: 715000001,
    interactionCount: 3, publishedInteractionCount: 1, automationId: 'A-GUID', iconUrl: '/images/icon-data-extension.svg',
  }
  const main = (e) => Object.fromEntries(describeEventDefinition(e).main)
  const extra = (e) => Object.fromEntries(describeEventDefinition(e).extra)

  it('formats the dates and labels the user IDs as IDs', () => {
    expect(main(ev).Created).toBe(formatDateTime(ev.createdDate))
    expect(main(ev).Created).not.toContain('T12:18')
    expect(main(ev).Modified).toBe(formatDateTime(ev.modifiedDate))
    expect(main(ev)['Created by']).toBeUndefined()
    expect(extra(ev)['Created by (user ID)']).toBe('715000001')
    expect(extra(ev)['Modified by (user ID)']).toBe('715000001')
    expect(main({ ...ev, modifiedDate: '0001-01-01T00:00:00' }).Modified).toBe(formatValue(''))
  })

  it('counts journey versions, not journeys', () => {
    expect(main(ev)['Journey versions using it']).toBe('3')
    expect(main(ev)['Journey status']).toBe('Active (1 published version)')
    expect(main({ ...ev, publishedInteractionCount: 2 })['Journey status']).toBe('Active (2 published versions)')
    expect(main({ ...ev, publishedInteractionCount: 0 })['Journey status']).toBe('Not active')
  })

  it('uses a Toolkit icon, not the white Journey Builder glyph', () => {
    const d = describeEventDefinition(ev)
    expect(d.icon).toBeNull()
    expect(d.iconType).toBe('audience')
    expect(eventIconType({ type: 'APIEvent', category: 'Event' })).toBe('journey')
    expect(eventIconType({ type: 'SalesforceObjectTriggerV2', category: 'Event' })).toBe('journey')
  })

  it('leaves out the empty automation GUID', () => {
    expect(main(ev)['Automation ID']).toBe('A-GUID')
    expect(eventAutomationId({ automationId: '00000000-0000-0000-0000-000000000000' })).toBeNull()
    expect(main({ ...ev, automationId: '00000000-0000-0000-0000-000000000000' })['Automation ID']).toBeUndefined()
  })
})

describe('email step profile names', () => {
  const SC = 'aaaaaaaa-0000-0000-0000-000000000001'
  const SP = 'aaaaaaaa-0000-0000-0000-000000000002'
  const DP = 'AAAAAAAA-0000-0000-0000-000000000003'
  const journey = {
    id: 'J', version: 1,
    activities: [{ key: 'EMAILV2-1', name: 'Hello', type: 'EMAILV2', outcomes: [],
      configurationArguments: { triggeredSend: { emailId: 1, sendClassificationId: SC, senderProfileId: SP, deliveryProfileId: DP } } }],
  }
  const node = journeyGraph(journey).nodes.find((n) => n.key === 'EMAILV2-1')
  const lists = {
    sendClassifications: [{ id: SC, name: 'Default Commercial' }],
    senderProfiles: [{ id: SP, name: 'Marketing team', fromName: 'News', fromEmail: 'news@example.com' }],
    deliveryProfiles: [{ id: DP.toLowerCase(), name: 'Default' }],
  }
  const fake = (fail = []) => vi.fn(async (url) => {
    const list = Object.keys(lists).find((k) => url.includes(`/messaging-internal/v1/${k}?`))
    if (!list || fail.includes(list)) throw new Error('SFMC API error 500')
    expect(url).toMatch(/^https:\/\/jbinteractions\.s10\.marketingcloudapps\.com\/fuelapi\/messaging-internal\/v1\//)
    return { count: lists[list].length, items: lists[list] }
  })

  it('shows names when Journey Builder gives them, with the IDs under additional details', async () => {
    const names = await fetchSendNames('s10', fake())
    const d = describeJourneyNode(node, (k) => k, names)
    const main = Object.fromEntries(d.main)
    expect(main['Send classification']).toBe('Default Commercial')
    expect(main['Sender profile']).toBe('Marketing team (from News <news@example.com>)')
    expect(main['Delivery profile']).toBe('Default')
    expect(Object.fromEntries(d.extra)['Send classification ID']).toBe(SC)
    expect(hasEmailStep(journey)).toBe(true)
  })

  it('labels them as IDs when the names are not known', async () => {
    const names = await fetchSendNames('s10', fake(['senderProfiles']))
    const main = Object.fromEntries(describeJourneyNode(node, (k) => k, names).main)
    expect(main['Sender profile']).toBeUndefined()
    expect(main['Sender profile ID']).toBe(SP)
    expect(main['Send classification']).toBe('Default Commercial')
    const bare = Object.fromEntries(describeJourneyNode(node).main)
    expect(bare).toMatchObject({ 'Send classification ID': SC, 'Sender profile ID': SP, 'Delivery profile ID': DP })
  })

  it('fails when no list can be read, so it is tried again later', async () => {
    await expect(fetchSendNames('s10', fake(Object.keys(lists)))).rejects.toThrow('500')
  })
})

describe('journey list with every version', () => {
  beforeEach(() => vi.unstubAllGlobals())
  it('asks Journey Builder for every version when allVersions is set', async () => {
    const urls = []
    vi.stubGlobal('chrome', { runtime: { lastError: null, sendMessage(m, cb) { urls.push(m.url); cb({ data: { count: 0, items: [] } }) } } })
    const { searchJourneys } = await import('../journeys.js')
    await searchJourneys('s10', { query: 'x', allVersions: true })
    await searchJourneys('s10', { query: 'x' })
    expect(urls[0]).toContain('mostRecentVersionOnly=false')
    expect(urls[1]).toContain('mostRecentVersionOnly=true')
  })
})
