import { describe, expect, it } from 'vitest'
import { describeJourneyNode, journeyDoc, journeyGraph, layoutJourney, nodeDisplayType, nodeSummary } from '../journeys.js'
import { journeyCanvasModel } from '../journeyCanvas.js'

const activity = (overrides = {}) => ({
  key: 'chat-response-synthetic', type: 'WAITUNTILCHATRESPONSE', name: 'WAITUNTILCHATRESPONSE',
  metaData: { isConfigured: false }, outcomes: [], ...overrides,
})

function modelOf(raw, orientation = 'horizontal') {
  const graph = journeyGraph({ activities: [raw] })
  const layout = layoutJourney(graph)
  return { graph, layout, model: journeyCanvasModel(graph, layout, orientation, raw.key) }
}

describe('Wait Until Chat Response presentation', () => {
  it.each(['WAITUNTILCHATRESPONSE', 'WaitUntilChatResponse', 'waituntilchatresponse'])('supports the direct type %s', (type) => {
    const raw = activity({ type, name: type })
    const { graph, model } = modelOf(raw)
    const node = graph.nodes.find((node) => node.key === raw.key)
    expect(node).toMatchObject({ type, name: 'Wait Until Chat Response' })
    expect(node.raw).toBe(raw)
    expect(model.nodes.find((node) => node.id === raw.key).data).toMatchObject({
      key: raw.key, name: 'Wait Until Chat Response', typeLabel: 'Wait Until Chat Response', active: true,
      visual: { icon: 'waitChat', shape: 'diamond', color: '#a8b7c7' },
    })
    expect(describeJourneyNode(node).typeLabel).toBe('Wait Until Chat Response')
  })

  it.each(['WAITUNTILCHATRESPONSE', 'WaitUntilChatResponse', 'waituntilchatresponse'])('recognizes an explicit WAIT uiType %s', (uiType) => {
    const raw = activity({ type: 'WAIT', name: 'Wait', metaData: { uiType, isConfigured: false } })
    expect(nodeDisplayType(raw)).toBe('WAITUNTILCHATRESPONSE')
    const { graph, model } = modelOf(raw)
    expect(graph.nodes.find((node) => node.key === raw.key)).toMatchObject({ type: 'WAIT', name: 'Wait Until Chat Response' })
    expect(model.nodes.find((node) => node.id === raw.key).data.visual.icon).toBe('waitChat')
  })

  it.each(['WAITUNTILCHATRESPONSE', 'WaitUntilChatResponse', 'WAIT', 'Wait', 'Wait Until Chat Response', '', undefined])('normalizes the automatic name %s', (name) => {
    const raw = activity({ name })
    expect(modelOf(raw).graph.nodes.find((node) => node.key === raw.key).name).toBe('Wait Until Chat Response')
  })

  it.each([
    [{ isConfigured: false }, '#a8b7c7'],
    [{ isConfigured: true }, '#f58a00'],
    [{}, '#f58a00'],
    [undefined, '#f58a00'],
  ])('only explicit false forces gray with metadata %j', (metaData, color) => {
    const raw = activity({ metaData })
    expect(modelOf(raw).model.nodes.find((node) => node.id === raw.key).data.visual).toEqual({ icon: 'waitChat', shape: 'diamond', color })
  })

  it.each(['horizontal', 'vertical'])('preserves custom names, configuration, outcomes and raw data in %s', (orientation) => {
    const raw = activity({
      name: 'Synthetic chat follow-up', configurationArguments: { waitDuration: 2, waitUnit: 'DAYS' },
      outcomes: [{ metaData: { label: 'Response received' } }, { metaData: { label: 'No response' } }],
    })
    const before = JSON.stringify(raw)
    const { graph, layout, model } = modelOf(raw, orientation)
    const node = graph.nodes.find((node) => node.key === raw.key)
    expect(model.nodes.find((node) => node.id === raw.key).data).toMatchObject({ name: raw.name, typeLabel: 'Wait Until Chat Response', summary: '2 paths', active: true })
    expect(nodeSummary(raw)).toBe('2 paths')
    expect(describeJourneyNode(node)).toMatchObject({ title: raw.name, typeLabel: 'Wait Until Chat Response', main: [['Wait', '2 days']] })
    expect(model.edges.filter((edge) => edge.source === raw.key).map((edge) => edge.data.label)).toEqual(['Response received', 'No response'])
    expect(model.edges.every((edge) => !/NaN|undefined/.test(edge.data.path))).toBe(true)
    expect(journeyDoc({ name: 'Synthetic journey' }, graph, layout).blocks).toContainEqual({ type: 'h', level: 3, text: 'Wait Until Chat Response: Synthetic chat follow-up' })
    expect(JSON.stringify(raw)).toBe(before)
  })

  it('does not infer the chat subtype from a WAIT key or name', () => {
    const raw = activity({ key: 'WAITUNTILCHATRESPONSE-1', type: 'WAIT' })
    expect(nodeDisplayType(raw)).toBe('WAIT')
    expect(modelOf(raw).model.nodes.find((node) => node.id === raw.key).data.visual.icon).toBe('wait')
  })

  it.each(['STOWAIT', 'EMAILV2', 'PartnerSpecificType'])('does not override unrelated type %s based on uiType', (type) => {
    expect(nodeDisplayType(activity({ type, metaData: { uiType: 'WAITUNTILCHATRESPONSE' } }))).toBe(type)
  })

  it.each(['WAITUNTILSPECIFICDATE', 'WAITUNTILDATE', 'WAITBYATTRIBUTE'])('keeps the neighboring wait subtype %s', (uiType) => {
    expect(nodeDisplayType(activity({ type: 'WAIT', metaData: { uiType } }))).toBe(uiType)
  })
})
