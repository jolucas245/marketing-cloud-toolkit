import { describe, expect, it } from 'vitest'
import { journeyGraph, layoutJourney } from '../journeys.js'
import { journeyCanvasModel } from '../journeyCanvas.js'

const step = (key, type, destinations) => ({ key, type, name: key, outcomes: destinations.map((next) => ({ next })) })
const definition = {
  activities: [
    step('initial-wait', 'WAIT', ['random']),
    step('decision', 'MULTICRITERIADECISION', ['engagement', 'remainder']),
    step('engagement', 'ENGAGEMENTDECISION', ['primary', 'no-email']),
    step('primary', 'EMAILV2', ['final-wait']),
    step('no-email', 'EMAILV2', ['no-wait']),
    step('no-wait', 'WAIT', ['primary']),
    step('remainder', 'EMAILV2', ['engagement']),
    step('final-wait', 'WAIT', []),
    { key: 'random', type: 'RANDOMSPLIT', name: 'random', outcomes: ['decision', 'decision', 'remainder', ''].map((next) => ({ next, arguments: { percentage: 25 } })) },
  ],
}

describe('Split outcome lanes', () => {
  it.each(['horizontal', 'vertical'])('keeps four percentages in outcome order on separate lanes in %s', (orientation) => {
    const graph = journeyGraph(definition)
    const model = journeyCanvasModel(graph, layoutJourney(graph), orientation)
    const outcomes = model.edges.filter((edge) => edge.source === 'random')
    const axis = orientation === 'horizontal' ? 'y' : 'x'
    const lanes = outcomes.map((edge) => edge.data[axis])
    expect(outcomes.map((edge) => edge.data.label)).toEqual(['25%', '25%', '25%', '25%'])
    expect(lanes).toEqual([...lanes].sort((a, b) => a - b))
    for (let index = 1; index < lanes.length; index++) expect(lanes[index] - lanes[index - 1]).toBeGreaterThanOrEqual(160)
    expect(model.nodes.filter((node) => node.type === 'journeyRoute')).toHaveLength(2)
    const exit = model.nodes.find((node) => node.id === outcomes[3].target)
    const terminals = model.nodes.filter((node) => node.type === 'journeyRoute')
    expect(exit.data.visual.icon).toBe('exit')
    expect(terminals.every((node) => node.position[axis] < exit.position[axis])).toBe(true)
  })

  it.each(['horizontal', 'vertical'])('reconnects the second outcome before Decision and the third at Remainder in %s', (orientation) => {
    const graph = journeyGraph(definition)
    const model = journeyCanvasModel(graph, layoutJourney(graph), orientation)
    const outcomes = model.edges.filter((edge) => edge.source === 'random')
    for (const [index, key, primarySource] of [[1, 'decision', 'random'], [2, 'remainder', 'decision']]) {
      const primary = model.edges.find((edge) => edge.source === primarySource && edge.target === key && edge.data.junction)
      const point = primary.data.junction
      expect(point.count).toBe(1)
      expect(outcomes[index].target).toBe(key)
      let x = 0, y = 0
      for (const command of outcomes[index].data.path.match(/[MHV][^MHV]*/g)) {
        const values = command.slice(1).trim().split(/[\s,]+/).map(Number)
        if (command[0] === 'M') [x, y] = values
        else if (command[0] === 'H') x = values[0]
        else y = values[0]
      }
      expect({ x, y }).toEqual({ x: point.x, y: point.y })
      expect(outcomes[index].data.path.match(/M/g)).toHaveLength(1)
    }
  })

  it('preserves graph data, layout input, original activities and selection keys', () => {
    const graph = journeyGraph(definition), layout = layoutJourney(graph)
    const before = JSON.stringify({ graph, pos: [...layout.pos] })
    const model = journeyCanvasModel(graph, layout, 'horizontal', 'remainder')
    expect(JSON.stringify({ graph, pos: [...layout.pos] })).toBe(before)
    expect(model.nodes.filter((node) => node.type === 'journeyActivity').map((node) => node.id)).toEqual(graph.nodes.map((node) => node.key))
    expect(model.edges.map((edge) => [edge.source, edge.target])).toEqual(graph.edges.map((edge) => [edge.from, edge.to]))
    expect(model.nodes.find((node) => node.id === 'remainder').data).toMatchObject({ key: 'remainder', active: true })
    expect(model.nodes.filter((node) => node.type === 'journeyRoute').every((node) => !node.data.key && !node.selectable && !node.focusable && !node.connectable)).toBe(true)
  })

  it('keeps explicit Join activities without adding duplicate visual terminals', () => {
    const activities = definition.activities.map((node) => node.key === 'random'
      ? { ...node, outcomes: ['decision', 'join-second', 'join-third', ''].map((next) => ({ next, arguments: { percentage: 25 } })) }
      : node)
    activities.push(step('join-second', 'JOIN', ['decision']), step('join-third', 'JOIN', ['remainder']))
    const graph = journeyGraph({ activities })
    const model = journeyCanvasModel(graph, layoutJourney(graph), 'horizontal', 'join-second')
    expect(model.nodes.filter((node) => node.type === 'journeyRoute')).toHaveLength(0)
    expect(model.nodes.find((node) => node.id === 'join-second').data).toMatchObject({ key: 'join-second', active: true })
    expect(model.edges.find((edge) => edge.source === 'join-third').target).toBe('remainder')
  })

  it('counts every additional outcome when six paths share one destination', () => {
    const graph = journeyGraph({ activities: [step('random', 'RANDOMSPLIT', Array(6).fill('email')), step('email', 'EMAILV2', [])] })
    const model = journeyCanvasModel(graph, layoutJourney(graph))
    expect(model.nodes.filter((node) => node.type === 'journeyRoute')).toHaveLength(5)
    expect(model.edges.find((edge) => edge.data.junction).data.junction.count).toBe(5)
    expect(new Set(model.edges.filter((edge) => edge.source === 'random').map((edge) => edge.data.y)).size).toBe(6)
  })

  it('does not add a branch Join for an outcome closing a real cycle', () => {
    const graph = journeyGraph({ activities: [step('random', 'RANDOMSPLIT', ['email', 'random']), step('email', 'EMAILV2', [])] })
    const model = journeyCanvasModel(graph, layoutJourney(graph))
    expect(model.nodes.filter((node) => node.type === 'journeyRoute')).toHaveLength(0)
    expect(model.edges.some((edge) => edge.data.junction)).toBe(false)
  })
})
