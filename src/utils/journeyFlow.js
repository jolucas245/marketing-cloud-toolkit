export const JOURNEY_GEOMETRY = Object.freeze({
  width: 156,
  height: 112,
  horizontal: Object.freeze({
    depth: 192, lane: 160,
    source: Object.freeze({ x: 100, y: 26 }),
    target: Object.freeze({ x: 56, y: 26 }),
    junction: Object.freeze({ x: -18, y: 26 }),
    step: 44, returnStep: 28, returnMargin: 18, corridor: 24,
  }),
  vertical: Object.freeze({
    depth: 176, lane: 216,
    source: Object.freeze({ x: 78, y: 112 }),
    target: Object.freeze({ x: 78, y: 4 }),
    junction: Object.freeze({ x: 78, y: -32 }),
    step: 28, returnStep: 20, returnMargin: 32, corridor: 28,
  }),
})

export function journeyNodeAnchors(orientation = 'horizontal') {
  const geometry = JOURNEY_GEOMETRY[orientation === 'vertical' ? 'vertical' : 'horizontal']
  return { source: { ...geometry.source }, target: { ...geometry.target } }
}

function flowTopology(graph, layout) {
  const nodes = graph.nodes.filter((node) => !layout || layout.pos.has(node.key))
  const byKey = new Map(nodes.map((node) => [node.key, node]))
  const incoming = new Map(nodes.map((node) => [node.key, []]))
  const outgoing = new Map(nodes.map((node) => [node.key, []]))
  const edges = graph.edges.flatMap((edge, index) => {
    if (!byKey.has(edge.from) || !byKey.has(edge.to)) return []
    const item = { ...edge, index }
    incoming.get(edge.to).push(item)
    outgoing.get(edge.from).push(item)
    return [item]
  })
  const reachable = new Map()
  const descendants = (start) => {
    if (!reachable.has(start)) {
      const seen = new Set([start]), pending = [start]
      while (pending.length) {
        for (const edge of outgoing.get(pending.pop()) || []) {
          if (!seen.has(edge.to)) { seen.add(edge.to); pending.push(edge.to) }
        }
      }
      reachable.set(start, seen)
    }
    return reachable.get(start)
  }
  return { nodes, edges, byKey, incoming, outgoing, descendants }
}

function flowLayout(topology, layout) {
  const { nodes, edges, byKey, outgoing, descendants } = topology
  const pos = new Map(), branches = new Map(), parents = new Map()
  const ids = new Set(byKey.keys())
  let nextLane = 0
  const place = (key, depth) => {
    if (pos.has(key)) return pos.get(key).lane
    pos.set(key, { depth, lane: -1 })
    let lane = -1
    const outcomes = outgoing.get(key)
    for (const [index, edge] of outcomes.entries()) {
      const fresh = !pos.has(edge.to)
      if (!fresh && index > 0 && outcomes.length > 1 && !descendants(edge.to).has(key)) {
        let id = `__journey_route_${edge.index}`
        while (ids.has(id)) id = `_${id}`
        ids.add(id)
        branches.set(edge.index, { id, depth: depth + 1, lane: nextLane++ })
      } else {
        if (fresh) parents.set(edge.to, key)
        const childLane = place(edge.to, depth + 1)
        if (index === 0 || lane < 0) lane = fresh ? childLane : lane
      }
    }
    if (lane < 0) lane = nextLane++
    pos.get(key).lane = lane
    return lane
  }
  if (nodes.length) place(nodes[0].key, 0)
  for (const node of nodes) if (!pos.has(node.key)) place(node.key, 0)
  if (branches.size) {
    const byIndex = new Map(edges.map((edge) => [edge.index, edge]))
    const reserved = new Set([...branches].filter(([index, branch]) => pos.get(byIndex.get(index).to).depth === branch.depth).map(([index]) => byIndex.get(index).to))
    const depths = new Map()
    const depth = (key) => {
      if (depths.has(key)) return depths.get(key)
      const parent = parents.get(key)
      const value = parents.has(key) ? depth(parent) + 1 + Number(reserved.has(key)) : 0
      depths.set(key, value)
      return value
    }
    for (const [key, at] of pos) at.depth = depth(key)
    for (const [index, branch] of branches) branch.depth = pos.get(byIndex.get(index).from).depth + 1
  }
  return { pos: !branches.size && layout ? layout.pos : pos, branches }
}

function flowJunctions(topology, positions, branches, horizontal, geometry) {
  const routes = new Map(), markers = new Map()
  const progress = (key) => horizontal ? positions.get(key).x : positions.get(key).y
  const lane = (key) => horizontal ? positions.get(key).y : positions.get(key).x
  for (const [key, edges] of topology.incoming) {
    if (edges.length < 2) continue
    const reachable = topology.descendants(key)
    const candidates = edges.filter((edge) => !reachable.has(edge.from))
    const primary = candidates.filter((edge) => !branches.has(edge.index) && progress(edge.from) < progress(key))
      .sort((a, b) => Number(lane(a.from) !== lane(key)) - Number(lane(b.from) !== lane(key)) || a.index - b.index)[0]
    if (!primary) continue
    const returns = candidates.filter((edge) => edge.from !== primary.from || branches.has(edge.index))
    const count = new Set(returns.map((edge) => branches.has(edge.index) ? `outcome:${edge.index}` : `source:${edge.from}`)).size
    if (!count) continue
    const target = positions.get(key)
    const point = { x: target.x + geometry.junction.x, y: target.y + geometry.junction.y, count, target: key }
    markers.set(primary.index, point)
    for (const edge of returns) routes.set(edge.index, point)
  }
  return { routes, markers }
}

function routeConnection(origin, source, target, junction, parallel, branch, hasBranches, horizontal, geometry) {
  const axes = ({ x, y }) => horizontal ? [x, y] : [y, x]
  const point = ([p, q]) => horizontal ? { x: p, y: q } : { x: q, y: p }
  const [ap, aq] = axes(source), [bp, bq] = axes(target)
  const [sp, sq] = axes(geometry.source), [tp, tq] = axes(geometry.target)
  const p1 = ap + sp, q1 = aq + sq, p2 = bp + tp, q2 = bq + tq
  const sizeP = horizontal ? JOURNEY_GEOMETRY.width : JOURNEY_GEOMETRY.height
  const sizeQ = horizontal ? JOURNEY_GEOMETRY.height : JOURNEY_GEOMETRY.width
  const offset = 12 * parallel / (parallel + 1)
  let points, label
  if (junction) {
    const [jp, jq] = axes(junction)
    if (p1 < jp) {
      const bend = jp - offset
      points = [[p1, q1], [bend, q1], [bend, jq], [jp, jq]]
      label = [(p1 + bend) / 2, q1 + (horizontal ? -12 : 36)]
    } else {
      const exit = ap + sizeP + geometry.returnMargin + offset
      const corridor = aq > bq ? aq - 24 - offset : aq + sizeQ + geometry.corridor + offset
      points = [[p1, q1], [exit, q1], [exit, corridor], [jp, corridor], [jp, jq]]
      label = [(exit + jp) / 2, corridor + (horizontal ? -12 : 24)]
    }
  } else if (p2 <= p1) {
    const side = Math.max(aq, bq) + sizeQ + (horizontal ? 24 : 32) + parallel * 24
    points = [[p1, q1], [p1 + geometry.returnStep, q1], [p1 + geometry.returnStep, side], [p2 - geometry.returnStep, side], [p2 - geometry.returnStep, q2], [p2, q2]]
    label = [(p1 + p2) / 2, side + (horizontal ? -12 : 24)]
  } else {
    const bend = p1 + geometry.step + parallel * (horizontal ? 16 : 12)
    const lane = q2 + parallel * 24
    points = [[p1, q1], [bend, q1], [bend, lane], [p2 - 16, lane], [p2 - 16, q2], [p2, q2]]
    label = horizontal ? [(bend + p2 - 16) / 2, lane - 12] : [bend - 12, (q1 + lane) / 2 + (q1 === lane ? 36 : 0)]
  }
  if (!horizontal && hasBranches && !branch && bp > axes(origin)[0]) {
    label = [(axes(origin)[0] + sizeP + geometry.step + p2) / 2, q2 + 36]
  }
  if (branch) {
    const [op, oq] = axes(origin)
    const bend = op + sp + geometry.step
    points = [[op + sp, oq + sq], [bend, oq + sq], [bend, aq + tq], [ap + tp, aq + tq], ...points]
    label = horizontal ? [(bend + ap + tp) / 2, q1 - 12] : [(bend + ap + tp) / 2, q1 + 36]
  }
  return { points: points.map(point), ...point(label) }
}

function pathData(points) {
  return points.map((point, index) => {
    if (index === 0) return `M${point.x},${point.y}`
    const previous = points[index - 1]
    return point.y === previous.y ? `H${point.x}` : `V${point.y}`
  }).join(' ')
}

export function journeyFlowModel(graph, layout = null, orientation = 'horizontal') {
  const horizontal = orientation !== 'vertical'
  const geometry = JOURNEY_GEOMETRY[horizontal ? 'horizontal' : 'vertical']
  const topology = flowTopology(graph, layout)
  const display = flowLayout(topology, layout)
  const position = (at) => horizontal ? { x: at.depth * geometry.depth, y: at.lane * geometry.lane } : { x: at.lane * geometry.lane, y: at.depth * geometry.depth }
  const positions = new Map(topology.nodes.map((node) => [node.key, position(display.pos.get(node.key))]))
  const branches = [...display.branches].map(([edgeIndex, branch]) => ({ id: branch.id, edgeIndex, position: position(branch) }))
  const byIndex = new Map(branches.map((branch) => [branch.edgeIndex, branch]))
  const junctions = flowJunctions(topology, positions, display.branches, horizontal, geometry)
  const pairs = new Map()
  const edges = topology.edges.map((edge) => {
    const origin = positions.get(edge.from), target = positions.get(edge.to)
    const branch = byIndex.get(edge.index)
    const pair = JSON.stringify([edge.from, edge.to])
    const parallel = pairs.get(pair) || 0
    pairs.set(pair, parallel + 1)
    const route = routeConnection(origin, branch?.position || origin, target, junctions.routes.get(edge.index), parallel, branch, branches.length > 0, horizontal, geometry)
    if (horizontal && topology.outgoing.get(edge.from).length > 1 && (branch || target.x > origin.x)) {
      route.x = origin.x + (geometry.source.x + geometry.step + geometry.depth + geometry.target.x) / 2
    }
    return {
      index: edge.index, from: edge.from, to: edge.to, label: String(edge.label || ''),
      ...route, path: pathData(route.points),
      ...(junctions.markers.has(edge.index) ? { junction: junctions.markers.get(edge.index) } : {}),
    }
  })
  return { positions, branches, edges }
}
