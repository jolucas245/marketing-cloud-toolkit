// What Journey Builder shows about a journey (user, 2026-11-10: match it). Checked live on
// s10 with TK_Paths_Test_Journey: its properties panel lists Description, Status
// ("Running" for a published version), Version, Activity Count (4: the activities, not the
// exits), Created Date, Journey Duration ("1 Minute": the longest path's waits) and the
// Definition ID; the entry event card names the event, its data extension and its event
// definition key; and every activity shows how many contacts reached it, from
// interaction/v1/goalstatistics/<id>?versionNumber=<n> (per day, per activityId).
import { formatDateTime, statusWords } from './format.js'

// Journey Builder's status names. Published shows as Running (seen live); the dashboard's
// Scheduled is ScheduledToPublish.
const JB_STATUS = { published: 'Running', scheduledtopublish: 'Scheduled', unpublished: 'Draft' }
export const journeyStatusWord = (s) => JB_STATUS[String(s || '').toLowerCase()] || statusWords(s)

// Journey Settings > Contact Entry Mode, in Journey Builder's words.
const ENTRY_MODES = {
  multipleentries: 'Re-entry anytime',
  onceanddone: 'No re-entry',
  singleentryacrossallversions: 'Re-entry only after exiting',
}
export const entryModeWords = (m) => ENTRY_MODES[String(m || '').toLowerCase()] || statusWords(m)

const isStop = (a) => /stop/i.test(String(a?.type || '')) || (!a?.type && /^stop$/i.test(String(a?.name || '')))
export const activityCount = (j) => (j?.activities || []).filter((a) => !isStop(a)).length

const MINUTES = { MINUTE: 1, HOUR: 60, DAY: 1440, WEEK: 10080 }
// A duration wait's length in minutes; null for any other wait or a month (not a fixed length).
function waitMinutes(a) {
  const c = a?.configurationArguments || {}
  if (!/wait/i.test(String(a?.type || '')) || c.waitDuration == null) return null
  const unit = String(c.waitUnit || '').toUpperCase().replace(/S$/, '')
  const n = Number(c.waitDuration)
  return MINUTES[unit] && Number.isFinite(n) ? n * MINUTES[unit] : null
}

/**
 * The longest path's total wait, in minutes, or null when a path has a wait that is not a
 * plain duration (until a date, an attribute, an event, months): Journey Builder's
 * "Journey Duration" for those is not worked out here.
 */
export function journeyDurationMinutes(j) {
  const acts = new Map((j?.activities || []).map((a) => [a.key, a]))
  const targets = new Set((j?.activities || []).flatMap((a) => (a.outcomes || []).map((o) => o.next).filter(Boolean)))
  const roots = (j?.activities || []).filter((a) => !targets.has(a.key))
  let unknown = false
  const memo = new Map()
  const longest = (key, seen) => {
    if (!acts.has(key) || seen.has(key)) return 0
    if (memo.has(key)) return memo.get(key)
    const a = acts.get(key)
    let own = 0
    if (/wait/i.test(String(a.type || ''))) { const m = waitMinutes(a); if (m == null) unknown = true; else own = m }
    const next = new Set(seen).add(key)
    const rest = Math.max(0, ...(a.outcomes || []).map((o) => (o.next ? longest(o.next, next) : 0)))
    memo.set(key, own + rest)
    return own + rest
  }
  const total = Math.max(0, ...roots.map((r) => longest(r.key, new Set())))
  return unknown ? null : total
}

/** "1 Minute", "3 Days", "1 Day 2 Hours" (Journey Builder writes units in title case). */
export function durationWords(minutes) {
  if (minutes == null) return ''
  if (minutes === 0) return '0 Minutes'
  const parts = []
  let left = minutes
  for (const [unit, size] of [['Week', 10080], ['Day', 1440], ['Hour', 60], ['Minute', 1]]) {
    const n = Math.floor(left / size)
    if (n) { parts.push(`${n} ${unit}${n === 1 ? '' : 's'}`); left -= n * size }
  }
  return parts.join(' ')
}

/** The rows of Journey Builder's properties panel, plus the Toolkit's own extras. */
export function journeyOverviewRows(j, extra = {}) {
  const ev = extra.event || null
  return [
    ['Name', j.name], ['Description', j.description], ['Status', journeyStatusWord(j.status)], ['Version', j.version != null ? `Version ${j.version}` : ''],
    ['Activity count', String(activityCount(j))], ['Journey duration', durationWords(journeyDurationMinutes(j))],
    ['Entry', ev?.name || j.triggers?.[0]?.name], ['Data extension', ev?.dataExtensionName], ['Event definition key', ev?.eventDefinitionKey || j.triggers?.[0]?.metaData?.eventDefinitionKey],
    ['Contact entry', entryModeWords(j.entryMode)],
    ['Created', formatDateTime(j.createdDate)], ['Modified', formatDateTime(j.modifiedDate)], ['Last published', formatDateTime(j.lastPublishedDate)],
    ['Key', j.key], ['Definition ID', j.id],
  ].filter(([, v]) => v != null && v !== '').map(([k, v]) => [k, String(v)])
}

/**
 * Contacts that reached each canvas node, from goalstatistics: Map node key -> count.
 * The entry is the Start Activity's row; an exit gets its activity's count when that
 * activity has one way out (otherwise SFMC does not say which exit they took).
 */
export function populationByNode(stats, journey, graph) {
  const byId = new Map()
  for (const day of stats?.days || []) {
    for (const a of day.activities || []) {
      const v = Number(a.cumulativePopulationForDay) || 0
      byId.set(a.activityId, (byId.get(a.activityId) || 0) + v)
      // Everyone who entered passes the Start Activity, whatever the entry source.
      if (/^startactivity$/i.test(String(a.activityType || ''))) byId.set('__entry', (byId.get('__entry') || 0) + v)
    }
  }
  if (!byId.size) return null
  const out = new Map()
  for (const n of graph.nodes) {
    if (n.key === '__entry') { if (byId.has('__entry')) out.set(n.key, byId.get('__entry')) }
    else if (n.raw?.id && byId.has(n.raw.id)) out.set(n.key, byId.get(n.raw.id))
  }
  for (const n of graph.nodes.filter((x) => x.type === 'EXIT')) {
    const from = graph.edges.find((e) => e.to === n.key)?.from
    if (from && graph.edges.filter((e) => e.from === from).length === 1 && out.has(from)) out.set(n.key, out.get(from))
  }
  return out
}
