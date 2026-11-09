// Contact journeys: where one contact is and has been in Journey Builder, and the path
// it took through each journey.
//
// Two Journey Builder calls, on the same host as the Journeys page:
// - POST interactions/contactMembership { ContactKeyList: [key] }: the journeys (key and
//   version) the contact is in now (public REST endpoint).
// - POST interactions/journeyhistory/search: the steps a contact went through (the
//   call behind Journey Builder's Journey History; its body is confirmed, see historyBody).
//   POSTs need Journey Builder's CSRF token (background/jbCsrf.js). Item fields seen live
//   (2026-11-02, a test journey with a random split): definitionId, definitionName,
//   contactKey, transactionTime, epochTimeInMilliseconds, status, clientStatus, message,
//   activityId (the published activity's id), activityType (WaitActivity, RANDOMSPLIT,
//   Trigger, StartInteractionActivity, StopInteractionActivity, ...), activityName,
//   outcomeActivityId. No version field. Other spellings are still accepted.
// The data-view SQL (`journeySendsSql`) is the fallback: email sends only, from _Sent
// joined to _JourneyActivity and _Journey.
import { sfmcFetch } from './sfmcApi.js'
import { fetchJourney } from './journeys.js'

const JB = (stack) => `https://jbinteractions.${stack}.marketingcloudapps.com/fuelapi/interaction/v1`

export const HISTORY_PAGE_SIZE = 500
export const HISTORY_MAX = 5000
export const RANGES = [
  { days: 7, label: 'Last 7 days' },
  { days: 30, label: 'Last 30 days' },
  { days: 90, label: 'Last 90 days' },
]

export async function fetchContactMembership(stack, contactKey, fetcher = sfmcFetch) {
  const data = await fetcher(`${JB(stack)}/interactions/contactMembership`, 'POST', { ContactKeyList: [contactKey] })
  const list = data?.results?.contactMemberships || data?.contactMemberships || []
  const failed = data?.results?.contactMembershipErrors || data?.contactMembershipErrors || []
  return {
    memberships: list.map((m) => ({
      contactKey: m.contactKey ?? m.ContactKey ?? contactKey,
      definitionKey: m.definitionKey ?? m.DefinitionKey ?? '',
      version: m.version ?? m.Version ?? null,
    })),
    errors: failed,
  }
}

// The body Journey Builder's own Journey History page sends (captured live 2026-11-02):
// { start, end, contactKeys: [...], journeySearchKey: '' }. Its journey filter only lists
// journeys that have history, so that field was not seen; "within one journey" is
// filtered here instead (ContactJourneysPage `inScope`).
export function historyBody(contactKey, { days = 30, now = new Date() } = {}) {
  const end = new Date(now)
  const start = new Date(end.getTime() - days * 86400000)
  return { start: start.toISOString(), end: end.toISOString(), contactKeys: [contactKey], journeySearchKey: '' }
}

/** Every history item for a contact (pages of 500, up to HISTORY_MAX), newest first as SFMC sends them. */
export async function fetchContactHistory(stack, contactKey, opts = {}, fetcher = sfmcFetch) {
  const body = historyBody(contactKey, opts)
  const items = []
  let total = null
  for (let page = 1; items.length < HISTORY_MAX; page++) {
    const params = new URLSearchParams({ $page: String(page), $pageSize: String(HISTORY_PAGE_SIZE), $orderBy: 'TransactionTime desc' })
    const data = await fetcher(`${JB(stack)}/interactions/journeyhistory/search?${params}`, 'POST', body)
    const list = data?.items || data?.entry || (Array.isArray(data) ? data : [])
    total = Number.isFinite(Number(data?.count)) ? Number(data.count) : total
    items.push(...list)
    if (list.length < HISTORY_PAGE_SIZE || (total != null && items.length >= total)) break
  }
  // The search may ignore contactKey in some accounts; keep only this contact's rows when the field is there.
  const own = items.filter((it) => {
    const k = pick(it, 'contactKey', 'ContactKey', 'subscriberKey', 'SubscriberKey')
    return k == null || String(k) === String(contactKey)
  })
  return { items: own.map(parseHistoryItem), raw: own, total }
}

function pick(o, ...names) {
  for (const n of names) if (o?.[n] != null && o[n] !== '') return o[n]
  return null
}

/** One history row in a fixed shape. */
export function parseHistoryItem(it) {
  return {
    definitionId: String(pick(it, 'definitionId', 'DefinitionId', 'definitionID', 'interactionId') ?? ''),
    definitionKey: String(pick(it, 'definitionKey', 'DefinitionKey', 'interactionKey') ?? ''),
    journeyName: String(pick(it, 'definitionName', 'DefinitionName', 'interactionName', 'journeyName') ?? ''),
    version: pick(it, 'version', 'Version', 'versionNumber', 'interactionVersion'),
    // One contact's run through the journey (feedback #1020): every row of one entry shares it.
    instanceId: String(pick(it, 'definitionInstanceId', 'DefinitionInstanceId', 'definitionInstanceID', 'instanceId') ?? ''),
    activityId: String(pick(it, 'activityId', 'ActivityId', 'activityID') ?? ''),
    activityKey: String(pick(it, 'activityKey', 'ActivityKey') ?? ''),
    activityName: String(pick(it, 'activityName', 'ActivityName') ?? ''),
    activityType: String(pick(it, 'activityType', 'ActivityType') ?? ''),
    status: String(pick(it, 'status', 'Status', 'activityStatus') ?? ''),
    time: String(pick(it, 'transactionTime', 'TransactionTime', 'createdDate', 'eventDate') ?? ''),
    ms: Number(pick(it, 'epochTimeInMilliseconds')) || null,
    clientStatus: String(pick(it, 'clientStatus') ?? ''),
    message: String(pick(it, 'statusDetail', 'StatusDetail', 'message', 'Message', 'errorMessage', 'statusMessage') ?? ''),
    raw: it,
  }
}

/**
 * History grouped per journey version, each with its steps oldest first.
 * Returns [{ id, definitionId, definitionKey, name, version, steps, first, last, failed }] newest activity first.
 */
export function groupByJourney(items) {
  const groups = new Map()
  for (const it of items) {
    const id = `${it.definitionId || it.definitionKey || it.journeyName}|${it.version ?? ''}`
    if (!groups.has(id)) groups.set(id, { id, definitionId: it.definitionId, definitionKey: it.definitionKey, name: it.journeyName, version: it.version, steps: [] })
    groups.get(id).steps.push(it)
  }
  const out = [...groups.values()].map((g) => {
    g.steps.sort((a, b) => timeOf(a) - timeOf(b))
    g.first = g.steps[0]?.time || ''
    g.last = g.steps[g.steps.length - 1]?.time || ''
    g.failed = g.steps.filter((s) => /fail|error/i.test(s.status)).length
    g.entries = splitEntries(g.steps)
    return g
  })
  return out.sort((a, b) => timeOf({ time: b.last }) - timeOf({ time: a.last }))
}

/**
 * A journey's steps split into entries by definitionInstanceId (feedback #1020): each
 * entry is one run of the contact through the journey, steps oldest first. Rows
 * without an instance id join the entry whose time range they fall in, else their own.
 * Returns [{ id, steps, first, last, failed }] newest first.
 */
const ATTEMPT_LEAD_MS = 5 * 60 * 1000

export function splitEntries(steps) {
  const byId = new Map()
  const loose = []
  for (const s of steps) {
    if (!s.instanceId) { loose.push(s); continue }
    if (!byId.has(s.instanceId)) byId.set(s.instanceId, [])
    byId.get(s.instanceId).push(s)
  }
  const entries = [...byId.entries()].map(([id, list]) => ({ id, steps: list }))
  // Entry attempts (status ContactAttempted, no instance ID) come a few seconds before the
  // entry they start (seen live 2026-11-09, feedback #1095): they join the next entry
  // starting within ATTEMPT_LEAD_MS instead of counting as an entry of their own.
  const startOf = (e) => Math.min(...e.steps.map(timeOf))
  const endOf = (e) => Math.max(...e.steps.map(timeOf))
  const real = [...entries]
  for (const s of loose) {
    const t = timeOf(s)
    let home = real.find((e) => t >= startOf(e) && t <= endOf(e))
    if (!home) {
      const next = real.filter((e) => startOf(e) >= t && startOf(e) - t <= ATTEMPT_LEAD_MS)
        .filter((e) => !e.steps.some((x) => !x.instanceId))
        .sort((a, b) => startOf(a) - startOf(b))
      home = next[0]
    }
    if (home) home.steps.push(s)
    else entries.push({ id: '', steps: [s] })
  }
  // Loose rows outside every entry: one entry for them all.
  const merged = []
  let other = null
  for (const e of entries) {
    if (e.id) merged.push(e)
    else if (other) other.steps.push(...e.steps)
    else { other = e; merged.push(e) }
  }
  for (const e of merged) {
    e.steps.sort((a, b) => timeOf(a) - timeOf(b))
    e.first = e.steps[0]?.time || ''
    e.last = e.steps[e.steps.length - 1]?.time || ''
    e.failed = e.steps.filter((s) => /fail|error/i.test(s.status)).length
  }
  return merged.sort((a, b) => timeOf({ time: b.last, ms: b.steps[b.steps.length - 1]?.ms }) - timeOf({ time: a.last, ms: a.steps[a.steps.length - 1]?.ms }))
}

function timeOf(s) { if (s.ms) return s.ms; const t = Date.parse(s.time); return Number.isFinite(t) ? t : 0 }

// Rows Journey Builder logs around entry and exit that are not canvas activities
// (seen live 2026-11-02): an entry attempt with no activity, the Trigger (entry event),
// StartInteractionActivity, and StopInteractionActivity when the contact leaves.
const ENTRY_TYPES = /^(trigger|startinteractionactivity)$/i
const EXIT_TYPES = /^(stopinteractionactivity)$/i
export const isEntryRow = (s) => !s.activityType || ENTRY_TYPES.test(s.activityType)
export const isExitRow = (s) => EXIT_TYPES.test(s.activityType)

/** A readable label for a history row's step. */
export function stepLabel(s) {
  if (!s.activityType && !s.activityName) return s.status === 'ContactAttempted' ? 'Entry attempted' : (s.status || 'Entry')
  if (ENTRY_TYPES.test(s.activityType)) return s.activityType.toLowerCase() === 'trigger' ? `Entry: ${s.activityName || 'event'}` : 'Journey started'
  if (isExitRow(s)) return 'Left the journey'
  return s.activityName || s.activityKey || s.activityId
}

/**
 * The canvas node keys the steps match in a journey definition, in step order:
 * by activity id, then key, then (when unique) name. Entry and exit rows are not
 * activities; `ended` says the contact left the journey. Returns { keys, unmatched, ended }.
 */
export function matchSteps(journey, steps) {
  const acts = journey?.activities || []
  const byId = new Map(acts.filter((a) => a.id).map((a) => [String(a.id).toLowerCase(), a.key]))
  const byKey = new Map(acts.map((a) => [String(a.key).toLowerCase(), a.key]))
  const names = new Map()
  for (const a of acts) {
    const n = String(a.name || '').toLowerCase()
    if (!n) continue
    names.set(n, names.has(n) ? null : a.key)
  }
  const keys = []
  const unmatched = []
  let ended = false
  for (const s of steps) {
    if (isEntryRow(s)) continue
    if (isExitRow(s)) { ended = true; continue }
    const k = byId.get(s.activityId.toLowerCase()) || byKey.get(s.activityKey.toLowerCase()) || byKey.get(s.activityId.toLowerCase())
      || (s.activityName && names.get(s.activityName.toLowerCase())) || null
    if (k) { if (keys[keys.length - 1] !== k) keys.push(k) } else unmatched.push(s)
  }
  return { keys, unmatched, ended }
}

/**
 * The visited nodes and edges on the canvas graph (journeyGraph): the entry, every
 * matched step, and each edge between a visited node and the next visited one.
 * When the last step's node has a single way out to an exit, that exit is marked too
 * only if `ended` is true.
 */
export function pathOnGraph(graph, keys, { ended = false } = {}) {
  const nodes = new Set(keys.length ? ['__entry', ...keys] : [])
  const edges = new Set()
  const seq = keys.length ? ['__entry', ...keys] : []
  for (let i = 0; i + 1 < seq.length; i++) {
    const idx = graph.edges.findIndex((e) => e.from === seq[i] && e.to === seq[i + 1])
    if (idx >= 0) edges.add(idx)
  }
  if (ended && seq.length) {
    const outs = graph.edges.map((e, i) => ({ e, i })).filter(({ e }) => e.from === seq[seq.length - 1])
    if (outs.length === 1 && outs[0].e.to.startsWith('__exit')) { edges.add(outs[0].i); nodes.add(outs[0].e.to) }
  }
  return { nodes, edges }
}

/** The step number(s) per node key, for badges on the canvas. */
export function stepNumbers(keys) {
  const m = new Map()
  keys.forEach((k, i) => m.set(k, [...(m.get(k) || []), i + 1]))
  return m
}

const sqlText = (s) => `'${String(s).replace(/'/g, "''")}'`

/** Data-view SQL: every journey email this contact was sent, with the journey, version and step. */
export function journeySendsSql(contactKey) {
  return `SELECT j.JourneyName, j.VersionNumber, ja.ActivityName, ja.ActivityType, s.EventDate AS SentDate, s.SubscriberKey, s.JobID
FROM _Sent s
INNER JOIN _JourneyActivity ja ON ja.JourneyActivityObjectID = s.TriggererSendDefinitionObjectID
INNER JOIN _Journey j ON j.VersionID = ja.VersionID
WHERE s.SubscriberKey = ${sqlText(contactKey)}`
}

const notFound = (e) => e?.status === 404 || /error 404|matching criteria not found/i.test(e?.message || '')

/**
 * The journey definition behind one history group (feedback #1024). The history's
 * definitionId is usually the version's id, but Journey Builder answers 404 for some
 * (a deleted version, or the id shared by every version). Then: by key, then the
 * journeys with that name (every version) matched on definitionId or id, else by exact
 * name, newest version first. Returns { journey, fallback } where `fallback` says the
 * drawing is from another version than the one the history named.
 */
export async function journeyForHistory(stack, g, { get = fetchJourney, fetcher = sfmcFetch } = {}) {
  const id = g.definitionId || g.definitionKey
  if (!id) throw new Error('The history does not say which journey this is.')
  try {
    return { journey: await get(stack, id, g.version), fallback: false }
  } catch (e) {
    if (!notFound(e)) throw e
  }
  if (g.definitionKey) {
    try { return { journey: await get(stack, `key:${g.definitionKey}`), fallback: true } } catch (e) { if (!notFound(e)) throw e }
  }
  if (g.name) {
    const params = new URLSearchParams({ $page: '1', $pageSize: '50', $orderBy: 'ModifiedDate DESC', mostRecentVersionOnly: 'false', nameOrDescription: g.name })
    const data = await fetcher(`${JB(stack)}/interactions?${params}`, 'GET')
    const items = data?.items || []
    const lc = (v) => String(v ?? '').toLowerCase()
    const want = lc(g.definitionId)
    const hit = (want && items.filter((j) => lc(j.definitionId) === want || lc(j.id) === want))
    const pool = hit?.length ? hit : items.filter((j) => lc(j.name) === lc(g.name))
    const best = [...pool].sort((a, b) => (Number(b.version) || 0) - (Number(a.version) || 0))[0]
    if (best) {
      const exact = lc(best.id) === want
      return { journey: await get(stack, best.id, exact ? g.version : best.version), fallback: !exact }
    }
  }
  throw new Error('Journey Builder no longer has this journey version (it was deleted, or it is in another business unit). The steps above are still from the history.')
}

const STEP_COLUMNS = ['#', 'When', 'Step', 'Type', 'Status', 'Message']
const stepRow = (s, i, fmt) => [String(i + 1), s.time ? fmt(s.time) : '', stepLabel(s), s.activityType, s.status, s.message]

/** The flow of one entry as text: "Entry attempted → Entry: event → ... → Left the journey". */
export const entryFlowText = (entry) => entry.steps.map(stepLabel).join(' → ')

/**
 * The page as a document for the Download menu (feedback #1019): who and when, the
 * journeys the contact is in now, and per journey each entry's flow and steps, with
 * the canvas drawing (`diagrams`: group id → SVG) where one was opened.
 */
export function contactJourneysDoc({ contactKey, scopeLabel, periodLabel, membership, groups, diagrams = {}, fmt = (t) => t }) {
  const blocks = [{ type: 'kv', rows: [['Contact Key', contactKey], ['Journeys', scopeLabel], ['Period', periodLabel]] },
    { type: 'h', level: 2, text: 'In now' }]
  if (membership?.error) blocks.push({ type: 'p', text: `Could not read: ${membership.error}` })
  else if (!membership?.length) blocks.push({ type: 'p', text: 'Not in any journey now.' })
  else blocks.push({ type: 'table', columns: ['Journey key', 'Version'], rows: membership.map((m) => [m.definitionKey, String(m.version ?? '')]) })
  blocks.push({ type: 'h', level: 2, text: 'Journey history' })
  if (!groups.length) blocks.push({ type: 'p', text: 'No journey steps for this contact in this period.' })
  for (const g of groups) {
    blocks.push({ type: 'h', level: 3, text: `${g.name || g.definitionKey || g.definitionId || 'Journey'}${g.version != null ? ` (version ${g.version})` : ''}` })
    if (diagrams[g.id]) blocks.push({ type: 'svg', svg: diagrams[g.id], note: 'Journey diagram with the path: in the HTML and PDF downloads.' })
    g.entries.forEach((e, n) => {
      blocks.push({ type: 'h', level: 4, text: `Entry ${g.entries.length - n}${e.first ? `: ${fmt(e.first)}` : ''}${e.failed ? ` (${e.failed} failed)` : ''}` })
      blocks.push({ type: 'p', text: entryFlowText(e) })
      blocks.push({ type: 'table', columns: STEP_COLUMNS, rows: e.steps.map((s, i) => stepRow(s, i, fmt)) })
    })
  }
  return { title: `Contact journeys: ${contactKey}`, blocks }
}

/** Every step as CSV rows (journey, version, entry, step fields). */
export function contactJourneysRows(groups) {
  const rows = [['Journey', 'Version', 'Entry', 'Instance ID', 'Step #', 'When', 'Step', 'Type', 'Status', 'Message']]
  for (const g of groups) {
    g.entries.forEach((e, n) => e.steps.forEach((s, i) => rows.push([g.name || g.definitionKey || g.definitionId, String(g.version ?? ''), String(g.entries.length - n), e.id, String(i + 1), s.time, stepLabel(s), s.activityType, s.status, s.message])))
  }
  return rows
}
