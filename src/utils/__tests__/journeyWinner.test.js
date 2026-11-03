import { describe, expect, it } from 'vitest'
import { describeJourneyNode, journeyGraph, layoutJourney, nodeKind, nodeTypeLabel } from '../journeys.js'
import { journeyActivityVisual, journeyCanvasModel } from '../journeyCanvas.js'
import { journeyFlowModel } from '../journeyFlow.js'

const step = (key, type, next, name = key) => ({ key, type, name, outcomes: next.map((next) => ({ next })) })
const definition = (name = 'ABNTESTSTOP') => ({
  activities: [
    { key: 'optimizer', type: 'ABNTEST', name: 'Path optimizer', outcomes: ['email-a', 'email-b'].map((next) => ({ next, arguments: { percentage: 50 } })) },
    step('email-a', 'EMAILV2', ['winner-original-key']),
    step('email-b', 'EMAILV2', ['winner-original-key']),
    step('winner-original-key', 'ABNTESTSTOP', ['decision'], name),
    step('decision', 'MULTICRITERIADECISION', ['main-email', 'remainder']),
    step('main-email', 'EMAILV2', ['final-wait']),
    step('remainder', 'EMAILV2', ['main-email']),
    step('final-wait', 'WAIT', []),
  ],
})

function endpoint(path) {
  let x = 0, y = 0
  for (const command of path.match(/[MHV][^MHV]*/g)) {
    const values = command.slice(1).trim().split(/[\s,]+/).map(Number)
    if (command[0] === 'M') [x, y] = values
    else if (command[0] === 'H') x = values[0]
    else y = values[0]
  }
  return { x, y }
}

describe('Path optimizer Winner', () => {
  it('recognizes the automatic Winner as an action with an orange circular flag', () => {
    expect(nodeTypeLabel('ABNTESTSTOP')).toBe('Winner')
    expect(nodeKind('ABNTESTSTOP')).toBe('action')
    expect(journeyActivityVisual('ABNTESTSTOP')).toEqual({ icon: 'winner', shape: 'circle', color: '#f58a00' })
  })

  it.each(['horizontal', 'vertical'])('connects both paths directly to different Winner ports in %s', (orientation) => {
    const graph = journeyGraph(definition()), layout = layoutJourney(graph)
    const original = graph.nodes.find((node) => node.key === 'winner-original-key')
    expect(describeJourneyNode(original).title).toBe('Winner')
    expect(original.raw.name).toBe('ABNTESTSTOP')
    const model = journeyCanvasModel(graph, layout, orientation, 'winner-original-key')
    const winner = model.nodes.find((node) => node.id === 'winner-original-key')
    expect(winner.data).toMatchObject({ key: 'winner-original-key', name: 'Winner', typeLabel: 'Winner', active: true, visual: { icon: 'winner' } })
    const incoming = model.edges.filter((edge) => edge.target === winner.id)
    expect(incoming).toHaveLength(2)
    expect(incoming.some((edge) => edge.data.junction)).toBe(false)
    const primary = incoming.find((edge) => edge.source === 'email-a')
    const secondary = incoming.find((edge) => edge.source === 'email-b')
    const { x, y } = winner.position
    expect(endpoint(primary.data.path)).toEqual(orientation === 'horizontal' ? { x: x + 56, y: y + 26 } : { x: x + 78, y: y + 4 })
    expect(endpoint(secondary.data.path)).toEqual(orientation === 'horizontal' ? { x: x + 78, y: y + 48 } : { x: x + 100, y: y + 26 })
    expect(model.edges.find((edge) => edge.source === winner.id).target).toBe('decision')
    expect(model.edges.find((edge) => edge.target === 'main-email' && edge.data.junction).data.junction.count).toBe(1)
    expect(model.nodes.filter((node) => node.type === 'journeyActivity').map((node) => node.id)).toEqual(graph.nodes.map((node) => node.key))
  })

  it('keeps a user-provided Winner name', () => {
    const graph = journeyGraph(definition('Winner da oferta'))
    const model = journeyCanvasModel(graph, layoutJourney(graph))
    expect(model.nodes.find((node) => node.id === 'winner-original-key').data.name).toBe('Winner da oferta')
  })

  it.each(['horizontal', 'vertical'])('accepts a branch approaching the Winner from the opposite lane in %s', (orientation) => {
    const graph = journeyGraph(definition()), layout = layoutJourney(graph)
    layout.pos.set('email-b', { ...layout.pos.get('email-b'), lane: -1 })
    const model = journeyCanvasModel(graph, layout, orientation)
    const winner = model.nodes.find((node) => node.id === 'winner-original-key')
    const route = model.edges.find((edge) => edge.source === 'email-b')
    const { x, y } = winner.position
    expect(endpoint(route.data.path)).toEqual(orientation === 'horizontal' ? { x: x + 78, y: y + 4 } : { x: x + 56, y: y + 26 })
  })

  it('uses Winner as the label when no name is supplied', () => {
    const journey = definition()
    delete journey.activities.find((node) => node.key === 'winner-original-key').name
    const graph = journeyGraph(journey)
    expect(graph.nodes.find((node) => node.key === 'winner-original-key').name).toBe('Winner')
  })

  it.each(['horizontal', 'vertical'])('keeps merge capabilities independent of activity types in %s', (orientation) => {
    const graph = journeyGraph(definition()), layout = layoutJourney(graph)
    const options = { mergeTargets: new Set(['winner-original-key']) }
    const before = JSON.stringify({ graph, pos: [...layout.pos], targets: [...options.mergeTargets] })
    const flow = journeyFlowModel(graph, layout, orientation, options)
    expect(flow.edges.some((edge) => edge.junction?.target === 'winner-original-key')).toBe(false)
    expect(flow.edges.some((edge) => edge.junction?.target === 'main-email')).toBe(true)
    const custom = { ...graph, nodes: graph.nodes.map((node) => ({ ...node, type: 'FutureActivity' })) }
    expect(journeyFlowModel(custom, layout, orientation, options)).toEqual(flow)
    expect(JSON.stringify({ graph, pos: [...layout.pos], targets: [...options.mergeTargets] })).toBe(before)
  })

  it('keeps normal convergence markers when no merge capability is provided', () => {
    const graph = journeyGraph(definition()), layout = layoutJourney(graph)
    const flow = journeyFlowModel(graph, layout)
    expect(flow.edges.find((edge) => edge.junction?.target === 'winner-original-key').junction.count).toBe(1)
  })
})
