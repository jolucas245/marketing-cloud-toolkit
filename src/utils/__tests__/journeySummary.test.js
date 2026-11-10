import { describe, it, expect } from 'vitest'
import { journeyStatusWord, entryModeWords, activityCount, journeyDurationMinutes, durationWords, journeyOverviewRows, populationByNode } from '../journeySummary.js'
import { journeyGraph } from '../journeys.js'

// TK_Paths_Test_Journey as read on s10 (2026-11-10): email, random split, two 1-minute waits.
const journey = {
  id: '59a5', key: 'TK', name: 'TK_Paths_Test_Journey', description: 'Test', version: 1, status: 'Published', entryMode: 'MultipleEntries',
  triggers: [{ name: 'TK_Paths_Test_Event', metaData: { eventDefinitionId: 'ev', eventDefinitionKey: 'TK_Paths_Test_Event' } }],
  activities: [
    { id: 'id-email', key: 'EMAILV2-1', type: 'EMAILV2', name: 'TK paths test email', outcomes: [{ next: 'RANDOMSPLIT-1' }] },
    { id: 'id-split', key: 'RANDOMSPLIT-1', type: 'RANDOMSPLIT', name: 'Random split', outcomes: [{ next: 'WAIT-2' }, { next: 'WAIT-1' }] },
    { id: 'id-w2', key: 'WAIT-2', type: 'WAIT', name: '1 minute', configurationArguments: { waitDuration: 1, waitUnit: 'MINUTES' }, outcomes: [{}] },
    { id: 'id-w1', key: 'WAIT-1', type: 'WAIT', name: '1 minute', configurationArguments: { waitDuration: 1, waitUnit: 'MINUTES' }, outcomes: [{}] },
  ],
}
const stats = { days: [{ dayNumber: 0, activities: [
  { activityId: 'start', activityType: 'StartActivity', cumulativePopulationForDay: 2 },
  { activityId: 'ev', activityType: 'APIEvent', cumulativePopulationForDay: 2 },
  { activityId: 'id-email', activityType: 'EMAILV2', cumulativePopulationForDay: 2 },
  { activityId: 'id-split', activityType: 'RANDOMSPLIT', cumulativePopulationForDay: 2 },
  { activityId: 'id-w2', activityType: 'WAIT', cumulativePopulationForDay: 1 },
  { activityId: 'id-w1', activityType: 'WAIT', cumulativePopulationForDay: 1 },
] }] }

describe("Journey Builder's journey details (2026-11-10)", () => {
  it('uses its words', () => {
    expect(journeyStatusWord('Published')).toBe('Running')
    expect(journeyStatusWord('Draft')).toBe('Draft')
    expect(entryModeWords('MultipleEntries')).toBe('Re-entry anytime')
    expect(entryModeWords('OnceAndDone')).toBe('No re-entry')
  })

  it('counts activities and the longest wait like its properties panel', () => {
    expect(activityCount(journey)).toBe(4)
    expect(journeyDurationMinutes(journey)).toBe(1)
    expect(durationWords(1)).toBe('1 Minute')
    expect(durationWords(3 * 1440 + 120)).toBe('3 Days 2 Hours')
    const dated = { ...journey, activities: [{ key: 'W', type: 'WAITUNTILDATE', configurationArguments: { specifiedDateTime: '2026-12-01' }, outcomes: [{}] }] }
    expect(journeyDurationMinutes(dated)).toBe(null)
  })

  it('lists the properties panel and the entry card', () => {
    const r = Object.fromEntries(journeyOverviewRows(journey, { event: { name: 'TK_Paths_Test_Event', dataExtensionName: 'TK_Paths_Test_Audience', eventDefinitionKey: 'TK_Paths_Test_Event' } }))
    expect(r).toMatchObject({ Status: 'Running', Version: 'Version 1', 'Activity count': '4', 'Journey duration': '1 Minute', 'Data extension': 'TK_Paths_Test_Audience', 'Event definition key': 'TK_Paths_Test_Event', 'Contact entry': 'Re-entry anytime', 'Definition ID': '59a5' })
  })

  it('puts its contact counts on the canvas nodes, exits after a single way out', () => {
    const graph = journeyGraph(journey)
    const pop = populationByNode(stats, journey, graph)
    expect(pop.get('__entry')).toBe(2)
    expect(pop.get('EMAILV2-1')).toBe(2)
    expect(pop.get('RANDOMSPLIT-1')).toBe(2)
    expect(pop.get('WAIT-1')).toBe(1)
    const exits = graph.nodes.filter((n) => n.type === 'EXIT').map((n) => pop.get(n.key))
    expect(exits).toEqual([1, 1])
    expect(populationByNode({ days: [] }, journey, graph)).toBe(null)
  })
})
