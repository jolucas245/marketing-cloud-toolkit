// Journeys (Journey Builder interactions): list, one journey's definition, its canvas
// as a graph with a layout, and each node's content. Journey Builder is reached with
// its own session cookies; the service worker starts that session when needed.
//
// Not yet checked against a live org: the list filter (`nameOrDescription`), the
// detail call's `extras=all`, and the Journey Builder deep link format.
import { sfmcFetch } from './sfmcApi.js'
import { changesSince } from './localCache.js'
import { formatValue } from './activityTypes.js'
import { formatDateTime } from './format.js'
import { RESULTS_PAGE_SIZE } from './paging.js'

export const JOURNEY_PAGE_SIZE = RESULTS_PAGE_SIZE
const JB = (stack) => `https://jbinteractions.${stack}.marketingcloudapps.com/fuelapi/interaction/v1`

export const JOURNEY_STATUSES = ['Draft', 'Published', 'ScheduledToPublish', 'Paused', 'Stopped', 'Unpublished', 'Deleted']

// `allVersions`: every version of each journey, not only the newest (which may be a
// Draft while an older version is Published; live test, 2026-11-07).
export async function searchJourneys(stack, { query = '', status = '', page = 1, categoryId = null, allVersions = false } = {}) {
  const params = new URLSearchParams({
    $page: String(page), $pageSize: String(JOURNEY_PAGE_SIZE), $orderBy: 'ModifiedDate DESC', mostRecentVersionOnly: allVersions ? 'false' : 'true',
  })
  if (query.trim()) params.set('nameOrDescription', query.trim())
  if (status) params.set('status', status)
  // One folder (feedback #1064): the list's categoryId parameter (not checked live); the
  // page also drops journeys from other folders.
  if (categoryId != null) params.set('categoryId', String(categoryId))
  const data = await sfmcFetch(`${JB(stack)}/interactions?${params}`, 'GET')
  const items = data?.items || []
  return { items, total: data?.count ?? items.length }
}

// Statuses of a version that contacts can be in, best first. A journey's "current"
// version is the newest of these, else its newest version.
const LIVE_STATUSES = ['Published', 'ScheduledToPublish', 'Paused', 'Finishing', 'Sent']
const liveRank = (status) => { const i = LIVE_STATUSES.indexOf(String(status || '')); return i < 0 ? LIVE_STATUSES.length : i }

/** The version to show for a journey: the published (or otherwise live) one, else the newest. */
export function primaryVersion(versions) {
  return [...(versions || [])].sort((a, b) => liveRank(a.status) - liveRank(b.status) || (Number(b.version) || 0) - (Number(a.version) || 0))[0] || null
}

/**
 * List items of every version (`allVersions`) grouped per journey, in the order the
 * journeys first appear: [{ id, key, name, versions (newest first), primary }].
 */
export function groupJourneyVersions(items) {
  const groups = new Map()
  for (const j of items || []) {
    if (!groups.has(j.id)) groups.set(j.id, { id: j.id, key: j.key, name: j.name, versions: [] })
    groups.get(j.id).versions.push(j)
  }
  return [...groups.values()].map((g) => {
    g.versions.sort((a, b) => (Number(b.version) || 0) - (Number(a.version) || 0))
    const primary = primaryVersion(g.versions)
    return { ...g, name: primary?.name || g.name, primary }
  })
}

/**
 * Journeys changed after `since` for one search (feedback #1069): the list is sorted
 * newest change first, so pages are read until one holds an older journey.
 */
export function journeyChanges(stack, opts, since) {
  return changesSince(since, async (page) => (await searchJourneys(stack, { ...opts, page })).items)
}

/**
 * One journey's definition. Some journeys answer 404 "Interaction matching criteria
 * not found" for the version the list gives; then the call is made again without
 * a version, which returns the latest one.
 */
export async function fetchJourney(stack, id, version) {
  const url = (v) => `${JB(stack)}/interactions/${encodeURIComponent(id)}?extras=all${v ? `&versionNumber=${encodeURIComponent(v)}` : ''}`
  try {
    return await sfmcFetch(url(version), 'GET')
  } catch (e) {
    if (!version || !(e.status === 404 || /matching criteria not found/i.test(e.message || ''))) throw e
    return sfmcFetch(url(null), 'GET')
  }
}

// ── Send classification, sender and delivery profile names ──
// An email step stores only their IDs. Journey Builder's email activity reads the
// names from messaging-internal (sendClassifications/{id}, senderProfiles); the same
// paths answer on the Journey Builder host the Toolkit already uses (live test, 2026-11-07).
const MSG = (stack) => `https://jbinteractions.${stack}.marketingcloudapps.com/fuelapi/messaging-internal/v1`
const PROFILE_LISTS = { sendClassifications: 'sendClassifications', senderProfiles: 'senderProfiles', deliveryProfiles: 'deliveryProfiles' }
const lc = (v) => String(v ?? '').toLowerCase()

async function readAll(fetch, url) {
  const items = []
  for (let page = 1; page <= 10; page++) {
    const data = await fetch(`${url}?$page=${page}&$pagesize=100`, 'GET')
    const list = data?.items || []
    items.push(...list)
    if (list.length < 100 || items.length >= Number(data?.count || 0)) break
  }
  return items
}

/**
 * Names of the send classifications, sender profiles and delivery profiles, as
 * { sendClassifications, senderProfiles, deliveryProfiles }: Maps of lower-case ID to
 * the item. A list that can't be read is an empty Map (the step then shows the ID);
 * when none can be read it throws.
 */
export async function fetchSendNames(stack, fetch = sfmcFetch) {
  const keys = Object.keys(PROFILE_LISTS)
  const lists = await Promise.allSettled(keys.map((k) => readAll(fetch, `${MSG(stack)}/${PROFILE_LISTS[k]}`)))
  // None readable (no session, say): an error, so sendNames() tries again next time.
  if (lists.every((r) => r.status === 'rejected')) throw lists[0].reason
  return Object.fromEntries(keys.map((k, i) => [k, new Map((lists[i].status === 'fulfilled' ? lists[i].value : []).map((x) => [lc(x.id), x]))]))
}

const sendNameCache = new Map() // stack → Promise, for the life of the page
export function sendNames(stack, fetch = sfmcFetch) {
  if (!sendNameCache.has(stack)) {
    const p = fetchSendNames(stack, fetch)
    p.catch(() => sendNameCache.delete(stack))
    sendNameCache.set(stack, p)
  }
  return sendNameCache.get(stack)
}

/** True when a journey has an email step (the only steps that need the names). */
export const hasEmailStep = (journey) => (journey?.activities || []).some((a) => /^EMAIL(V2)?$/i.test(a?.type || ''))

export function journeyBuilderUrl(stack, journey) {
  return `https://mc.${stack}.exacttarget.com/cloud/#app/Journey%20Builder/%23${encodeURIComponent(journey.id)}/${journey.version || 1}`
}

// ── Node types ─────────────────────────────────────────────
const TYPE_LABELS = {
  PUSHINBOXACTIVITY: 'Inbox',
  SENDTOLINESYNC: 'LINE Message',
  WHATSAPPSESSIONTRANSFERACTIVITY: 'WhatsApp Session Transfer',
  EMAILV2: 'Email', EMAIL: 'Email', SMSSYNC: 'SMS', SMS: 'SMS', PUSHNOTIFICATIONACTIVITY: 'Push notification',
  INAPPSYNCACTIVITY: 'In-App Message', INBOXACTIVITY: 'Inbox message', WHATSAPPACTIVITY: 'WhatsApp',
  WAIT: 'Wait', WAITBYDURATION: 'Wait by duration', WAITBYATTRIBUTE: 'Wait By Attribute', WAITUNTILDATE: 'Wait Until Date',
  WAITUNTILSPECIFICDATE: 'Wait Until Date',
  WAITUNTILCHATRESPONSE: 'Wait Until Chat Response',
  WAITUNTILPUSHINAPPENGAGEMENT: 'Wait Until In-App Event',
  WAITUNTILPUSHENGAGEMENT: 'Wait Until Push Event',
  WAITUNTILAPI: 'Wait Until Event', WAITUNTILEVENT: 'Wait Until Event', STOWAIT: 'Einstein STO', MULTICRITERIADECISION: 'Decision split',
  RANDOMSPLIT: 'Random split', ENGAGEMENTSPLIT: 'Engagement split', ENGAGEMENTDECISION: 'Engagement split',
  ABNTEST: 'Path optimizer', ABNTESTSTOP: 'Winner', EINSTEINSPLIT: 'Einstein split', UPDATECONTACTDATA: 'Update contact',
  CONTACTDECISION: 'Decision split', SALESCLOUDACTIVITY: 'Salesforce activity', SALESFORCESALESCLOUDACTIVITY: 'Salesforce activity',
  OBJECTACTIVITY: 'Salesforce activity', REST: 'Custom activity', EVENT: 'Event', JOIN: 'Join',
  SALESFORCEACCOUNTACTIVITY: 'Account', SALESFORCECAMPAIGNMEMBERACTIVITY: 'Campaign Member',
  SALESFORCECASEANDCONTACTACTIVITY: 'Case', SALESFORCECONTACTACTIVITY: 'Contact',
  SALESFORCELEADCONVERSIONACTIVITY: 'Convert Lead', SALESFORCELEADACTIVITY: 'Lead',
  SALESFORCEGENERICOBJECTACTIVITY: 'Object Activity', SALESFORCEOPPORTUNITY: 'Opportunity', SALESFORCETASKACTIVITY: 'Task',
}
export const nodeTypeLabel = (type) => TYPE_LABELS[String(type || '').toUpperCase()] || (type ? String(type) : 'Activity')

const WAIT_DURATION_TYPES = new Set(['WAIT', 'WAITBYDURATION'])
const WAIT_DURATION_UNITS = new Set(['SECOND', 'MINUTE', 'HOUR', 'DAY', 'WEEK', 'MONTH', 'YEAR'])
const WAIT_DATE_TYPES = new Set(['WAITUNTILSPECIFICDATE', 'WAITUNTILDATE'])
const WAIT_EVENT_TYPES = new Set(['WAITUNTILAPI', 'WAITUNTILEVENT'])
const WAIT_UI_TYPES = new Set([...WAIT_DATE_TYPES, ...WAIT_EVENT_TYPES, 'WAITBYATTRIBUTE', 'WAITUNTILCHATRESPONSE', 'WAITUNTILPUSHINAPPENGAGEMENT', 'WAITUNTILPUSHENGAGEMENT'])
const SALESFORCE_EXTENSION_TYPES = new Map([
  ['Salesforce_Activity_Account', 'SALESFORCEACCOUNTACTIVITY'],
  ['Salesforce_Activity_CampaignMember', 'SALESFORCECAMPAIGNMEMBERACTIVITY'],
  ['Salesforce_Activity_Case', 'SALESFORCECASEANDCONTACTACTIVITY'],
  ['Salesforce_Activity_Contact', 'SALESFORCECONTACTACTIVITY'],
  ['Salesforce_Activity_Lead', 'SALESFORCELEADACTIVITY'],
  ['Salesforce_Activity', 'SALESFORCEGENERICOBJECTACTIVITY'],
  ['Salesforce_Activity_Opportunity', 'SALESFORCEOPPORTUNITY'],
  ['Salesforce_Activity_Task', 'SALESFORCETASKACTIVITY'],
])
const SALESFORCE_DISPLAY_TYPES = new Set([...SALESFORCE_EXTENSION_TYPES.values(), 'SALESFORCELEADCONVERSIONACTIVITY'])

export function nodeDisplayType(node) {
  const type = node?.type || ''
  const activity = node?.raw || node
  if (String(type).toUpperCase() === 'SALESCLOUDACTIVITY') {
    return SALESFORCE_EXTENSION_TYPES.get(activity?.configurationArguments?.applicationExtensionKey) || type
  }
  const uiType = String(activity?.metaData?.uiType || '').toUpperCase()
  return String(type).toUpperCase() === 'WAIT' && WAIT_UI_TYPES.has(uiType) ? uiType : type
}

export function nodeKind(type) {
  const t = String(type || '').toUpperCase()
  if (t === 'ENTRY') return 'entry'
  if (t === 'EXIT') return 'exit'
  if (t === 'ABNTESTSTOP') return 'action'
  if (/WAIT/.test(t)) return 'wait'
  if (/SPLIT|DECISION|ABNTEST/.test(t)) return 'split'
  if (/EMAIL|SMS|PUSH|INAPP|INBOX|WHATSAPP|SENDTOLINESYNC/.test(t)) return 'message'
  return 'action'
}

const ca = (a) => a?.configurationArguments || {}

function waitDurationLabel(configuration) {
  const value = configuration?.waitDuration
  if (!['number', 'string'].includes(typeof value) || String(value).trim() === '') return ''
  const duration = Number(value)
  const unit = String(configuration?.waitUnit || '').trim().toUpperCase().replace(/S$/, '')
  if (!Number.isFinite(duration) || duration < 0 || !WAIT_DURATION_UNITS.has(unit)) return ''
  return `${duration} ${unit.toLowerCase()}${duration === 1 ? '' : 's'}`
}

/** One line about what a node does, for the canvas. */
export function nodeSummary(n) {
  // A canvas node (with `raw`) or the activity itself.
  const a = n.raw && n.type !== 'ENTRY' ? n.raw : n
  const t = String(nodeDisplayType(a)).toUpperCase()
  const c = ca(a)
  if (t === 'ENTRY') return a.eventDefinitionKey ? `Event ${a.eventDefinitionKey}` : nodeTypeLabel(a.triggerType)
  if (t === 'EMAILV2' || t === 'EMAIL') return c.triggeredSend?.emailSubject ? `Subject: ${c.triggeredSend.emailSubject}` : ''
  if (WAIT_DURATION_TYPES.has(t)) return waitDurationLabel(c)
  if (WAIT_DATE_TYPES.has(t)) return c.specifiedDateTime ? `Until ${formatDateTime(c.specifiedDateTime)}` : ''
  if (t === 'WAITBYATTRIBUTE') return c.attributeName || c.waitForAttribute || ''
  if (a.outcomes?.length > 1) return `${a.outcomes.length} paths`
  return ''
}

const OUTCOME_LABELS = new Map([
  ['undersaturatedLabel', 'Undersaturated'],
  ['winbackLabel', 'Winback'],
  ['selectiveLabel', 'Selective Subscriber'],
  ['windowShopperLabel', 'Window Shopper'],
  ['loyalistLabel', 'Loyalist'],
  ['mostLikelyLabel', 'Most Likely'],
  ['moreLikelyLabel', 'More Likely'],
  ['lessLikelyLabel', 'Less Likely'],
  ['leastLikelyLabel', 'Least Likely'],
  ['mostEngagedLabel', 'Most Engaged'],
  ['moreEngagedLabel', 'More Engaged'],
  ['lessEngagedLabel', 'Less Engaged'],
  ['leastEngagedLabel', 'Least Engaged'],
  ['remainderLabel', 'Remainder'],
  ['almostSaturatedLabel', 'Almost Saturated'],
  ['onTargetLabel', 'On Target'],
  ['saturatedLabel', 'Saturated'],
])

export function outcomeLabel(o, i) {
  const m = o?.metaData || {}
  const pct = o?.arguments?.percentage
  return OUTCOME_LABELS.get(m.label) || m.label || m.pathName || OUTCOME_LABELS.get(m.i18nLabel) || o?.arguments?.branchResult || (pct != null ? `${pct}%` : '') || (i != null ? `Path ${i + 1}` : '')
}

// ── Graph ──────────────────────────────────────────────────
/**
 * Nodes and edges of a journey: the entry (trigger) first, then every activity.
 * An outcome's `next` names the activity it leads to; an outcome with no `next`
 * ends the path (shown as an exit node).
 */
export function journeyGraph(journey) {
  const activities = journey?.activities || []
  const byKey = new Map(activities.map((a) => [a.key, a]))
  const targets = new Set(activities.flatMap((a) => (a.outcomes || []).map((o) => o.next).filter(Boolean)))
  const trigger = journey?.triggers?.[0]
  const nodes = []
  const edges = []

  const entry = {
    key: '__entry', type: 'ENTRY', name: trigger?.name || 'Entry', triggerType: trigger?.type,
    eventDefinitionKey: trigger?.metaData?.eventDefinitionKey || trigger?.configurationArguments?.eventDefinitionKey || null,
    raw: trigger || null,
  }
  nodes.push(entry)
  // Roots: activities nothing leads to (normally just the first one).
  activities.filter((a) => !targets.has(a.key)).forEach((a) => edges.push({ from: entry.key, to: a.key, label: '' }))

  let exitCount = 0
  for (const a of activities) {
    const type = String(a.type || '').toUpperCase()
    const displayType = nodeDisplayType(a)
    const nameKey = String(a.name || '').toUpperCase()
    const durationName = WAIT_DURATION_TYPES.has(String(displayType).toUpperCase()) && ['', 'WAIT', 'WAITBYDURATION', 'WAIT BY DURATION'].includes(nameKey.trim()) ? waitDurationLabel(ca(a)) : ''
    const automaticName = ['ABNTESTSTOP', 'SENDTOLINESYNC', 'WHATSAPPSESSIONTRANSFERACTIVITY', 'INAPPSYNCACTIVITY', 'PUSHINBOXACTIVITY'].includes(type) && nameKey === type
    const dateName = WAIT_DATE_TYPES.has(String(displayType).toUpperCase()) && (nameKey === 'WAIT' || nameKey === 'WAIT UNTIL DATE' || WAIT_DATE_TYPES.has(nameKey))
    const attributeName = String(displayType).toUpperCase() === 'WAITBYATTRIBUTE' && ['WAIT', 'WAITBYATTRIBUTE', 'WAIT BY ATTRIBUTE'].includes(nameKey)
    const chatName = String(displayType).toUpperCase() === 'WAITUNTILCHATRESPONSE' && ['WAIT', 'WAITUNTILCHATRESPONSE', 'WAIT UNTIL CHAT RESPONSE'].includes(nameKey)
    const eventName = WAIT_EVENT_TYPES.has(String(displayType).toUpperCase()) && (nameKey === 'WAIT' || nameKey === 'WAIT UNTIL EVENT' || WAIT_EVENT_TYPES.has(nameKey))
    const inAppName = String(displayType).toUpperCase() === 'WAITUNTILPUSHINAPPENGAGEMENT' && ['WAIT', 'WAITUNTILPUSHINAPPENGAGEMENT', 'WAIT UNTIL IN-APP EVENT'].includes(nameKey)
    const pushName = String(displayType).toUpperCase() === 'WAITUNTILPUSHENGAGEMENT' && ['WAIT', 'WAITUNTILPUSHENGAGEMENT', 'WAIT UNTIL PUSH EVENT'].includes(nameKey)
    const salesforceName = SALESFORCE_DISPLAY_TYPES.has(String(displayType).toUpperCase()) && (nameKey === type || nameKey === String(displayType).toUpperCase())
    const name = durationName || (automaticName || dateName || attributeName || chatName || eventName || inAppName || pushName || salesforceName ? nodeTypeLabel(displayType) : a.name || nodeTypeLabel(displayType))
    nodes.push({ key: a.key, type: a.type, name, raw: a })
    const outs = a.outcomes || []
    const multi = outs.length > 1
    outs.forEach((o, i) => {
      const label = multi ? outcomeLabel(o, i) : ''
      if (o.next && byKey.has(o.next)) edges.push({ from: a.key, to: o.next, label })
      else {
        const key = `__exit${++exitCount}`
        nodes.push({ key, type: 'EXIT', name: 'Exit', raw: null })
        edges.push({ from: a.key, to: key, label })
      }
    })
    if (!outs.length) {
      const key = `__exit${++exitCount}`
      nodes.push({ key, type: 'EXIT', name: 'Exit', raw: null })
      edges.push({ from: a.key, to: key, label: '' })
    }
  }
  return { nodes, edges }
}

/**
 * Canvas positions like Journey Builder: depth along the flow, and a lane per path.
 * A node's first path stays in its lane; each further path takes the next free lane.
 * A node reached by several paths keeps the place of the first one.
 * Returns Map key → { depth, lane } and the canvas size in cells.
 */
export function layoutJourney({ nodes, edges }) {
  const children = new Map(nodes.map((n) => [n.key, []]))
  for (const e of edges) children.get(e.from)?.push(e.to)
  const pos = new Map()
  let nextLane = 0

  const place = (key, depth) => {
    if (pos.has(key)) return pos.get(key).lane
    pos.set(key, { depth, lane: -1 })
    const kids = children.get(key) || []
    let lane = -1
    kids.forEach((k, i) => {
      const fresh = !pos.has(k)
      const l = place(k, depth + 1)
      if (i === 0 || lane < 0) lane = fresh ? l : lane
    })
    if (lane < 0) lane = nextLane++
    pos.get(key).lane = lane
    return lane
  }
  if (nodes.length) place(nodes[0].key, 0)
  for (const n of nodes) if (!pos.has(n.key)) place(n.key, 0) // anything unreachable
  const depths = Math.max(0, ...[...pos.values()].map((p) => p.depth)) + 1
  return { pos, depths, lanes: Math.max(1, nextLane) }
}

// ── Node content ───────────────────────────────────────────
const kvTable = (title, obj, extra = false) => (obj && typeof obj === 'object' && Object.keys(obj).length
  ? { title, columns: ['Property', 'Value'], rows: Object.entries(obj).map(([k, v]) => [k, formatValue(v)]), extra }
  : null)

// Readable settings (feedback #42): labels in words, and IDs, keys and enum codes
// moved to the extra rows so the main list reads like Journey Builder.
const SETTING_LABELS = {
  isOptIn: 'Opt-in message', honorBlackoutWindowEnum: 'Blackout window', mobileBlackoutWindowStartTime: 'Blackout from',
  mobileBlackoutWindowEndTime: 'Blackout until', isUsingDEAttributesForPersonalization: 'Personalize with journey data',
  isConcatenate: 'Join long messages', shortLinks: 'Short links', fromName: 'From name', isFromNameCertificationAccepted: 'From name certified',
  googleCampaignName: 'Google Analytics campaign', description: 'Description',
}
const TECHNICAL_SETTING = /(Id|Ids|ID|Key|Guid|Enum)$|^(application|definition|reporting|campaign)/
export const settingLabel = (k) => SETTING_LABELS[k] || String(k).replace(/([a-z0-9])([A-Z])/g, '$1 $2').replace(/_/g, ' ')
  .replace(/^is /i, '').toLowerCase().replace(/^./, (c) => c.toUpperCase())

/** { main, extra } rows for a settings object: readable ones first, the rest (and empty ones) extra. */
export function settingsRows(obj) {
  const main = []
  const extra = []
  for (const [k, v] of Object.entries(obj || {})) {
    if (v !== null && typeof v === 'object') { extra.push([settingLabel(k), formatValue(v)]); continue }
    const value = formatValue(v)
    const technical = TECHNICAL_SETTING.test(k) && !SETTING_LABELS[k]
    ;(technical || value === '—' ? extra : main).push([settingLabel(k), value])
  }
  return { main, extra }
}

// ── Decision criteria ──────────────────────────────────────
const OPERATORS = {
  Equal: 'equals', NotEqual: 'is not', GreaterThan: 'is greater than', LessThan: 'is less than',
  GreaterThanOrEqual: 'is at least', LessThanOrEqual: 'is at most', Contains: 'contains', DoesNotContain: 'does not contain',
  BeginsWith: 'begins with', EndsWith: 'ends with', IsNull: 'is empty', IsNotNull: 'is not empty', Is: 'is', IsNot: 'is not',
  Between: 'is between', In: 'is one of', NotIn: 'is not one of',
}

/**
 * Journey Builder decision criteria (FilterDefinition XML) as readable text, e.g.
 * 'Country equals "CA" AND Age is at least "18"'. Returns the input when it can't be read.
 */
export function describeCriteria(xml) {
  if (!xml || typeof xml !== 'string' || !xml.includes('<')) return xml || ''
  let doc
  try { doc = new DOMParser().parseFromString(xml, 'application/xml') } catch { return xml }
  if (!doc || doc.getElementsByTagName('parsererror').length) return xml
  const text = (el) => {
    if (!el) return ''
    if (el.tagName === 'Condition') {
      const key = (el.getAttribute('Key') || '').split('.').pop()
      const op = el.getAttribute('Operator') || ''
      const values = [...el.getElementsByTagName('Value')].map((v) => `"${v.textContent.trim()}"`)
      return [key, OPERATORS[op] || op, values.join(' and ')].filter(Boolean).join(' ')
    }
    const parts = [...el.children].filter((c) => c.tagName === 'Condition' || c.tagName === 'ConditionSet').map(text).filter(Boolean)
    const joined = parts.join(` ${(el.getAttribute('Operator') || 'AND').toUpperCase()} `)
    return el.tagName === 'ConditionSet' && parts.length > 1 && el.parentElement?.tagName === 'ConditionSet' ? `(${joined})` : joined
  }
  const root = doc.documentElement
  const top = root.tagName === 'ConditionSet' ? root : root.getElementsByTagName('ConditionSet')[0] || root
  return text(top) || xml
}

/**
 * Display data for ActivityCard (see utils/activityTypes.js). `nameOf(key)` names
 * the step a path leads to; `names` is fetchSendNames() for an email step's profiles.
 */
export function describeJourneyNode(node, nameOf = (k) => k, names = null) {
  const a = node.raw || {}
  const t = String(node.type || '').toUpperCase()
  const c = ca(a)
  const main = []
  const extra = [['Key', formatValue(a.key ?? node.key)], ['ID', formatValue(a.id)]]
  let code = null
  const tables = []
  let deRefs = {}

  if (t === 'ENTRY') {
    main.push(['Entry type', nodeTypeLabel(a.type) || formatValue(a.type)], ['Event definition key', formatValue(node.eventDefinitionKey)])
    // The entry data extension, where the trigger names it (field names not checked live; feedback #72).
    const deName = a.metaData?.dataExtensionName || a.configurationArguments?.dataExtensionName || a.arguments?.dataExtensionName
    if (typeof deName === 'string' && deName.trim()) {
      main.push(['Data extension', deName])
      deRefs = { 'Data extension': { name: deName, id: a.metaData?.dataExtensionId || a.configurationArguments?.dataExtensionId || null, key: null } }
    }
    tables.push(kvTable('Entry settings', a.configurationArguments), kvTable('Entry details', a.metaData, true), kvTable('Arguments', a.arguments, true))
  } else if (t === 'EXIT') {
    main.push(['', 'Contacts leave the journey here.'])
  } else if (t === 'EMAILV2' || t === 'EMAIL') {
    const ts = c.triggeredSend || {}
    main.push(['Email', formatValue(ts.emailName || a.metaData?.emailName || a.name)], ['Subject', formatValue(ts.emailSubject)],
      ['Preheader', formatValue(ts.preHeader)], ['Email ID', formatValue(ts.emailId)])
    // Names when they were read (fetchSendNames), else the IDs, labelled as IDs (live test, 2026-11-07).
    for (const [label, field, list] of [['Send classification', 'sendClassificationId', 'sendClassifications'], ['Sender profile', 'senderProfileId', 'senderProfiles'], ['Delivery profile', 'deliveryProfileId', 'deliveryProfiles']]) {
      const id = ts[field]
      if (!id) continue
      const item = names?.[list]?.get(lc(id))
      if (item?.name) {
        const fromText = item.fromEmail ? (item.fromName && item.fromName !== item.fromEmail ? `${item.fromName} <${item.fromEmail}>` : item.fromEmail) : ''
        main.push([label, list === 'senderProfiles' && fromText && fromText !== item.name ? `${item.name} (from ${fromText})` : item.name])
        extra.push([`${label} ID`, String(id)])
      } else {
        main.push([`${label} ID`, String(id)])
      }
    }
    tables.push(kvTable('Send settings', ts, true))
  } else if (/WAIT/.test(t)) {
    const duration = waitDurationLabel(c)
    if (duration) main.push(['Wait', duration])
    if (c.specifiedDateTime) main.push(['Until', formatDateTime(c.specifiedDateTime)])
    if (c.timeZone || c.timezone) main.push(['Time zone', formatValue(c.timeZone || c.timezone)])
    if (c.waitEndDateAttributeExpression || c.attributeName) main.push(['Attribute', formatValue(c.waitEndDateAttributeExpression || c.attributeName)])
    tables.push(kvTable('Wait settings', c, true))
  } else {
    // SMS and every other type: readable settings, technical ones under additional details.
    if (t === 'SMSSYNC' || t === 'SMS') main.push(['Message', formatValue(a.metaData?.messageName || c.messageName || a.name || node.name)])
    const rows = settingsRows(c)
    main.push(...rows.main)
    extra.push(...rows.extra)
  }

  // Paths of a split or decision, with their criteria.
  const outs = a.outcomes || []
  if (outs.length > 1) {
    const criteriaFor = (o) => o.arguments?.criteria || c.criteria?.[o.key]
    tables.push({
      title: 'Paths', columns: ['Path', 'Criteria or share', 'Leads to'],
      rows: outs.map((o, i) => [
        outcomeLabel(o, i),
        criteriaFor(o) ? describeCriteria(criteriaFor(o)) : o.arguments?.percentage != null ? `${o.arguments.percentage}%` : formatValue(OUTCOME_LABELS.get(o.metaData?.i18nLabel) || OUTCOME_LABELS.get(o.metaData?.label) || (o.arguments?.branchResult ?? '')),
        o.next ? nameOf(o.next) : 'Exit',
      ]),
    })
    const criteria = outs.map((o, i) => (criteriaFor(o) ? `-- ${outcomeLabel(o, i)}\n${criteriaFor(o)}` : null)).filter(Boolean)
    if (criteria.length) tables.push({ title: 'Criteria as defined (XML)', columns: ['Value'], rows: [[criteria.join('\n\n')]], extra: true })
  }
  if (a.arguments && t !== 'ENTRY') tables.push(kvTable('Arguments', a.arguments, true))
  if (a.metaData && t !== 'ENTRY') tables.push(kvTable('Details', a.metaData, true))

  return {
    typeLabel: t === 'ENTRY' ? 'Entry' : t === 'EXIT' ? 'Exit' : nodeTypeLabel(nodeDisplayType(node) || a.type),
    title: node.name,
    link: null,
    main: main.filter(([, v]) => v !== '—'),
    extra,
    deRefs,
    code,
    tables: tables.filter(Boolean),
  }
}

/** The legacy email ID of an email node, used to find its Content Builder asset. */
export const nodeEmailId = (node) => ca(node.raw).triggeredSend?.emailId ?? null

/** Content Builder asset of a journey email, found by its legacy email ID (or null). */
export async function fetchJourneyEmailAsset(stack, emailId) {
  const data = await sfmcFetch(`https://content-builder.${stack}.marketingcloudapps.com/fuelapi/asset/v1/content/assets/query`, 'POST', {
    page: { page: 1, pageSize: 1 },
    query: { property: 'data.email.legacy.legacyId', simpleOperator: 'equal', value: Number(emailId) },
    fields: ['id', 'name', 'views', 'content', 'superContent', 'design', 'slots', 'blocks', 'meta', 'assetType'],
  })
  return data?.items?.[0] || null
}

// ── Export ─────────────────────────────────────────────────
export function journeyOverviewRows(j) {
  return [
    ['Name', j.name], ['Status', j.status], ['Version', j.version], ['Key', j.key], ['Description', j.description],
    ['Entry mode', j.entryMode], ['Created', formatDateTime(j.createdDate)], ['Modified', formatDateTime(j.modifiedDate)],
    ['Last published', formatDateTime(j.lastPublishedDate)], ['ID', j.id],
  ].filter(([, v]) => v != null && v !== '').map(([k, v]) => [k, String(v)])
}

export function journeyDoc(journey, graph, layout, diagram = null, names = null) {
  const ordered = [...graph.nodes].filter((n) => n.type !== 'EXIT')
    .sort((a, b) => (layout.pos.get(a.key)?.lane - layout.pos.get(b.key)?.lane) || (layout.pos.get(a.key)?.depth - layout.pos.get(b.key)?.depth))
  const blocks = [{ type: 'h', level: 2, text: 'Overview' }, { type: 'kv', rows: journeyOverviewRows(journey) },
    // The canvas as a drawing (feedback #1009), passed in as an SVG string.
    ...(diagram ? [{ type: 'h', level: 2, text: 'Journey' }, { type: 'svg', svg: diagram, note: 'Journey diagram: in the HTML and PDF downloads.' }] : []),
    { type: 'h', level: 2, text: 'Steps' }]
  const nameOf = (k) => graph.nodes.find((x) => x.key === k)?.name || k
  for (const n of ordered) {
    const d = describeJourneyNode(n, nameOf, names)
    const next = graph.edges.filter((e) => e.from === n.key).map((e) => {
      const to = graph.nodes.find((x) => x.key === e.to)
      return `${e.label ? `${e.label}: ` : ''}${to?.type === 'EXIT' ? 'Exit' : to?.name || e.to}`
    })
    blocks.push({ type: 'h', level: 3, text: `${d.typeLabel}: ${d.title}` },
      { type: 'kv', rows: [...d.main, ...d.extra, ['Next', next.join('; ') || 'Exit']] },
      ...(d.code ? [{ type: 'code', text: d.code.text }] : []),
      ...d.tables.flatMap((t) => [{ type: 'p', text: t.title }, { type: 'table', columns: t.columns, rows: t.rows }]))
  }
  for (const [title, list] of [['Goals', journey.goals], ['Exit criteria', journey.exits]]) {
    if (list?.length) blocks.push({ type: 'h', level: 2, text: title }, { type: 'code', text: JSON.stringify(list, null, 2) })
  }
  return { title: journey.name || 'Journey', blocks }
}
