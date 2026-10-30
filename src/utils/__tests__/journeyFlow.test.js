import { describe, expect, it } from 'vitest'
import { JOURNEY_GEOMETRY, journeyFlowModel, journeyNodeAnchors } from '../journeyFlow.js'
import { journeyCanvasModel } from '../journeyCanvas.js'

function graph(type = 'RANDOMSPLIT') {
  const keys = ['entry', 'branch', 'decision', 'engagement', 'primary', 'no-email', 'no-wait', 'remainder', 'final', 'exit', 'branch-exit']
  const pairs = [
    ['entry', 'branch'], ['branch', 'decision'], ['branch', 'decision'], ['branch', 'remainder'], ['branch', 'branch-exit'],
    ['decision', 'engagement'], ['decision', 'remainder'], ['engagement', 'primary'], ['engagement', 'no-email'],
    ['no-email', 'no-wait'], ['no-wait', 'primary'], ['remainder', 'engagement'], ['primary', 'final'], ['final', 'exit'],
  ]
  return {
    nodes: keys.map((key) => ({ key, name: key, type: key === 'branch' ? type : key.includes('exit') ? 'EXIT' : 'EMAILV2' })),
    edges: pairs.map(([from, to], index) => ({ from, to, label: index >= 1 && index <= 4 ? '25%' : '' })),
  }
}

function assertContinuous(flow, input, orientation) {
  const anchors = journeyNodeAnchors(orientation)
  const markers = flow.edges.filter((edge) => edge.junction).map((edge) => edge.junction)
  for (const edge of flow.edges) {
    const source = flow.positions.get(edge.from), target = flow.positions.get(edge.to)
    expect(edge.points[0]).toEqual({ x: source.x + anchors.source.x, y: source.y + anchors.source.y })
    const end = edge.points.at(-1)
    const targetAnchor = { x: target.x + anchors.target.x, y: target.y + anchors.target.y }
    expect([targetAnchor, ...markers.filter((marker) => marker.target === edge.to).map(({ x, y }) => ({ x, y }))]).toContainEqual(end)
    expect(edge.path.match(/M/g)).toHaveLength(1)
    for (let index = 1; index < edge.points.length; index++) {
      const point = edge.points[index], previous = edge.points[index - 1]
      expect(Number.isFinite(point.x) && Number.isFinite(point.y)).toBe(true)
      expect(point.x === previous.x || point.y === previous.y).toBe(true)
    }
  }
  expect(flow.edges.map(({ from, to }) => [from, to])).toEqual(input.edges.map(({ from, to }) => [from, to]))
}

describe.each(['horizontal', 'vertical'])('Shared journey flow in %s', (orientation) => {
  it.each(['RANDOMSPLIT', 'MULTICRITERIADECISION', 'ENGAGEMENTDECISION', 'ABNTEST', 'REST', 'FutureActivity'])('uses the same layout and routing contract for %s', (type) => {
    const input = graph(type)
    const flow = journeyFlowModel(input, null, orientation)
    expect(flow).toEqual(journeyFlowModel(graph(), null, orientation))
    const axis = orientation === 'horizontal' ? 'y' : 'x'
    const labels = flow.edges.filter((edge) => edge.from === 'branch').map((edge) => edge[axis])
    expect(labels).toEqual([...labels].sort((a, b) => a - b))
    expect(new Set(labels).size).toBe(4)
    expect(flow.branches).toHaveLength(2)
    expect(flow.edges.find((edge) => edge.to === 'decision' && edge.junction).junction.count).toBe(1)
    expect(flow.edges.find((edge) => edge.to === 'remainder' && edge.junction).from).toBe('decision')
    assertContinuous(flow, input, orientation)
  })

  it('keeps cycles and self-loops connected without inferring a branch convergence', () => {
    const input = {
      nodes: ['entry', 'first', 'second'].map((key) => ({ key })),
      edges: [{ from: 'entry', to: 'first' }, { from: 'first', to: 'second' }, { from: 'first', to: 'first' }, { from: 'second', to: 'first' }],
    }
    const flow = journeyFlowModel(input, null, orientation)
    expect(flow.branches).toHaveLength(0)
    expect(flow.edges.some((edge) => edge.junction)).toBe(false)
    assertContinuous(flow, input, orientation)
  })

  it('does not depend on the activity array order after the entry', () => {
    const input = graph()
    const shuffled = { ...input, nodes: [input.nodes[0], ...input.nodes.slice(1).reverse()] }
    const expected = journeyFlowModel(input, null, orientation)
    const actual = journeyFlowModel(shuffled, null, orientation)
    for (const node of input.nodes) expect(actual.positions.get(node.key)).toEqual(expected.positions.get(node.key))
    expect(actual.branches).toEqual(expected.branches)
    expect(actual.edges).toEqual(expected.edges)
  })
})

describe('Shared flow boundaries', () => {
  it('preserves caller-owned graph data and layout positions', () => {
    const input = graph()
    for (const node of input.nodes) Object.freeze(node)
    for (const edge of input.edges) Object.freeze(edge)
    Object.freeze(input.nodes)
    Object.freeze(input.edges)
    const positions = new Map(journeyFlowModel(input).positions)
    const layout = { pos: new Map([...positions].map(([key], index) => [key, Object.freeze({ depth: index, lane: 0 })])) }
    const before = JSON.stringify({ input, pos: [...layout.pos] })
    journeyFlowModel(input, layout)
    expect(JSON.stringify({ input, pos: [...layout.pos] })).toBe(before)
  })

  it('preserves an explicit layout when each outcome already has its own target', () => {
    const input = { nodes: [{ key: 'start' }, { key: 'end' }], edges: [{ from: 'start', to: 'end' }] }
    const layout = { pos: new Map([['start', { depth: 2, lane: 1 }], ['end', { depth: 3, lane: 1 }]]) }
    const flow = journeyFlowModel(input, layout)
    expect(flow.positions.get('start')).toEqual({ x: 384, y: 160 })
    expect(flow.positions.get('end')).toEqual({ x: 576, y: 160 })
  })

  it('ignores unresolved endpoints while preserving the original edge indexes', () => {
    const input = { nodes: [{ key: 'start' }, { key: 'end' }], edges: [{ from: 'missing', to: 'end' }, { from: 'start', to: 'end' }, { from: 'start', to: 'missing' }] }
    const flow = journeyFlowModel(input)
    expect(flow.edges).toHaveLength(1)
    expect(flow.edges[0].index).toBe(1)
    expect(flow.edges[0].path).not.toMatch(/NaN|undefined/)
  })

  it('avoids collisions between route-space identifiers and real activity keys', () => {
    const input = graph()
    input.nodes.push({ key: '__journey_route_2', type: 'JOIN' })
    const flow = journeyFlowModel(input)
    expect(flow.positions.has('__journey_route_2')).toBe(true)
    expect(flow.branches.every((branch) => !flow.positions.has(branch.id))).toBe(true)
    expect(new Set(flow.branches.map((branch) => branch.id)).size).toBe(flow.branches.length)
  })

  it('renders only explicit Join activities and keeps route spaces invisible', () => {
    const input = graph()
    input.nodes.find((node) => node.key === 'no-wait').type = 'JOIN'
    const layout = { pos: new Map([...journeyFlowModel(input).positions].map(([key], index) => [key, { depth: index, lane: 0 }])) }
    const model = journeyCanvasModel(input, layout, 'horizontal', 'no-wait')
    expect(model.nodes.find((node) => node.id === 'no-wait').data).toMatchObject({ key: 'no-wait', active: true, visual: { icon: 'join' } })
    expect(model.nodes.filter((node) => node.type === 'journeyActivity').map((node) => node.id)).toEqual(input.nodes.map((node) => node.key))
    const spaces = model.nodes.filter((node) => node.type === 'journeyRoute')
    expect(spaces).toHaveLength(2)
    expect(spaces.every((node) => !node.data.key && !node.focusable && !node.selectable && node.data.visual.color === 'transparent')).toBe(true)
    expect(spaces.every((node) => node.width === JOURNEY_GEOMETRY.width && node.height === JOURNEY_GEOMETRY.height)).toBe(true)
  })

  it('handles an empty graph without creating activities or routes', () => {
    const flow = journeyFlowModel({ nodes: [], edges: [] })
    expect(flow.positions.size).toBe(0)
    expect(flow.branches).toEqual([])
    expect(flow.edges).toEqual([])
  })
})
