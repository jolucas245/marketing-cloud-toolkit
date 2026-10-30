import { nodeSummary, nodeTypeLabel } from './journeys.js'

export const ACTIVITY_WIDTH = 156
export const ACTIVITY_HEIGHT = 112
export const MIN_JOURNEY_ZOOM = 0.15
export const MAX_JOURNEY_ZOOM = 2.5

const visual = (icon, shape, color) => ({ icon, shape, color })
const MESSAGE = '#218f8b'
const FLOW = '#bd6800'
const VISUALS = {
  ENTRY: visual('entry', 'circle', '#639b34'),
  EXIT: visual('exit', 'circle', '#639b34'),
  EMAIL: visual('email', 'square', MESSAGE),
  EMAILV2: visual('email', 'square', MESSAGE),
  SMSSYNC: visual('sms', 'square', MESSAGE),
  SMS: visual('sms', 'square', MESSAGE),
  SENDSMS: visual('sms', 'square', MESSAGE),
  WHATSAPPACTIVITY: visual('whatsapp', 'square', MESSAGE),
  PUSH: visual('push', 'square', MESSAGE),
  PUSHNOTIFICATIONACTIVITY: visual('push', 'square', MESSAGE),
  INAPPSYNCACTIVITY: visual('mobile', 'square', MESSAGE),
  INBOXACTIVITY: visual('inbox', 'square', MESSAGE),
  MULTICRITERIADECISION: visual('decision', 'diamond', FLOW),
  DECISIONSPLIT: visual('decision', 'diamond', FLOW),
  CONTACTDECISION: visual('decision', 'diamond', FLOW),
  ENGAGEMENTSPLIT: visual('engagement', 'diamond', FLOW),
  ENGAGEMENTDECISION: visual('engagement', 'diamond', FLOW),
  RANDOMSPLIT: visual('random', 'diamond', FLOW),
  ABNTEST: visual('optimizer', 'diamond', FLOW),
  EINSTEINSPLIT: visual('engagement', 'diamond', FLOW),
  UPDATECONTACTDATA: visual('contact', 'square', MESSAGE),
  SALESCLOUDACTIVITY: visual('cloud', 'square', '#167bbb'),
  SALESFORCESALESCLOUDACTIVITY: visual('cloud', 'square', '#167bbb'),
  OBJECTACTIVITY: visual('cloud', 'square', '#167bbb'),
  REST: visual('custom', 'square', '#65758b'),
  EVENT: visual('event', 'square', '#167bbb'),
  JOIN: visual('join', 'diamond', FLOW),
}

export const JOURNEY_ICON_PATHS = {
  entry: ['M6 4h12a1 1 0 0 1 1 1v14a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1Z', 'M8 8h1m3 0h4M8 12h1m3 0h4M8 16h1m3 0h4'],
  exit: ['M11 5H5v14h6', 'M9 12h11m-4-4 4 4-4 4'],
  email: ['M3 6h18v12H3Z', 'm3 7 9 6 9-6M3 18l6-6m12 6-6-6'],
  sms: ['M4 4h16v12H9l-5 4V4Z', 'M8 8h8M8 12h5'],
  whatsapp: ['M20 11.5a8 8 0 0 1-11.6 7.2L3 21l1.8-5.2A8 8 0 1 1 20 11.5Z', 'm8 7 2 3-1 1c1 2 2 3 4 3l1-1 3 2c-1 3-4 3-7 0S6 9 8 7Z'],
  push: ['M8 17H5l2-3V9a5 5 0 0 1 10 0v5l2 3H8Z', 'M10 20h4'],
  mobile: ['M7 3h10v18H7Z', 'M10 6h4m-3 12h2'],
  inbox: ['M5 4h14l2 15H3L5 4Z', 'M4 13h5l1 3h4l1-3h5'],
  wait: ['M12 3a9 9 0 1 1 0 18 9 9 0 0 1 0-18Z', 'M12 7v5l3 2'],
  decision: ['M12 3v6M12 9H5v7m7-7h7v7', 'm2 13 3 3 3-3m8 0 3 3 3-3'],
  engagement: ['M12 3v18M3 12h18M6 6l12 12M6 18 18 6', 'm10 4 2-2 2 2m-4 16 2 2 2-2'],
  random: ['M4 6h3c5 0 5 12 10 12h3M4 18h3c2 0 3-2 4-4m2-4c1-2 2-4 4-4h3', 'm17 3 3 3-3 3m0 6 3 3-3 3'],
  optimizer: ['M4 5v14M4 8h7m-7 8h12', 'M11 5v6m5 2v6m-5-3 5-5 4 4'],
  contact: ['M10 3a4 4 0 1 1 0 8 4 4 0 0 1 0-8Z', 'M3 20v-3a5 5 0 0 1 8-4m3 5 5-5 2 2-5 5-3 1 1-3Z'],
  cloud: ['M6 18a4 4 0 0 1-1-8 5 5 0 0 1 9-3 4 4 0 0 1 5 4 3.5 3.5 0 0 1-1 7H6Z'],
  custom: ['m8 6-5 6 5 6m8-12 5 6-5 6M14 4l-4 16'],
  event: ['m13 3-8 11h6l-1 7 9-12h-7l1-6Z'],
  join: ['M5 3v5a4 4 0 0 0 4 4h3m7-9v5a4 4 0 0 1-4 4h-3v9', 'm8 17 4 4 4-4'],
}

export function journeyActivityVisual(type) {
  const key = String(type || '').replace(/[^a-z0-9]/gi, '').toUpperCase()
  if (VISUALS[key]) return VISUALS[key]
  if (key.includes('WAIT')) return visual('wait', 'diamond', FLOW)
  return visual('custom', 'square', '#65758b')
}

export function journeyCanvasModel(graph, layout, orientation = 'horizontal', selected = null) {
  const horizontal = orientation !== 'vertical'
  const nodes = graph.nodes.flatMap((node) => {
    const at = layout.pos.get(node.key)
    if (!at) return []
    return [{
      id: node.key, type: 'journeyActivity',
      position: horizontal ? { x: at.depth * 192, y: at.lane * 160 } : { x: at.lane * 216, y: at.depth * 176 },
      width: ACTIVITY_WIDTH, height: ACTIVITY_HEIGHT,
      draggable: false, connectable: false, selectable: false, focusable: false,
      style: { pointerEvents: 'all' },
      data: {
        key: node.key, name: node.name || nodeTypeLabel(node.type), typeLabel: nodeTypeLabel(node.type),
        summary: nodeSummary(node), visual: journeyActivityVisual(node.type), active: node.key === selected, orientation,
      },
    }]
  })
  const byId = new Map(nodes.map((node) => [node.id, node]))
  const pairs = new Map()
  const edges = graph.edges.flatMap((edge, index) => {
    const a = byId.get(edge.from)?.position
    const b = byId.get(edge.to)?.position
    if (!a || !b) return []
    const pair = JSON.stringify([edge.from, edge.to])
    const parallel = pairs.get(pair) || 0
    pairs.set(pair, parallel + 1)
    let path, x, y
    if (horizontal) {
      const x1 = a.x + 100, y1 = a.y + 26, x2 = b.x + 56, y2 = b.y + 26
      if (x2 <= x1) {
        const bottom = Math.max(a.y, b.y) + ACTIVITY_HEIGHT + 24 + parallel * 24
        path = `M${x1},${y1} H${x1 + 28} V${bottom} H${x2 - 28} V${y2} H${x2}`
        x = (x1 + x2) / 2; y = bottom - 12
      } else {
        const bend = x1 + 44 + parallel * 16
        const lane = y2 + parallel * 24
        path = `M${x1},${y1} H${bend} V${lane} H${x2 - 16} V${y2} H${x2}`
        x = (bend + x2 - 16) / 2; y = lane - 12
      }
    } else {
      const x1 = a.x + 78, y1 = a.y + ACTIVITY_HEIGHT, x2 = b.x + 78, y2 = b.y + 4
      if (y2 <= y1) {
        const side = Math.max(a.x, b.x) + ACTIVITY_WIDTH + 32 + parallel * 24
        path = `M${x1},${y1} V${y1 + 20} H${side} V${y2 - 20} H${x2} V${y2}`
        x = side + 24; y = (y1 + y2) / 2
      } else {
        const bend = y1 + 28 + parallel * 12
        const lane = x2 + parallel * 24
        path = `M${x1},${y1} V${bend} H${lane} V${y2 - 16} H${x2} V${y2}`
        x = (x1 + lane) / 2 + (x1 === lane ? 36 : 0); y = bend - 12
      }
    }
    return [{
      id: `journey-edge-${index}`, source: edge.from, target: edge.to, type: 'journeyStep',
      selectable: false, focusable: false, updatable: false,
      data: { path, x, y, label: String(edge.label || '') },
    }]
  })
  return { nodes, edges }
}
