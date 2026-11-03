import { describe, expect, it } from 'vitest'
import { describeJourneyNode, journeyDoc, journeyGraph, layoutJourney, nodeSummary } from '../journeys.js'
import { journeyCanvasModel } from '../journeyCanvas.js'

const activity = (overrides = {}) => ({
  key: 'duration-wait-synthetic', type: 'WAIT', name: '',
  configurationArguments: { waitDuration: 1, waitUnit: 'DAYS' },
  metaData: { uiType: 'WAITBYDURATION', isConfigured: true }, outcomes: [], ...overrides,
})

function modelOf(raw, orientation = 'horizontal') {
  const graph = journeyGraph({ activities: [raw] })
  const layout = layoutJourney(graph)
  return { graph, layout, model: journeyCanvasModel(graph, layout, orientation, raw.key) }
}

describe('Wait By Duration initial label', () => {
  it('shows one day on the first save when the API name is empty', () => {
    const raw = activity()
    const before = JSON.stringify(raw)
    const { graph, layout, model } = modelOf(raw)
    const node = graph.nodes.find((node) => node.key === raw.key)
    expect(node).toMatchObject({ type: 'WAIT', name: '1 day' })
    expect(node.raw).toBe(raw)
    expect(model.nodes.find((node) => node.id === raw.key).data).toMatchObject({
      key: raw.key, name: '1 day', summary: '', active: true,
      visual: { icon: 'wait', shape: 'diamond', color: '#f58a00' },
    })
    expect(describeJourneyNode(node)).toMatchObject({ title: '1 day', main: [['Wait', '1 day']] })
    expect(journeyDoc({ name: 'Synthetic journey' }, graph, layout).blocks).toContainEqual({ type: 'h', level: 3, text: 'Wait: 1 day' })
    expect(JSON.stringify(raw)).toBe(before)
  })

  it.each([undefined, null, '', 'Wait', 'WAIT', 'WAITBYDURATION', 'Wait By Duration', ' Wait '])('derives a duration for the missing or generic name %j', (name) => {
    const raw = activity({ name })
    expect(modelOf(raw).model.nodes.find((node) => node.id === raw.key).data).toMatchObject({ name: '1 day', summary: '' })
  })

  it.each([
    [1, 'DAYS', '1 day'], [2, 'DAYS', '2 days'],
    [1, 'HOURS', '1 hour'], [2, 'HOURS', '2 hours'],
    [1, 'MINUTES', '1 minute'], [3, 'MINUTES', '3 minutes'],
    ['1', 'DAYS', '1 day'], ['2', 'DAYS', '2 days'],
    [1, 'day', '1 day'], [2, ' hours ', '2 hours'],
  ])('formats %s %s as %s without a repeated summary', (waitDuration, waitUnit, label) => {
    const raw = activity({ configurationArguments: { waitDuration, waitUnit } })
    const { graph, model } = modelOf(raw)
    const node = graph.nodes.find((node) => node.key === raw.key)
    expect(model.nodes.find((node) => node.id === raw.key).data).toMatchObject({ name: label, summary: '' })
    expect(nodeSummary(raw)).toBe(label)
    expect(describeJourneyNode(node).main).toContainEqual(['Wait', label])
  })

  it.each(['WAIT', 'Wait', 'WAITBYDURATION', 'WaitByDuration'])('supports the duration type %s without metadata', (type) => {
    const raw = activity({ type, name: type, metaData: {} })
    expect(modelOf(raw).model.nodes.find((node) => node.id === raw.key).data.name).toBe('1 day')
  })

  it('preserves names populated after editing the duration and returning to one day', () => {
    for (const [name, waitDuration] of [['2 days', 2], ['1 day', 1], ['Legacy wait name', 1]]) {
      const raw = activity({ name, configurationArguments: { waitDuration, waitUnit: 'DAYS' } })
      expect(modelOf(raw).model.nodes.find((node) => node.id === raw.key).data).toMatchObject({ name, summary: '' })
    }
  })

  it.each([
    {}, { waitDuration: 1 }, { waitUnit: 'DAYS' },
    { waitDuration: null, waitUnit: 'DAYS' }, { waitDuration: '', waitUnit: 'DAYS' },
    { waitDuration: true, waitUnit: 'DAYS' }, { waitDuration: 'invalid', waitUnit: 'DAYS' },
    { waitDuration: -1, waitUnit: 'DAYS' }, { waitDuration: Infinity, waitUnit: 'DAYS' },
    { waitDuration: 1, waitUnit: 'UNSUPPORTED' },
  ])('does not invent a duration for incomplete or invalid configuration %j', (configurationArguments) => {
    const raw = activity({ name: 'Wait', configurationArguments })
    expect(modelOf(raw).model.nodes.find((node) => node.id === raw.key).data).toMatchObject({ name: 'Wait', summary: '' })
  })

  it.each(['horizontal', 'vertical'])('keeps raw configuration, identity, colors and connections in %s', (orientation) => {
    const raw = activity({ metaData: { uiType: 'WAITBYDURATION', isConfigured: false } })
    const before = JSON.stringify(raw)
    const { graph, model } = modelOf(raw, orientation)
    expect(model.nodes.find((node) => node.id === raw.key).data).toMatchObject({ name: '1 day', active: true, visual: { color: '#a8b7c7' } })
    expect(model.edges.map((edge) => [edge.source, edge.target])).toEqual(graph.edges.map((edge) => [edge.from, edge.to]))
    expect(JSON.stringify(raw)).toBe(before)
  })

  it.each([
    ['WAITBYATTRIBUTE', 'Wait By Attribute', 'waitAttribute'],
    ['WAITUNTILSPECIFICDATE', 'Wait Until Date', 'waitDate'],
    ['WAITUNTILCHATRESPONSE', 'Wait Until Chat Response', 'waitChat'],
    ['WAITUNTILAPI', 'Wait Until Event', 'waitEvent'],
  ])('does not use a duration title for the explicit wait subtype %s', (uiType, name, icon) => {
    const raw = activity({ name: 'Wait', metaData: { uiType, isConfigured: false } })
    expect(modelOf(raw).model.nodes.find((node) => node.id === raw.key).data).toMatchObject({ name, visual: { icon } })
  })
})
