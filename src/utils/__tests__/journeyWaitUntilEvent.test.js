import { describe, expect, it } from 'vitest'
import { describeJourneyNode, journeyDoc, journeyGraph, layoutJourney, nodeDisplayType, nodeSummary } from '../journeys.js'
import { journeyCanvasModel } from '../journeyCanvas.js'

const activity = (overrides = {}) => ({
  key: 'event-wait-synthetic', type: 'WAITUNTILAPI', name: 'WAITUNTILAPI',
  metaData: { isConfigured: false }, outcomes: [], ...overrides,
})

function modelOf(raw, orientation = 'horizontal') {
  const graph = journeyGraph({ activities: [raw] })
  const layout = layoutJourney(graph)
  return { graph, layout, model: journeyCanvasModel(graph, layout, orientation, raw.key) }
}

describe('Wait Until Event presentation', () => {
  it.each(['WAITUNTILAPI', 'WaitUntilApi', 'waituntilapi', 'WAITUNTILEVENT', 'WaitUntilEvent'])('supports the direct type %s', (type) => {
    const raw = activity({ type, name: type })
    const { graph, model } = modelOf(raw)
    const node = graph.nodes.find((node) => node.key === raw.key)
    expect(node).toMatchObject({ type, name: 'Wait Until Event' })
    expect(node.raw).toBe(raw)
    expect(model.nodes.find((node) => node.id === raw.key).data).toMatchObject({
      key: raw.key, name: 'Wait Until Event', typeLabel: 'Wait Until Event', active: true,
      visual: { icon: 'waitEvent', shape: 'diamond', color: '#a8b7c7' },
    })
    expect(describeJourneyNode(node).typeLabel).toBe('Wait Until Event')
  })

  it.each(['WAITUNTILAPI', 'WaitUntilApi', 'WAITUNTILEVENT', 'WaitUntilEvent'])('recognizes an explicit WAIT uiType %s without changing the raw type', (uiType) => {
    const raw = activity({ type: 'WAIT', name: 'Wait', metaData: { uiType, isConfigured: false } })
    expect(nodeDisplayType(raw)).toBe(uiType.toUpperCase())
    const { graph, model } = modelOf(raw)
    expect(graph.nodes.find((node) => node.key === raw.key)).toMatchObject({ type: 'WAIT', name: 'Wait Until Event' })
    expect(model.nodes.find((node) => node.id === raw.key).data.visual.icon).toBe('waitEvent')
  })

  it.each(['WAITUNTILAPI', 'WAITUNTILEVENT', 'WAIT', 'Wait', 'Wait Until Event', '', undefined])('normalizes the automatic name %s', (name) => {
    const raw = activity({ name })
    expect(modelOf(raw).graph.nodes.find((node) => node.key === raw.key).name).toBe('Wait Until Event')
  })

  it.each([
    [{ isConfigured: false }, '#a8b7c7'],
    [{ isConfigured: true }, '#f58a00'],
    [{}, '#f58a00'],
    [undefined, '#f58a00'],
  ])('only explicit false forces gray with metadata %j', (metaData, color) => {
    const raw = activity({ metaData })
    expect(modelOf(raw).model.nodes.find((node) => node.id === raw.key).data.visual).toEqual({ icon: 'waitEvent', shape: 'diamond', color })
  })

  it.each(['horizontal', 'vertical'])('preserves custom names, configuration, outcomes and raw data in %s', (orientation) => {
    const raw = activity({
      name: 'Synthetic event follow-up', configurationArguments: { waitDuration: 2, waitUnit: 'DAYS' },
      outcomes: [
        { arguments: { when: 'EventFired' }, metaData: { label: 'Event occurred' } },
        { arguments: { when: 'WaitExpired' }, metaData: { label: 'No event' } },
      ],
    })
    const before = JSON.stringify(raw)
    const { graph, layout, model } = modelOf(raw, orientation)
    const node = graph.nodes.find((node) => node.key === raw.key)
    expect(model.nodes.find((node) => node.id === raw.key).data).toMatchObject({ name: raw.name, typeLabel: 'Wait Until Event', summary: '2 paths', active: true })
    expect(nodeSummary(raw)).toBe('2 paths')
    expect(describeJourneyNode(node)).toMatchObject({ title: raw.name, typeLabel: 'Wait Until Event', main: [['Wait', '2 days']] })
    expect(model.edges.filter((edge) => edge.source === raw.key).map((edge) => edge.data.label)).toEqual(['Event occurred', 'No event'])
    expect(model.edges.every((edge) => !/NaN|undefined/.test(edge.data.path))).toBe(true)
    expect(journeyDoc({ name: 'Synthetic journey' }, graph, layout).blocks).toContainEqual({ type: 'h', level: 3, text: 'Wait Until Event: Synthetic event follow-up' })
    expect(JSON.stringify(raw)).toBe(before)
  })

  it('does not infer the event subtype from a WAIT key or name', () => {
    const raw = activity({ key: 'WAITUNTILAPI-1', type: 'WAIT' })
    expect(nodeDisplayType(raw)).toBe('WAIT')
    expect(modelOf(raw).model.nodes.find((node) => node.id === raw.key).data.visual.icon).toBe('wait')
  })

  it.each(['STOWAIT', 'EMAILV2', 'PartnerSpecificType'])('does not override unrelated type %s based on uiType', (type) => {
    expect(nodeDisplayType(activity({ type, metaData: { uiType: 'WAITUNTILAPI' } }))).toBe(type)
  })

  it.each(['WAITUNTILSPECIFICDATE', 'WAITUNTILDATE', 'WAITBYATTRIBUTE', 'WAITUNTILCHATRESPONSE'])('keeps the neighboring wait subtype %s', (uiType) => {
    expect(nodeDisplayType(activity({ type: 'WAIT', metaData: { uiType } }))).toBe(uiType)
  })
})
