import { describe, it, expect, vi } from 'vitest'

// Feedback #1041, #1042: Where used linked automations by their REST GUID, so the name was
// missing and run history (which takes the list ID) failed.
const GUID = '11111111-2222-3333-4444-555555555555'
const LIST_ID = 'MCtoken123'
const responses = []
vi.mock('../sfmcApi.js', () => ({
  sfmcFetch: async (url) => {
    const r = responses.find(([re]) => re.test(url))
    if (!r) throw new Error(`unexpected ${url}`)
    return typeof r[1] === 'function' ? r[1](url) : r[1]
  },
}))

const { SOURCES } = await import('../usage/sources.js')
const { legacyAutomationId, isAutomationGuid } = await import('../automationApi.js')

describe('automation IDs in Where used and run history', () => {
  it('indexes automations by the list ID, not the REST GUID', async () => {
    responses.length = 0
    responses.push(
      [/automation\/definition\//, { entry: [{ id: LIST_ID, name: 'Nightly' }], totalResults: 1 }],
      [/automation\/v1\/automations\//, { id: GUID, name: 'Nightly', steps: [{ step: 1, activities: [{ activityObjectId: 'ACT-1', objectTypeId: 423, name: 'Worker' }] }] }],
    )
    const v = await SOURCES.automations.load({ stack: 's1', progress: () => {}, stop: () => false })
    const [e] = v.index.get('act-1')
    expect(e).toMatchObject({ automationId: LIST_ID, activityName: 'Worker' })
    expect(v.byId.get(e.automationId).name).toBe('Nightly')
  })

  it('ignores a GUID saved by an older scan', async () => {
    responses.length = 0
    responses.push([/automation\/definition\//, { entry: [{ id: LIST_ID, name: 'Nightly', modifiedDate: 'x' }], totalResults: 1 }])
    const saved = {
      byId: new Map([[LIST_ID, { id: LIST_ID, modifiedDate: 'x' }]]),
      details: new Map([[LIST_ID, { id: GUID, steps: [{ step: 1, activities: [{ activityObjectId: 'ACT-1', objectTypeId: 423 }] }] }]]),
    }
    const { value } = await SOURCES.automations.refresh(saved, { stack: 's1', progress: () => {}, stop: () => false })
    expect(value.index.get('act-1')[0].automationId).toBe(LIST_ID)
  })

  it('finds the list ID of an automation known by its GUID', async () => {
    responses.length = 0
    responses.push([/automation\/definition\//, { entry: [{ id: 'other', name: 'Nightly', key: 'k2' }, { id: LIST_ID, name: 'Nightly', key: 'k1' }] }])
    expect(isAutomationGuid(GUID)).toBe(true)
    expect(isAutomationGuid(LIST_ID)).toBe(false)
    expect(await legacyAutomationId('s1', { id: GUID, name: 'Nightly', key: 'K1' })).toBe(LIST_ID)
    // Two with the same name and no key match: not guessed.
    expect(await legacyAutomationId('s1', { id: GUID, name: 'Nightly' })).toBeNull()
  })
})
