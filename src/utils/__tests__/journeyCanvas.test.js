import { describe, it, expect } from 'vitest'
import { journeyGraph, layoutJourney } from '../journeys.js'
import { journeyActivityVisual, journeyCanvasModel, JOURNEY_ICON_PATHS } from '../journeyCanvas.js'

const journey = {
  triggers: [{ type: 'EmailAudience', name: 'Sample audience' }],
  activities: [
    { key: 'email-original-key', type: 'EMAILV2', name: 'Welcome', configurationArguments: { triggeredSend: { emailId: 123, emailSubject: 'Hello' } }, outcomes: [{ next: 'split' }] },
    { key: 'split', type: 'MULTICRITERIADECISION', name: 'Opened?', outcomes: [{ next: 'wait', metaData: { label: 'Yes' } }, { next: 'mobile', metaData: { label: 'No' } }] },
    { key: 'wait', type: 'WAIT', name: 'Wait', configurationArguments: { waitDuration: 3, waitUnit: 'DAYS' }, outcomes: [] },
    { key: 'mobile', type: 'WHATSAPPACTIVITY', name: 'Reminder', outcomes: [] },
  ],
}

describe('Journey canvas adapter', () => {
  const graph = journeyGraph(journey)
  const layout = layoutJourney(graph)

  it('preserves activity identity and configuration summaries without changing the definition', () => {
    const before = JSON.stringify(graph)
    const model = journeyCanvasModel(graph, layout, 'horizontal', 'email-original-key')
    expect(model.nodes.find((node) => node.id === 'email-original-key').data).toMatchObject({ key: 'email-original-key', active: true, summary: 'Subject: Hello', visual: { icon: 'email' } })
    expect(model.nodes.find((node) => node.id === 'wait').data.summary).toBe('3 days')
    expect(JSON.stringify(graph)).toBe(before)
    expect(model.nodes.every((node) => !node.draggable && !node.connectable)).toBe(true)
  })

  it('keeps the first branch straight and the other branch in its own lane', () => {
    const model = journeyCanvasModel(graph, layout)
    const at = (id) => model.nodes.find((node) => node.id === id).position
    expect(at('wait').y).toBe(at('split').y)
    expect(at('mobile').y).toBeGreaterThan(at('split').y)
    expect(model.edges.filter((edge) => edge.source === 'split').map((edge) => edge.data.label)).toEqual(['Yes', 'No'])
    const vertical = journeyCanvasModel(graph, layout, 'vertical')
    expect(vertical.nodes.find((node) => node.id === 'wait').position.x).toBe(vertical.nodes.find((node) => node.id === 'split').position.x)
  })

  it.each(['horizontal', 'vertical'])('distinguishes parallel paths and handles returns in %s without dropping activities', (orientation) => {
    const complex = { ...graph, edges: [...graph.edges, { from: 'split', to: 'wait', label: 'Other' }, { from: 'wait', to: 'split', label: 'Return' }, { from: 'split', to: 'missing', label: 'Unresolved' }] }
    const model = journeyCanvasModel(complex, layout, orientation)
    const parallel = model.edges.filter((edge) => edge.source === 'split' && edge.target === 'wait')
    expect(parallel).toHaveLength(2)
    expect(parallel[0].id).not.toBe(parallel[1].id)
    expect(parallel[0].data.path).not.toBe(parallel[1].data.path)
    expect(model.edges.find((edge) => edge.data.label === 'Return').data.path).not.toMatch(/NaN|undefined/)
    expect(model.edges.some((edge) => edge.target === 'missing')).toBe(false)
    expect(model.nodes).toHaveLength(graph.nodes.length)
  })

  it.each([
    ['ABNTEST', 'optimizer'], ['INAPPSYNCACTIVITY', 'mobile'], ['INBOXACTIVITY', 'inbox'],
    ['SALESCLOUDACTIVITY', 'cloud'], ['WHATSAPPACTIVITY', 'whatsapp'], ['ENGAGEMENTSPLIT', 'engagement'],
    ['WAITUNTILEVENT', 'wait'], ['PartnerSpecificType', 'custom'],
  ])('provides a local icon for %s', (type, icon) => {
    expect(journeyActivityVisual(type).icon).toBe(icon)
    expect(JOURNEY_ICON_PATHS[icon].length).toBeGreaterThan(0)
  })

  it('supports an empty graph', () => {
    expect(journeyCanvasModel({ nodes: [], edges: [] }, { pos: new Map() })).toEqual({ nodes: [], edges: [] })
  })
})
