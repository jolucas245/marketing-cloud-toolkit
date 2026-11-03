import { describe, expect, it } from 'vitest'
import { journeyGraph, layoutJourney } from '../journeys.js'
import { ACTIVITY_HEIGHT, ACTIVITY_WIDTH, journeyCanvasModel } from '../journeyCanvas.js'

const activity = (key, type, destinations) => ({ key, type, name: key, outcomes: destinations.map((next) => ({ next })) })
const definition = {
  activities: [
    activity('initial-wait', 'WAIT', ['decision']),
    activity('decision', 'MULTICRITERIADECISION', ['engagement', 'reminder']),
    activity('engagement', 'ENGAGEMENTSPLIT', ['primary-email', 'no-email']),
    activity('primary-email', 'EMAILV2', ['final-wait']),
    activity('final-wait', 'WAIT', []),
    activity('no-email', 'EMAILV2', ['no-wait']),
    activity('no-wait', 'WAIT', ['primary-email']),
    activity('reminder', 'EMAILV2', ['engagement']),
  ],
}

function points(path) {
  let x = 0, y = 0
  return path.match(/[MHV][^MHV]*/g).map((command) => {
    const values = command.slice(1).trim().split(/[\s,]+/).map(Number)
    if (command[0] === 'M') [x, y] = values
    else if (command[0] === 'H') x = values[0]
    else y = values[0]
    return { x, y }
  })
}

function crossesNode(a, b, node) {
  const left = node.position.x, top = node.position.y
  const right = left + ACTIVITY_WIDTH, bottom = top + ACTIVITY_HEIGHT
  if (a.y === b.y) return a.y > top && a.y < bottom && Math.max(a.x, b.x) > left && Math.min(a.x, b.x) < right
  return a.x > left && a.x < right && Math.max(a.y, b.y) > top && Math.min(a.y, b.y) < bottom
}

function intersections(a, b, c, d) {
  if ((a.x === b.x && a.y === b.y) || (c.x === d.x && c.y === d.y)) return []
  const vertical = a.x === b.x
  if (vertical === (c.x === d.x)) {
    const fixed = vertical ? 'x' : 'y', axis = vertical ? 'y' : 'x'
    if (a[fixed] !== c[fixed]) return []
    const start = Math.max(Math.min(a[axis], b[axis]), Math.min(c[axis], d[axis]))
    const end = Math.min(Math.max(a[axis], b[axis]), Math.max(c[axis], d[axis]))
    return start > end ? [] : [{ [fixed]: a[fixed], [axis]: start }, { [fixed]: a[fixed], [axis]: end }]
  }
  const point = vertical ? { x: a.x, y: c.y } : { x: c.x, y: a.y }
  return [a, c].every((start, index) => {
    const end = index === 0 ? b : d
    return ['x', 'y'].every((axis) => point[axis] >= Math.min(start[axis], end[axis]) && point[axis] <= Math.max(start[axis], end[axis]))
  }) ? [point] : []
}

describe('Journey branch joins', () => {
  it.each(['horizontal', 'vertical'])('keeps nested returns separate from unrelated paths in %s', (orientation) => {
    const graph = journeyGraph(definition)
    const model = journeyCanvasModel(graph, layoutJourney(graph), orientation)
    for (const source of ['reminder', 'no-wait']) {
      const route = model.edges.find((edge) => edge.source === source)
      const coordinates = points(route.data.path)
      const destination = coordinates.at(-1)
      for (const other of model.edges.filter((edge) => edge.id !== route.id)) {
        const otherPoints = points(other.data.path)
        for (let i = 1; i < coordinates.length; i++) {
          for (let j = 1; j < otherPoints.length; j++) {
            for (const point of intersections(coordinates[i - 1], coordinates[i], otherPoints[j - 1], otherPoints[j])) {
              expect(point, `${source} intersects ${other.source} → ${other.target}`).toEqual(destination)
              expect(other.target).toBe(route.target)
            }
          }
        }
      }
    }
  })

  it.each(['horizontal', 'vertical'])('preserves all original activities, destinations and layout positions in %s', (orientation) => {
    const graph = journeyGraph(definition)
    const layout = layoutJourney(graph)
    const before = JSON.stringify(graph)
    const positions = [...layout.pos].map(([key, value]) => [key, { ...value }])
    const model = journeyCanvasModel(graph, layout, orientation, 'reminder')
    expect(model.nodes.map((node) => node.id)).toEqual(graph.nodes.map((node) => node.key))
    expect(model.edges.map((edge) => [edge.source, edge.target])).toEqual(graph.edges.map((edge) => [edge.from, edge.to]))
    expect(model.nodes.find((node) => node.id === 'reminder').data.active).toBe(true)
    expect([...layout.pos]).toEqual(positions)
    expect(JSON.stringify(graph)).toBe(before)
  })

  it.each(['horizontal', 'vertical'])('routes the reminder and No branch to shared points before their targets in %s', (orientation) => {
    const graph = journeyGraph(definition)
    const model = journeyCanvasModel(graph, layoutJourney(graph), orientation)
    expect(model.edges.filter((edge) => edge.data.junction)).toHaveLength(2)
    for (const [source, target] of [['reminder', 'engagement'], ['no-wait', 'primary-email']]) {
      const destination = model.nodes.find((node) => node.id === target)
      const marker = model.edges.find((edge) => edge.target === target && edge.data.junction).data.junction
      const route = model.edges.find((edge) => edge.source === source && edge.target === target)
      expect(marker.count).toBe(1)
      expect(marker.description).toContain(destination.data.name)
      expect(points(route.data.path).at(-1)).toEqual({ x: marker.x, y: marker.y })
      if (orientation === 'horizontal') expect(marker.x).toBeLessThan(destination.position.x)
      else expect(marker.y).toBeLessThan(destination.position.y)
    }
  })

  it('does not dip below the reminder or No branch to reconnect horizontally', () => {
    const graph = journeyGraph(definition)
    const model = journeyCanvasModel(graph, layoutJourney(graph))
    for (const source of ['reminder', 'no-wait']) {
      const node = model.nodes.find((node) => node.id === source)
      const route = model.edges.find((edge) => edge.source === source)
      const coordinates = points(route.data.path)
      expect(Math.max(...coordinates.map((point) => point.y))).toBe(node.position.y + 26)
      expect(Math.max(...coordinates.map((point) => point.x))).toBeLessThan(node.position.x + 192)
    }
  })

  it.each(['horizontal', 'vertical'])('keeps nested return connectors outside other activity and label bounds in %s', (orientation) => {
    const graph = journeyGraph(definition)
    const model = journeyCanvasModel(graph, layoutJourney(graph), orientation)
    for (const source of ['reminder', 'no-wait']) {
      const route = model.edges.find((edge) => edge.source === source)
      const coordinates = points(route.data.path)
      for (let index = 1; index < coordinates.length; index++) {
        for (const node of model.nodes.filter((item) => item.id !== source)) {
          expect(crossesNode(coordinates[index - 1], coordinates[index], node), `${source} crosses ${node.id}`).toBe(false)
        }
      }
    }
  })

  it('counts multiple joining sources once at the shared destination', () => {
    const graph = journeyGraph({ activities: [...definition.activities, activity('other-branch', 'EMAILV2', ['engagement'])] })
    const model = journeyCanvasModel(graph, layoutJourney(graph))
    const markers = model.edges.filter((edge) => edge.target === 'engagement' && edge.data.junction)
    expect(markers).toHaveLength(1)
    expect(markers[0].data.junction.count).toBe(2)
  })

  it.each(['horizontal', 'vertical'])('does not identify a true graph cycle as a branch join in %s', (orientation) => {
    const activities = definition.activities.map((node) => node.key === 'no-wait' ? activity('no-wait', 'WAIT', ['engagement']) : node)
    const graph = journeyGraph({ activities })
    const model = journeyCanvasModel(graph, layoutJourney(graph), orientation)
    const marker = model.edges.find((edge) => edge.target === 'engagement' && edge.data.junction).data.junction
    const cycle = model.edges.find((edge) => edge.source === 'no-wait')
    expect(marker.count).toBe(1)
    expect(points(cycle.data.path).at(-1)).not.toEqual({ x: marker.x, y: marker.y })
    expect(cycle.data.path).not.toMatch(/NaN|undefined/)
  })

  it.each(['horizontal', 'vertical'])('retains explicit Join activity identity and its configuration target in %s', (orientation) => {
    const activities = definition.activities.map((node) => node.key === 'reminder' ? activity('reminder', 'EMAILV2', ['join-original-key']) : node)
    activities.push(activity('join-original-key', 'JOIN', ['engagement']))
    const graph = journeyGraph({ activities })
    const model = journeyCanvasModel(graph, layoutJourney(graph), orientation, 'join-original-key')
    expect(model.nodes.find((node) => node.id === 'join-original-key').data).toMatchObject({ key: 'join-original-key', active: true, visual: { icon: 'join' } })
    expect(model.edges.find((edge) => edge.source === 'join-original-key').target).toBe('engagement')
    expect(model.edges.find((edge) => edge.target === 'engagement' && edge.data.junction).data.junction.count).toBe(1)
  })

  it('shows a branch join for separate split outcomes reaching the same destination', () => {
    const graph = journeyGraph({ activities: [activity('split', 'RANDOMSPLIT', ['email', 'email']), activity('email', 'EMAILV2', [])] })
    const model = journeyCanvasModel(graph, layoutJourney(graph))
    expect(model.edges.find((edge) => edge.data.junction).data.junction.count).toBe(1)
    expect(model.nodes.filter((node) => node.type === 'journeyRoute')).toHaveLength(1)
    expect(model.edges.filter((edge) => edge.source === 'split')).toHaveLength(2)
  })

  it.each(['horizontal', 'vertical'])('preserves distinct parallel joining paths and ignores unresolved endpoints in %s', (orientation) => {
    const graph = journeyGraph(definition)
    graph.edges.push(...Array.from({ length: 6 }, () => ({ from: 'reminder', to: 'engagement', label: 'Parallel' })), { from: 'missing', to: 'engagement' }, { from: 'reminder', to: 'missing' })
    const model = journeyCanvasModel(graph, layoutJourney(graph), orientation)
    const returns = model.edges.filter((edge) => edge.source === 'reminder')
    expect(returns).toHaveLength(7)
    expect(new Set(returns.map((edge) => edge.data.path)).size).toBe(7)
    expect(model.edges.some((edge) => edge.source === 'missing' || edge.target === 'missing')).toBe(false)
    expect(model.edges.find((edge) => edge.target === 'engagement' && edge.data.junction).data.junction.count).toBe(7)
  })
})
