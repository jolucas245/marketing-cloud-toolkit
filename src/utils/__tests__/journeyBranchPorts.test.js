import { describe, expect, it } from 'vitest'
import { journeyGraph, layoutJourney } from '../journeys.js'
import { journeyFlowModel, journeyNodeAnchors } from '../journeyFlow.js'
import { journeyCanvasModel } from '../journeyCanvas.js'

const step = (key, type, destinations) => ({ key, type, name: key, outcomes: destinations.map((next) => ({ next })) })
const definition = (type) => ({ activities: [
  step('split-original-key', type, ['main', 'lower']),
  step('main', 'EMAILV2', []),
  step('lower', 'EMAILV2', []),
] })

function assertOrthogonal(edge) {
  expect(edge.path.match(/M/g)).toHaveLength(1)
  for (let index = 1; index < edge.points.length; index++) {
    const previous = edge.points[index - 1], point = edge.points[index]
    expect(Number.isFinite(point.x) && Number.isFinite(point.y)).toBe(true)
    expect(point.x === previous.x || point.y === previous.y).toBe(true)
  }
}

describe('Descending branch source ports', () => {
  it.each(['MULTICRITERIADECISION', 'WAITUNTILCHATRESPONSE', 'RANDOMSPLIT', 'ENGAGEMENTDECISION', 'ABNTEST', 'REST'])('leaves %s through the lower vertex and preserves its straight path', (type) => {
    const graph = journeyGraph(definition(type)), layout = layoutJourney(graph)
    const flow = journeyFlowModel(graph, layout)
    const origin = flow.positions.get('split-original-key')
    const main = flow.edges.find((edge) => edge.from === 'split-original-key' && edge.to === 'main')
    const lower = flow.edges.find((edge) => edge.from === 'split-original-key' && edge.to === 'lower')
    const anchors = journeyNodeAnchors()
    expect(main.sourceHandle).toBeUndefined()
    expect(main.points[0]).toEqual({ x: origin.x + anchors.source.x, y: origin.y + anchors.source.y })
    expect(new Set(main.points.map((point) => point.y)).size).toBe(1)
    expect(lower.sourceHandle).toBe('branch')
    expect(lower.points[0]).toEqual({ x: origin.x + anchors.branch.x, y: origin.y + anchors.branch.y })
    expect(lower.points[1].x).toBe(lower.points[0].x)
    expect(lower.points[1].y).toBeGreaterThan(lower.points[0].y)
    const target = flow.positions.get('lower')
    expect(lower.points.at(-1)).toEqual({ x: target.x + anchors.target.x, y: target.y + anchors.target.y })
    assertOrthogonal(lower)
  })

  it('uses the lower port for each reserved outcome lane without changing destinations or labels', () => {
    const input = { activities: [
      { key: 'split-original-key', type: 'RANDOMSPLIT', outcomes: Array.from({ length: 4 }, () => ({ next: 'main', arguments: { percentage: 25 } })) },
      step('main', 'EMAILV2', []),
    ] }
    const graph = journeyGraph(input), layout = layoutJourney(graph)
    const before = JSON.stringify({ input, graph, positions: [...layout.pos] })
    const flow = journeyFlowModel(graph, layout)
    const outcomes = flow.edges.filter((edge) => edge.from === 'split-original-key')
    const origin = flow.positions.get('split-original-key')
    expect(flow.branches).toHaveLength(3)
    expect(outcomes.map((edge) => edge.to)).toEqual(['main', 'main', 'main', 'main'])
    expect(outcomes.map((edge) => edge.label)).toEqual(['25%', '25%', '25%', '25%'])
    expect(new Set(outcomes.map((edge) => edge.y)).size).toBe(4)
    for (const edge of outcomes.slice(1)) {
      expect(edge.sourceHandle).toBe('branch')
      expect(edge.points[0]).toEqual({ x: origin.x + 78, y: origin.y + 48 })
      expect(edge.points[1].x).toBe(edge.points[0].x)
      assertOrthogonal(edge)
    }
    expect(outcomes[0].junction.count).toBe(3)
    expect(JSON.stringify({ input, graph, positions: [...layout.pos] })).toBe(before)
  })

  it('binds the bottom handle to the original activity and masks only its label area', () => {
    const graph = journeyGraph(definition('MULTICRITERIADECISION'))
    const model = journeyCanvasModel(graph, layoutJourney(graph), 'horizontal', 'split-original-key')
    expect(model.nodes.find((node) => node.id === 'split-original-key').data).toMatchObject({ key: 'split-original-key', active: true, branchExit: true })
    expect(model.nodes.find((node) => node.id === 'main').data.branchExit).toBe(false)
    expect(model.edges.find((edge) => edge.source === 'split-original-key' && edge.target === 'lower').sourceHandle).toBe('branch')
    expect(model.edges.find((edge) => edge.source === 'split-original-key' && edge.target === 'main').sourceHandle).toBeUndefined()
  })

  it('keeps vertical routing on its existing source anchor', () => {
    const graph = journeyGraph(definition('MULTICRITERIADECISION')), layout = layoutJourney(graph)
    const flow = journeyFlowModel(graph, layout, 'vertical')
    const anchors = journeyNodeAnchors('vertical')
    for (const edge of flow.edges) {
      const origin = flow.positions.get(edge.from)
      expect(edge.sourceHandle).toBeUndefined()
      expect(edge.points[0]).toEqual({ x: origin.x + anchors.source.x, y: origin.y + anchors.source.y })
      assertOrthogonal(edge)
    }
    const model = journeyCanvasModel(graph, layout, 'vertical')
    expect(model.nodes.every((node) => !node.data.branchExit)).toBe(true)
  })

  it('preserves normal side exits for cycles and self loops', () => {
    const graph = journeyGraph({ activities: [step('split', 'RANDOMSPLIT', ['main', 'split']), step('main', 'EMAILV2', [])] })
    const flow = journeyFlowModel(graph, layoutJourney(graph))
    const loop = flow.edges.find((edge) => edge.from === 'split' && edge.to === 'split')
    expect(loop.sourceHandle).toBeUndefined()
    assertOrthogonal(loop)
  })
})
