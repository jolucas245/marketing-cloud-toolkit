import { describe, expect, it } from 'vitest'
import { describeJourneyNode, journeyDoc, journeyGraph, layoutJourney, nodeDisplayType, nodeSummary, nodeTypeLabel } from '../journeys.js'
import { journeyCanvasModel } from '../journeyCanvas.js'

const activity = (overrides = {}) => ({
  key: 'WAITBYATTRIBUTE-1', type: 'WAIT', name: 'Wait',
  metaData: { uiType: 'WAITBYATTRIBUTE', isConfigured: false },
  outcomes: [], ...overrides,
})

function modelOf(raw, orientation = 'horizontal') {
  const graph = journeyGraph({ activities: [raw] })
  return { graph, model: journeyCanvasModel(graph, layoutJourney(graph), orientation, raw.key) }
}

describe('Wait By Attribute presentation', () => {
  it.each(['WAITBYATTRIBUTE', 'WaitByAttribute', 'waitbyattribute'])('recognizes the generic WAIT subtype %s', (uiType) => {
    const raw = activity({ metaData: { uiType, isConfigured: false } })
    expect(nodeDisplayType(raw)).toBe('WAITBYATTRIBUTE')
    expect(nodeTypeLabel(nodeDisplayType(raw))).toBe('Wait By Attribute')
    const { graph, model } = modelOf(raw)
    const node = graph.nodes.find((node) => node.key === raw.key)
    expect(node.type).toBe('WAIT')
    expect(node.raw).toBe(raw)
    expect(node.name).toBe('Wait By Attribute')
    expect(model.nodes.find((node) => node.id === raw.key).data).toMatchObject({
      key: raw.key, name: 'Wait By Attribute', typeLabel: 'Wait By Attribute', active: true,
      visual: { icon: 'waitAttribute', shape: 'diamond', color: '#a8b7c7' },
    })
    expect(describeJourneyNode(node).typeLabel).toBe('Wait By Attribute')
  })

  it.each(['Wait', 'WAIT', 'WAITBYATTRIBUTE', 'Wait By Attribute', '', undefined])('normalizes the automatic name %s', (name) => {
    const raw = activity({ name })
    expect(modelOf(raw).graph.nodes.find((node) => node.key === raw.key).name).toBe('Wait By Attribute')
  })

  it.each(['WAITBYATTRIBUTE', 'WaitByAttribute'])('supports the direct type %s', (type) => {
    const raw = activity({ type, name: type, metaData: { isConfigured: false } })
    expect(modelOf(raw).model.nodes.find((node) => node.id === raw.key).data).toMatchObject({
      name: 'Wait By Attribute', typeLabel: 'Wait By Attribute', visual: { icon: 'waitAttribute' },
    })
  })

  it.each(['horizontal', 'vertical'])('preserves custom names, attribute settings, keys and raw data in %s', (orientation) => {
    const raw = activity({ name: 'Aguardar aniversario', configurationArguments: { attributeName: 'BirthDate' }, metaData: { uiType: 'WAITBYATTRIBUTE', isConfigured: true } })
    const before = JSON.stringify(raw)
    const { graph, model } = modelOf(raw, orientation)
    const node = graph.nodes.find((node) => node.key === raw.key)
    expect(model.nodes.find((node) => node.id === raw.key).data).toMatchObject({
      key: raw.key, name: 'Aguardar aniversario', typeLabel: 'Wait By Attribute', summary: 'BirthDate', active: true,
      visual: { icon: 'waitAttribute', color: '#f58a00' },
    })
    expect(describeJourneyNode(node)).toMatchObject({ title: 'Aguardar aniversario', typeLabel: 'Wait By Attribute', main: [['Attribute', 'BirthDate']] })
    expect(journeyDoc({ name: 'Synthetic journey' }, graph, layoutJourney(graph)).blocks).toContainEqual({ type: 'h', level: 3, text: 'Wait By Attribute: Aguardar aniversario' })
    expect(JSON.stringify(raw)).toBe(before)
  })

  it.each(['attributeName', 'waitForAttribute'])('reads the summary from %s', (field) => {
    expect(nodeSummary(activity({ configurationArguments: { [field]: 'RenewalDate' } }))).toBe('RenewalDate')
  })

  it('does not infer the subtype from the activity key', () => {
    const raw = activity({ metaData: { isConfigured: false } })
    expect(modelOf(raw).model.nodes.find((node) => node.id === raw.key).data).toMatchObject({ name: 'Wait', typeLabel: 'Wait', visual: { icon: 'wait' } })
  })

  it.each(['WAITUNTILSPECIFICDATE', 'WAITUNTILDATE'])('preserves date subtype %s', (uiType) => {
    const raw = activity({ metaData: { uiType, isConfigured: false } })
    expect(modelOf(raw).model.nodes.find((node) => node.id === raw.key).data).toMatchObject({ name: 'Wait Until Date', typeLabel: 'Wait Until Date', visual: { icon: 'waitDate' } })
  })

  it.each(['WAITBYDURATION', 'WAITUNTILPUSHENGAGEMENT', 'UnknownType'])('keeps the unrelated subtype %s unchanged', (uiType) => {
    const raw = activity({ metaData: { uiType, isConfigured: true } })
    expect(nodeDisplayType(raw)).toBe('WAIT')
    expect(modelOf(raw).model.nodes.find((node) => node.id === raw.key).data.visual.icon).toBe('wait')
  })

  it.each(['STOWAIT', 'EMAILV2', 'PartnerSpecificType'])('does not override the real type %s', (type) => {
    expect(nodeDisplayType(activity({ type }))).toBe(type)
  })
})
