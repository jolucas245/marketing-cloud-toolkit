import { nodeSummary, nodeTypeLabel } from './journeys.js'
import { JOURNEY_GEOMETRY, journeyFlowModel } from './journeyFlow.js'

export const ACTIVITY_WIDTH = JOURNEY_GEOMETRY.width
export const ACTIVITY_HEIGHT = JOURNEY_GEOMETRY.height
export const MIN_JOURNEY_ZOOM = 0.15
export const MAX_JOURNEY_ZOOM = 2.5

const visual = (icon, shape, color) => ({ icon, shape, color })
const MESSAGE = '#48c6c2'
const FLOW = '#f58a00'
const EINSTEIN = '#032d60'
const VISUALS = {
  ENTRY: visual('entry', 'circle', '#95d160'),
  EXIT: visual('exit', 'circle', '#95d160'),
  EMAIL: visual('email', 'square', MESSAGE),
  EMAILV2: visual('email', 'square', MESSAGE),
  SMSSYNC: visual('sms', 'square', MESSAGE),
  SMS: visual('sms', 'square', MESSAGE),
  SENDSMS: visual('sms', 'square', MESSAGE),
  SENDTOLINESYNC: visual('line', 'square', MESSAGE),
  WHATSAPPACTIVITY: visual('whatsapp', 'square', MESSAGE),
  WHATSAPPSESSIONTRANSFERACTIVITY: visual('sessionTransfer', 'square', MESSAGE),
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
  ABNTESTSTOP: visual('winner', 'circle', FLOW),
  EINSTEINSPLIT: visual('engagement', 'diamond', EINSTEIN),
  STOWAIT: visual('wait', 'diamond', EINSTEIN),
  UPDATECONTACTDATA: visual('contact', 'square', MESSAGE),
  SALESCLOUDACTIVITY: visual('cloud', 'square', '#167bbb'),
  SALESFORCESALESCLOUDACTIVITY: visual('cloud', 'square', '#167bbb'),
  OBJECTACTIVITY: visual('cloud', 'square', '#167bbb'),
  REST: visual('custom', 'square', '#65758b'),
  EVENT: visual('event', 'square', '#167bbb'),
  JOIN: visual('join', 'diamond', FLOW),
}

export const JOURNEY_ICON_PATHS = {
  sessionTransfer: ['M6 2h12a4 4 0 0 1 4 4v12a4 4 0 0 1-4 4H6a4 4 0 0 1-4-4V6a4 4 0 0 1 4-4Z'],
  line: ['M12 2.5C5.9 2.5 1 6.4 1 11.3c0 4.2 3.7 7.7 8.7 8.6.7.2.8.5.7 1.1l-.3 1.8c-.1.5.3.8.8.6 2.1-.8 6.8-3.8 9-6.4C22 14.9 23 13.3 23 11.3 23 6.4 18.1 2.5 12 2.5Z'],
  entry: ['M6 4h12a1 1 0 0 1 1 1v14a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1Z', 'M8 8h1m3 0h4M8 12h1m3 0h4M8 16h1m3 0h4'],
  exit: ['M11 5H5v14h6', 'M9 12h11m-4-4 4 4-4 4'],
  email: ['M4 4h16a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2Z','M2 7l7.4 6.2a4 4 0 0 0 5.2 0L22 7M2 17l6-5m14 5-6-5',],
  sms: ['M4 4h16v12H9l-5 4V4Z', 'M8 8h8M8 12h5'],
  whatsapp: ['M20 11.5a8 8 0 0 1-11.6 7.2L3 21l1.8-5.2A8 8 0 1 1 20 11.5Z', 'm8 7 2 3-1 1c1 2 2 3 4 3l1-1 3 2c-1 3-4 3-7 0S6 9 8 7Z'],
  push: [
    'M8 1.5h8a2 2 0 0 1 2 2v17a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2v-17a2 2 0 0 1 2-2ZM7.5 4.5v14h9v-14ZM10.3 2.7v.4h3.4v-.4ZM10.8 20v1.2h2.4V20Z',
    'M12 6a1.6 1.6 0 0 1 1.6 1.6c0 1.8-1 5.3-1.6 5.3s-1.6-3.5-1.6-5.3A1.6 1.6 0 0 1 12 6Z',
    'M13.35 15.6a1.35 1.35 0 1 1-2.7 0 1.35 1.35 0 1 1 2.7 0Z',
  ],
  mobile: ['M7 3h10v18H7Z', 'M10 6h4m-3 12h2'],
  inbox: ['M5 4h14l2 15H3L5 4Z', 'M4 13h5l1 3h4l1-3h5'],
  wait: ['M12 3a9 9 0 1 1 0 18 9 9 0 0 1 0-18Z', 'M12 7v5l3 2'],
  decision: ['M7 7a5 5 0 0 1 10 0c0 3-5 4-5 8v1','M12 19v2.4',],
  engagement: ['M12 2.5v4M6.3 4.3l2.8 2.8M4 10h4M6.3 15.7l2.8-2.8M17.7 4.3l-2.8 2.8M20 10h-4',],
  random: ['M17 5H8v14h9M5 12h12'],
  optimizer: ['M8 2h6v1H8Z', 'M9 3v7l-4.7 8.4A1.1 1.1 0 0 0 5.3 20H12M13 3v7l2.7 4.8'],
  winner: ['M6 4v17', 'M9 5c3-2 6 2 11 0v9c-5 2-8-2-11 0Z'],
  contact: ['M10 3a4 4 0 1 1 0 8 4 4 0 0 1 0-8Z', 'M3 20v-3a5 5 0 0 1 8-4m3 5 5-5 2 2-5 5-3 1 1-3Z'],
  cloud: ['M6 18a4 4 0 0 1-1-8 5 5 0 0 1 9-3 4 4 0 0 1 5 4 3.5 3.5 0 0 1-1 7H6Z'],
  custom: ['m8 6-5 6 5 6m8-12 5 6-5 6M14 4l-4 16'],
  event: ['m13 3-8 11h6l-1 7 9-12h-7l1-6Z'],
  join: ['M5 3v5a4 4 0 0 0 4 4h3m7-9v5a4 4 0 0 1-4 4h-3v9', 'm8 17 4 4 4-4'],
}

export function journeyActivityVisual(type, isConfigured, isEinstein = false) {
  const key = String(type || '').replace(/[^a-z0-9]/gi, '').toUpperCase()
  const appearance = VISUALS[key] || (key.includes('WAIT') ? visual('wait', 'diamond', FLOW) : visual('custom', 'square', '#65758b'))
  const color = isConfigured === false ? '#a8b7c7' : isEinstein ? EINSTEIN : appearance.color
  return { ...appearance, color }
}

export function journeyActivityIcon(activity) {
  for (const value of [activity?.metaData?.icon, activity?.icon, activity?.configurationArguments?.icon]) {
    if (typeof value !== 'string') continue
    try {
      const url = new URL(value)
      if (url.protocol === 'https:' && !url.username && !url.password && !url.port
        && (url.hostname === 'sfmc-einstein.com' || url.hostname.endsWith('.sfmc-einstein.com'))) return url.href
    } catch {}
  }
  return null
}

export function journeyCanvasModel(graph, layout, orientation = 'horizontal', selected = null) {
  const mergeTargets = new Set(graph.nodes.filter((node) => String(node.type || '').toUpperCase() === 'ABNTESTSTOP').map((node) => node.key))
  const flow = journeyFlowModel(graph, layout, orientation, { mergeTargets })
  const nodes = graph.nodes.flatMap((node) => {
    const at = flow.positions.get(node.key)
    if (!at) return []
    const iconUrl = journeyActivityIcon(node.raw)
    return [{
      id: node.key, type: 'journeyActivity', position: at,
      width: ACTIVITY_WIDTH, height: ACTIVITY_HEIGHT,
      draggable: false, connectable: false, selectable: false, focusable: false,
      style: { pointerEvents: 'all' },
      data: {
        key: node.key,
        name: node.name || nodeTypeLabel(node.type),
        typeLabel: nodeTypeLabel(node.type),
        iconUrl,
        summary: nodeSummary(node),
        visual: journeyActivityVisual(node.type, node.raw?.metaData?.isConfigured, Boolean(iconUrl)),
        active: node.key === selected,
        orientation,
      },
    }]
  })
  for (const branch of flow.branches) {
    nodes.push({
      id: branch.id, type: 'journeyRoute', position: branch.position,
      width: ACTIVITY_WIDTH, height: ACTIVITY_HEIGHT,
      draggable: false, connectable: false, selectable: false, focusable: false,
      data: { visual: { color: 'transparent' } },
    })
  }
  const byId = new Map(nodes.map((node) => [node.id, node]))
  const edges = flow.edges.map((edge) => {
    const junction = edge.junction && {
      x: edge.junction.x, y: edge.junction.y, count: edge.junction.count,
      color: journeyActivityVisual('JOIN').color,
      description: `${edge.junction.count} joining ${edge.junction.count === 1 ? 'path' : 'paths'} before ${byId.get(edge.junction.target).data.name}`,
    }
    return {
      id: `journey-edge-${edge.index}`, source: edge.from, target: edge.to, type: 'journeyStep',
      selectable: false, focusable: false, updatable: false,
      data: { path: edge.path, x: edge.x, y: edge.y, label: edge.label, ...(junction ? { junction } : {}) },
    }
  })
  return { nodes, edges }
}
