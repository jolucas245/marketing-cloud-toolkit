import { describe, expect, it } from 'vitest'
import { describeJourneyNode, journeyDoc, journeyGraph, layoutJourney, nodeDisplayType, nodeSummary, nodeTypeLabel } from '../journeys.js'
import { journeyActivityVisual, journeyCanvasModel } from '../journeyCanvas.js'
import { formatDateTime } from '../format.js'

const date = '2027-01-11T12:30:00Z'
const activity = (overrides = {}) => ({
  key: 'WAITUNTILSPECIFICDATE-1', type: 'WAIT', name: 'Wait',
  metaData: { uiType: 'WAITUNTILSPECIFICDATE', isConfigured: false },
  outcomes: [], ...overrides,
})

function modelOf(raw, orientation = 'horizontal') {
  const graph = journeyGraph({ activities: [raw] })
  return { graph, model: journeyCanvasModel(graph, layoutJourney(graph), orientation, raw.key) }
}

describe('Wait Until Date presentation', () => {
  it.each(['WAITUNTILSPECIFICDATE', 'WAITUNTILDATE'])('recognizes %s as a subtype of generic WAIT', (uiType) => {
    const raw = activity({ metaData: { uiType, isConfigured: false } })
    expect(nodeDisplayType(raw)).toBe(uiType)
    expect(nodeTypeLabel(uiType)).toBe('Wait Until Date')
    const { graph, model } = modelOf(raw)
    const node = graph.nodes.find((node) => node.key === raw.key)
    expect(node.type).toBe('WAIT')
    expect(node.raw).toBe(raw)
    expect(node.name).toBe('Wait Until Date')
    expect(model.nodes.find((node) => node.id === raw.key).data).toMatchObject({
      key: raw.key, name: 'Wait Until Date', typeLabel: 'Wait Until Date', active: true,
      visual: { icon: 'waitDate', shape: 'diamond', color: '#a8b7c7' },
    })
    expect(describeJourneyNode(node).typeLabel).toBe('Wait Until Date')
  })

  it.each(['Wait', 'WAIT', 'WAITUNTILSPECIFICDATE', 'WAITUNTILDATE', 'Wait until date', '', undefined])('replaces the automatic name %s with the official label', (name) => {
    const raw = activity({ name })
    const { graph } = modelOf(raw)
    expect(graph.nodes.find((node) => node.key === raw.key).name).toBe('Wait Until Date')
  })

  it.each(['WAITUNTILSPECIFICDATE', 'WaitUntilSpecificDate', 'WAITUNTILDATE'])('supports a direct activity type of %s', (type) => {
    const raw = activity({ type, name: type, metaData: { isConfigured: false } })
    const { model } = modelOf(raw)
    expect(model.nodes.find((node) => node.id === raw.key).data).toMatchObject({
      name: 'Wait Until Date', typeLabel: 'Wait Until Date', visual: { icon: 'waitDate' },
    })
  })

  it.each(['horizontal', 'vertical'])('preserves custom names, keys, input data and date settings in %s', (orientation) => {
    const raw = activity({ name: 'Aguardar fechamento', configurationArguments: { specifiedDateTime: date, timeZone: 'UTC' }, metaData: { uiType: 'WAITUNTILSPECIFICDATE', isConfigured: true } })
    const before = JSON.stringify(raw)
    const { graph, model } = modelOf(raw, orientation)
    const node = graph.nodes.find((node) => node.key === raw.key)
    const display = model.nodes.find((node) => node.id === raw.key)
    expect(display.data).toMatchObject({ key: raw.key, name: 'Aguardar fechamento', typeLabel: 'Wait Until Date', active: true, summary: `Until ${formatDateTime(date)}`, visual: { icon: 'waitDate', color: '#f58a00' } })
    expect(describeJourneyNode(node)).toMatchObject({ title: 'Aguardar fechamento', typeLabel: 'Wait Until Date', main: [['Until', formatDateTime(date)], ['Time zone', 'UTC']] })
    expect(journeyDoc({ name: 'Synthetic journey' }, graph, layoutJourney(graph)).blocks).toContainEqual({ type: 'h', level: 3, text: 'Wait Until Date: Aguardar fechamento' })
    expect(JSON.stringify(raw)).toBe(before)
  })

  it('adds the date summary for an activity passed without a graph wrapper', () => {
    expect(nodeSummary(activity({ configurationArguments: { specifiedDateTime: date } }))).toBe(`Until ${formatDateTime(date)}`)
  })

  it('does not infer a date wait from its key alone', () => {
    const raw = activity({ metaData: { isConfigured: false } })
    const { model } = modelOf(raw)
    expect(model.nodes.find((node) => node.id === raw.key).data).toMatchObject({ name: 'Wait', typeLabel: 'Wait', visual: { icon: 'wait' } })
  })

  it.each(['WAITBYDURATION', 'WAITUNTILAPI', 'UnknownType'])('keeps the unrelated uiType %s as a duration wait without repeating its name', (uiType) => {
    const raw = activity({ key: 'plain-wait', name: '3 days', configurationArguments: { waitDuration: 3, waitUnit: 'DAYS' }, metaData: { uiType, isConfigured: true } })
    expect(nodeDisplayType(raw)).toBe('WAIT')
    const { model } = modelOf(raw)
    expect(model.nodes.find((node) => node.id === raw.key).data).toMatchObject({ name: '3 days', typeLabel: 'Wait', summary: '', visual: { icon: 'wait', color: '#f58a00' } })
  })

  it.each(['STOWAIT', 'EMAILV2', 'PartnerSpecificType'])('does not override the real type %s based on uiType', (type) => {
    expect(nodeDisplayType(activity({ type }))).toBe(type)
  })

  it('preserves the Einstein STO appearance', () => {
    expect(journeyActivityVisual(nodeDisplayType(activity({ type: 'STOWAIT' })))).toEqual({ icon: 'wait', shape: 'diamond', color: '#032d60' })
  })
})
