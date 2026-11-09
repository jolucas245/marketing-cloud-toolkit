// One journey's contacts (feedback #1088, #1089), on the journey's own page:
// - "Is a contact in this journey?": a few contact keys checked against this journey only.
// - Contact paths: every contact's path through the journey in a period, summed per
//   activity and per route and drawn over the canvas.
//
// Both use the Journey Builder calls in contactJourneys.js: contactMembership (public
// REST) and the journey history search (the call behind Journey Builder's Journey
// History page; body { start, end, contactKeys, journeySearchKey } confirmed live
// 2026-11-02 with one contact key and journeySearchKey ''). NOT confirmed live:
// - whether the search answers with an empty contactKeys list (every contact);
// - nothing else: the search is narrowed to one journey by its entry event's
//   eventDefinitionId (eventIds, as Journey Builder's History panel does; checked live
//   2026-11-09, feedback #1095). journeySearchKey is ignored by Journey Builder and
//   returns every journey's history, so it is never sent alone (feedback #1094).
// History rows carry no version (seen live 2026-11-02); the version comes from the
// row's definitionId when it matches one version's id, else it is unknown.
import { sfmcFetch } from './sfmcApi.js'
import { parseHistoryItem, splitEntries, matchSteps, pathOnGraph, isEntryRow, isExitRow, stepLabel, HISTORY_PAGE_SIZE } from './contactJourneys.js'

const JB = (stack) => `https://jbinteractions.${stack}.marketingcloudapps.com/fuelapi/interaction/v1`

export const PATH_MAX_ROWS = 5000
export const MAX_CHECK_KEYS = 25
export const MEMBERSHIP_BATCH = 50
export const PATH_RANGES = [
  { days: 1, label: 'Last 1 day' },
  { days: 7, label: 'Last 7 days' },
  { days: 30, label: 'Last 30 days' },
]

const lc = (v) => String(v ?? '').trim().toLowerCase()

/** Contact keys typed or pasted: one per line, or separated by commas, semicolons or tabs. Duplicates dropped. */
export function parseContactKeys(text) {
  const seen = new Set()
  const out = []
  for (const part of String(text || '').split(/[\n\r,;\t]+/)) {
    const k = part.trim()
    if (k && !seen.has(k)) { seen.add(k); out.push(k) }
  }
  return out
}

/** { start, end } as ISO strings for the last `days` days, or for a custom from/to (dates as yyyy-mm-dd, to inclusive). */
export function periodRange({ days = 7, from = '', to = '', now = new Date() } = {}) {
  if (from || to) {
    const end = to ? new Date(`${to}T23:59:59.999`) : new Date(now)
    const start = from ? new Date(`${from}T00:00:00`) : new Date(end.getTime() - 30 * 86400000)
    if (!Number.isFinite(start.getTime()) || !Number.isFinite(end.getTime())) throw new Error('Pick valid dates.')
    if (start > end) throw new Error('The start date is after the end date.')
    return { start: start.toISOString(), end: end.toISOString() }
  }
  const end = new Date(now)
  return { start: new Date(end.getTime() - days * 86400000).toISOString(), end: end.toISOString() }
}

/**
 * Which history rows and memberships belong to this journey, across its versions.
 * `journey` is the opened definition; `versions` the version list (items of the
 * interactions search), when known.
 */
export function journeyMatcher(journey, versions = []) {
  const ids = new Set()
  const keys = new Set()
  const versionById = new Map()
  for (const v of [journey, ...versions]) {
    if (!v) continue
    if (v.id) ids.add(lc(v.id))
    if (v.definitionId) ids.add(lc(v.definitionId))
    if (v.key) keys.add(lc(v.key))
  }
  // A definitionId names one version; `id` can be shared by every version, so it only
  // gives a version when no other version has the same id.
  const idCount = new Map()
  for (const v of versions) if (v?.id) idCount.set(lc(v.id), (idCount.get(lc(v.id)) || 0) + 1)
  for (const v of versions) {
    if (v?.definitionId) versionById.set(lc(v.definitionId), v.version)
    if (v?.id && idCount.get(lc(v.id)) === 1 && !versionById.has(lc(v.id))) versionById.set(lc(v.id), v.version)
  }
  if (journey?.definitionId && journey.version != null && !versionById.has(lc(journey.definitionId))) versionById.set(lc(journey.definitionId), journey.version)
  const name = lc(journey?.name)
  // Activity names of the opened version, for rows that carry only an id or key.
  const actNames = new Map()
  for (const a of journey?.activities || []) {
    if (!a?.name) continue
    if (a.id) actNames.set(lc(a.id), a.name)
    if (a.key) actNames.set(lc(a.key), a.name)
  }
  return {
    row(r) {
      if (r.definitionId && ids.has(lc(r.definitionId))) return true
      if (r.definitionKey && keys.has(lc(r.definitionKey))) return true
      if (!r.definitionId && !r.definitionKey) return Boolean(name) && lc(r.journeyName) === name
      return false
    },
    membership: (m) => keys.has(lc(m.definitionKey)),
    versionOf: (r) => versionById.get(lc(r.definitionId)) ?? r.version ?? null,
    activityName: (r) => actNames.get(lc(r.activityId)) || actNames.get(lc(r.activityKey)) || '',
  }
}

/** contactMembership for many keys: up to 50 per call (the public endpoint's list). */
export async function fetchMembershipMany(stack, keys, fetcher = sfmcFetch) {
  const memberships = []
  const errors = []
  for (let i = 0; i < keys.length; i += MEMBERSHIP_BATCH) {
    const batch = keys.slice(i, i + MEMBERSHIP_BATCH)
    const data = await fetcher(`${JB(stack)}/interactions/contactMembership`, 'POST', { ContactKeyList: batch })
    const list = data?.results?.contactMemberships || data?.contactMemberships || []
    errors.push(...(data?.results?.contactMembershipErrors || data?.contactMembershipErrors || []))
    for (const m of list) {
      memberships.push({
        contactKey: String(m.contactKey ?? m.ContactKey ?? (batch.length === 1 ? batch[0] : '')),
        definitionKey: m.definitionKey ?? m.DefinitionKey ?? '',
        version: m.version ?? m.Version ?? null,
      })
    }
  }
  return { memberships, errors }
}

/**
 * One contact key's place in this journey: in it now (and which versions), and its
 * newest entry in the history period: when it entered, the last step and its status,
 * whether it left. `items` are parsed history rows of this contact (any journey).
 */
export function contactInJourney({ contactKey, memberships = [], items = [], matcher }) {
  const inNow = memberships.filter((m) => String(m.contactKey) === String(contactKey) && matcher.membership(m))
  const mine = items.filter((r) => matcher.row(r))
  const entries = splitEntries(mine)
  const latest = entries[0] || null
  const steps = latest?.steps || []
  const last = [...steps].reverse().find((s) => !isEntryRow(s)) || steps[steps.length - 1] || null
  const versions = [...new Set(inNow.map((m) => m.version).filter((v) => v != null))]
  const histVersion = latest ? steps.map((s) => matcher.versionOf(s)).find((v) => v != null) ?? null : null
  return {
    contactKey,
    inNow: inNow.length > 0,
    versions: versions.length ? versions : (histVersion != null ? [histVersion] : []),
    entries: entries.length,
    entered: latest?.first || '',
    lastStep: !last ? '' : (last.activityName || isEntryRow(last) || isExitRow(last) ? stepLabel(last) : (matcher.activityName?.(last) || stepLabel(last))),
    lastStatus: last?.status || '',
    lastTime: last?.time || '',
    left: steps.some(isExitRow),
    failed: latest?.failed || 0,
  }
}

/**
 * The ways the history search is asked for one journey (feedback #1094: an empty
 * journeySearchKey with no other filter searches every journey in the account, which
 * must never happen). The entry event form is what Journey Builder's own History panel
 * sends, and was checked live 2026-11-09: a journey's eventDefinitionId returned only
 * its rows, an unknown one none. `exact` forms are trusted when they find nothing.
 */
export function historySearchForms(journey, versions = []) {
  const ids = [...new Set([journey?.definitionId, ...versions.map((v) => v?.definitionId)].filter(Boolean).map(String))]
  const forms = []
  // What Journey Builder's own Journey History panel sends (seen live 2026-11-09, feedback
  // #1095): the entry event's eventDefinitionId, in lower and upper case, with an empty
  // journeySearchKey. The entry event is the same in every version.
  const events = new Set()
  for (const j of [journey, ...versions]) {
    for (const t of j?.triggers || []) {
      const id = t?.metaData?.eventDefinitionId
      if (id) { events.add(String(id).toLowerCase()); events.add(String(id).toUpperCase()) }
    }
  }
  if (events.size) forms.push({ label: 'entry event', body: { eventIds: [...events], journeySearchKey: '' }, exact: true })
  // Without an entry event (not seen yet): version IDs, checked on their first page.
  // journeySearchKey is not used: Journey Builder ignores it and returns every journey's
  // history (seen live 2026-11-09 with the key and with the name).
  else if (ids.length) forms.push({ label: 'version IDs', body: { definitionIds: ids, journeySearchKey: '' } })
  return forms
}

// A form filters by this journey when its first page holds only (almost only) this
// journey's rows. One stray row in 20 is tolerated.
const FILTERED_SHARE = 0.95

/**
 * Read the journey history for this journey in a period, newest first, at most `max`
 * rows read. Only searches that Journey Builder filters by this journey are read in
 * full (feedback #1094); the whole account's history is never searched.
 * Each form from historySearchForms is tried on one page:
 * - rows, all of this journey: that form filters, so its pages are read;
 * - rows of other journeys: the filter was ignored, next form;
 * - no rows, or refused (4xx other than 401/403): next form.
 * Returns { items, read, total, capped, form } (form: the label used, or '' when no form
 * found any row, meaning nothing ran through the journey in the period).
 * Throws code 'HISTORY_NOT_FILTERED' when Journey Builder answered but filtered by no
 * form, and 'HISTORY_SEARCH_REFUSED' when every form was refused.
 */
export async function fetchJourneyHistory(stack, journey, { start, end, matcher, versions = [], max = PATH_MAX_ROWS, onProgress = () => {}, cancelled = () => false, fetcher = sfmcFetch } = {}) {
  const forms = historySearchForms(journey, versions)
  let refused = 0
  let ignored = 0
  let lastError = null
  for (const form of forms) {
    if (cancelled()) break
    const body = { start, end, contactKeys: [], ...form.body }
    let first
    try {
      first = await readPages(stack, body, { matcher, max: Math.min(HISTORY_PAGE_SIZE, max), onProgress: () => {}, cancelled, fetcher, keepAll: true })
    } catch (e) {
      if (e?.status >= 400 && e?.status < 500 && e.status !== 401 && e.status !== 403) { refused++; lastError = e; continue }
      throw e
    }
    if (!first.seen.length) {
      if (form.exact) return { items: [], read: 0, total: 0, capped: false, form: form.label }
      continue
    }
    const mine = first.seen.filter((r) => matcher.row(r)).length
    if (mine / first.seen.length < FILTERED_SHARE) { ignored++; continue }
    const all = await readPages(stack, body, { matcher, max, onProgress, cancelled, fetcher })
    return { items: all.items, read: all.read, total: all.total, capped: all.capped, form: form.label }
  }
  if (ignored) {
    const err = new Error('Journey Builder did not filter its history by this journey, so nothing was read: the Toolkit does not read every journey\'s history to find this one\'s.')
    err.code = 'HISTORY_NOT_FILTERED'
    throw err
  }
  if (refused && refused === forms.length) {
    const err = new Error(`Journey Builder refused every history search for this journey${lastError ? ` (${lastError.message})` : ''}.`)
    err.code = 'HISTORY_SEARCH_REFUSED'
    err.cause = lastError
    throw err
  }
  return { items: [], read: 0, total: 0, capped: false, form: '' }
}

async function readPages(stack, body, { matcher, max, onProgress, cancelled, fetcher, keepAll = false }) {
  const items = []
  const seen = []
  let read = 0
  let total = null
  let more = false
  for (let page = 1; read < max; page++) {
    if (cancelled()) break
    const size = Math.min(HISTORY_PAGE_SIZE, max - read)
    const params = new URLSearchParams({ $page: String(page), $pageSize: String(HISTORY_PAGE_SIZE), $orderBy: 'TransactionTime desc' })
    const data = await fetcher(`${JB(stack)}/interactions/journeyhistory/search?${params}`, 'POST', body)
    let list = data?.items || data?.entry || (Array.isArray(data) ? data : [])
    total = Number.isFinite(Number(data?.count)) ? Number(data.count) : total
    more = list.length >= HISTORY_PAGE_SIZE && (total == null || read + list.length < total)
    if (list.length > size) { list = list.slice(0, size); more = true }
    read += list.length
    for (const raw of list) {
      const r = parseHistoryItem(raw)
      r.contactKey = String(raw?.contactKey ?? raw?.ContactKey ?? raw?.subscriberKey ?? raw?.SubscriberKey ?? '')
      if (keepAll) seen.push(r)
      if (matcher.row(r)) items.push(r)
    }
    onProgress({ read, total, kept: items.length })
    if (!more) break
  }
  return { items, seen, read, total, capped: read >= max && more }
}

/**
 * Every contact's path summed on the canvas graph (journeyGraph). Rows are grouped per
 * contact and entry (definitionInstanceId, else time), each entry's steps matched to the
 * definition's activities (matchSteps) and its route drawn (pathOnGraph). Returns
 * { nodes: Map key → { count, failed }, edges: Map edge index → count, entries, contacts,
 *   exited, failed, unmatched, maxNode, maxEdge }.
 * Counts are entries (one contact entering twice counts twice), not rows.
 */
export function aggregatePaths(def, graph, items) {
  const byContact = new Map()
  for (const r of items) {
    const k = r.contactKey || ''
    if (!byContact.has(k)) byContact.set(k, [])
    byContact.get(k).push(r)
  }
  const nodes = new Map()
  const edges = new Map()
  let entries = 0, exited = 0, failed = 0, unmatched = 0
  const bump = (m, k, field) => {
    if (field) { const v = m.get(k) || { count: 0, failed: 0 }; v[field]++; m.set(k, v) } else m.set(k, (m.get(k) || 0) + 1)
  }
  for (const rows of byContact.values()) {
    for (const entry of splitEntries(rows)) {
      entries++
      const { keys, unmatched: miss, ended } = matchSteps(def, entry.steps)
      unmatched += miss.length
      if (ended) exited++
      const path = keys.length ? pathOnGraph(graph, keys, { ended }) : { nodes: new Set(['__entry']), edges: new Set() }
      for (const k of path.nodes) bump(nodes, k, 'count')
      for (const i of path.edges) bump(edges, i)
      // Failed rows on an activity: its node gets the count once per entry.
      const failedKeys = new Set()
      for (const s of entry.steps) {
        if (!/fail|error/i.test(s.status) || isEntryRow(s)) continue
        const k = matchSteps(def, [s]).keys[0]
        if (k) failedKeys.add(k)
      }
      for (const k of failedKeys) bump(nodes, k, 'failed')
      if (entry.failed) failed++
    }
  }
  const maxNode = Math.max(0, ...[...nodes.values()].map((v) => v.count))
  const maxEdge = Math.max(0, ...edges.values())
  return { nodes, edges, entries, contacts: byContact.size, exited, failed, unmatched, maxNode, maxEdge }
}

/** Per-activity rows for the table and the CSV: name, type, contacts reached, failed. */
export function pathRows(graph, agg) {
  return graph.nodes
    .filter((n) => !n.key.startsWith('__exit'))
    .map((n) => ({ key: n.key, name: n.name || n.key, type: n.type || '', count: agg.nodes.get(n.key)?.count || 0, failed: agg.nodes.get(n.key)?.failed || 0 }))
}

const sqlText = (s) => `'${String(s).replace(/'/g, "''")}'`

/**
 * Data-view counts when the history cannot be read for the whole journey: email sends
 * per journey activity and version in the period, from _Sent joined to
 * _JourneyActivity and _Journey. Email steps only; it shows no route.
 */
export function journeySendCountsSql(journeyName, days = 30) {
  return `SELECT j.VersionNumber, ja.ActivityName, COUNT(*) AS Sends, COUNT(DISTINCT s.SubscriberKey) AS Contacts
FROM _Sent s
INNER JOIN _JourneyActivity ja ON ja.JourneyActivityObjectID = s.TriggererSendDefinitionObjectID
INNER JOIN _Journey j ON j.VersionID = ja.VersionID
WHERE j.JourneyName = ${sqlText(journeyName)}
AND s.EventDate >= DATEADD(DAY, -${Math.max(1, Math.round(Number(days) || 30))}, GETDATE())
GROUP BY j.VersionNumber, ja.ActivityName
ORDER BY j.VersionNumber DESC, Sends DESC`
}
