// Remove contacts from a journey (API idea 4; user, 2026-11-11). The one place the
// Toolkit changes journey data in SFMC: the user starts it, reviews it and confirms it
// by typing the number of contacts. Admins can hide it with the `disableJourneyWrites`
// policy.
//
// Journey Builder's public REST calls, on the same host as the other journey calls
// (jbinteractions.<stack>.marketingcloudapps.com/fuelapi). POSTs there carry Journey
// Builder's CSRF token, added by the service worker (background/jbCsrf.js, fetchProxy.js).
// - POST interaction/v1/interactions/contactexit with [{ ContactKey, DefinitionKey, Versions? }],
//   at most 50 items per call. No Versions means every version. SFMC's documentation says
//   the response lists the contacts it could not take ({ errors: [{ ContactKey, ErrorCode,
//   Message }] }) and that the exits happen later, not at once.
// - POST interaction/v1/interactions/contactexit/status with the same items: per contact and
//   version, a status such as Queued or Exited and a message.
// Checked live on s10 (2026-11-11): the exit POST is accepted with Journey Builder's CSRF
// token; status answers [{ contactKey, definitionKey, status: [{ version, message }] }] with
// messages "Exit request received for processing" and "Exit request Cancelled - Contact not
// in this Interaction". Not seen yet: the message for a contact that did exit (the test
// journey's waits do not hold contacts), and the contactexit response body.
import { sfmcFetch } from './sfmcApi.js'
import { isPolicyOn } from './policy.js'

const JB = (stack) => `https://jbinteractions.${stack}.marketingcloudapps.com/fuelapi/interaction/v1`

export const EXIT_BATCH = 50
export const EXIT_MAX_KEYS = 50000
export const EXIT_POLICY = 'disableJourneyWrites'

/** False when the admin policy turns journey changes off. */
export const journeyWritesAllowed = () => !isPolicyOn(EXIT_POLICY)

export const EXIT_STATUS_LABELS = {
  queued: 'Queued',
  exited: 'Exited',
  not_in_journey: 'Not in this journey',
  error: 'Error',
  unknown: 'Unknown',
  not_sent: 'Not sent (stopped)',
}

/** Trimmed, de-duplicated keys in their first order. Returns { keys, duplicates, blank }. */
export function cleanKeys(list) {
  const seen = new Set()
  const keys = []
  let duplicates = 0
  let blank = 0
  for (const raw of list || []) {
    const k = String(raw ?? '').trim()
    if (!k) { blank++; continue }
    if (seen.has(k)) { duplicates++; continue }
    seen.add(k)
    keys.push(k)
  }
  return { keys, duplicates, blank }
}

/** Pasted keys: one per line, or separated by commas, semicolons or tabs. */
export function parsePastedKeys(text) {
  return cleanKeys(String(text || '').split(/[\n\r,;\t]+/))
}

/** A CSV, TSV or plain text file as rows of cells; the delimiter is guessed from the first line. */
export function parseKeyFile(text) {
  const src = String(text || '').replace(/^﻿/, '')
  const first = src.split(/\r?\n/, 1)[0] || ''
  const count = (ch) => first.split(ch).length - 1
  const delim = count('\t') > 0 && count('\t') >= count(',') ? '\t' : count(';') > count(',') ? ';' : ','
  const rows = []
  let row = []
  let field = ''
  let quoted = false
  for (let i = 0; i < src.length; i++) {
    const ch = src[i]
    if (quoted) {
      if (ch === '"' && src[i + 1] === '"') { field += '"'; i++ }
      else if (ch === '"') quoted = false
      else field += ch
    } else if (ch === '"' && field === '') quoted = true
    else if (ch === delim) { row.push(field); field = '' }
    else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && src[i + 1] === '\n') i++
      row.push(field); rows.push(row); row = []; field = ''
    } else field += ch
  }
  if (field || row.length) { row.push(field); rows.push(row) }
  return { rows: rows.filter((r) => r.some((c) => c.trim())), delimiter: delim }
}

const KEY_HEADER = /^(contact|subscriber)[\s_-]*key$/i

/** The first row looks like a header when one of its cells is a key-like column name. */
export function guessHeader(rows) {
  return !!rows?.[0]?.some((c) => KEY_HEADER.test(c.trim()) || /^(id|key|email|e-?mail ?address|contact ?id|subscriber ?id)$/i.test(c.trim()))
}

/** The column to offer first: ContactKey or SubscriberKey when the header has one, else the first. */
export function guessKeyColumn(names) {
  const i = (names || []).findIndex((n) => KEY_HEADER.test(String(n).trim()))
  return i >= 0 ? i : 0
}

/** Keys from one column of a parsed file. */
export function keysFromColumn(rows, column, hasHeader) {
  return cleanKeys((hasHeader ? rows.slice(1) : rows).map((r) => r[column]))
}

/** Request items for the keys: no Versions means every version of the journey. */
export function exitItems(keys, definitionKey, versions = null) {
  const v = Array.isArray(versions) && versions.length ? versions.map(Number).filter(Number.isFinite) : null
  return keys.map((k) => (v?.length ? { ContactKey: k, DefinitionKey: definitionKey, Versions: v } : { ContactKey: k, DefinitionKey: definitionKey }))
}

export function chunk(list, size = EXIT_BATCH) {
  const out = []
  for (let i = 0; i < list.length; i += size) out.push(list.slice(i, i + size))
  return out
}

/** SFMC's status or error text in one of the result kinds. */
export function statusOf(text) {
  const t = String(text ?? '').trim()
  if (!t) return 'unknown'
  if (/not\s*(in|found|present|part of)|notin|no (such )?contact|does not exist|isn'?t in|not a member/i.test(t)) return 'not_in_journey'
  if (/fail|error|invalid|denied|refused|cancel|not allowed|unauthori[sz]ed/i.test(t)) return 'error'
  if (/queue|pending|progress|request|submitted|accepted|scheduled|waiting|processing/i.test(t)) return 'queued'
  if (/exit|complete|removed|success|ejected|done/i.test(t)) return 'exited'
  return 'unknown'
}

const pick = (o, ...names) => {
  for (const n of names) if (o?.[n] != null && o[n] !== '') return o[n]
  return null
}
const keyOf = (o) => pick(o, 'ContactKey', 'contactKey', 'contactkey', 'SubscriberKey', 'subscriberKey')

/**
 * The contactexit response for one batch: every key queued unless SFMC listed it as an
 * error. A key in the errors list whose message says it is not in the journey is
 * marked so; others are errors with SFMC's message.
 */
export function parseExitResponse(keys, data) {
  const errors = data?.errors || data?.Errors || data?.results?.errors || []
  const byKey = new Map()
  for (const e of Array.isArray(errors) ? errors : []) {
    const k = keyOf(e)
    const message = String(pick(e, 'Message', 'message', 'ErrorMessage', 'errorMessage') ?? '')
    const code = pick(e, 'ErrorCode', 'errorCode', 'Code', 'code')
    const text = [message, code != null ? `(code ${code})` : ''].filter(Boolean).join(' ')
    const kind = statusOf(message) === 'not_in_journey' ? 'not_in_journey' : 'error'
    if (k != null) byKey.set(String(k), { status: kind, message: text || 'SFMC refused this contact.' })
  }
  // An error list without keys for a one-key batch belongs to that key.
  if (!byKey.size && keys.length === 1 && Array.isArray(errors) && errors.length) {
    const e = errors[0]
    const message = String(pick(e, 'Message', 'message') ?? 'SFMC refused this contact.')
    byKey.set(keys[0], { status: statusOf(message) === 'not_in_journey' ? 'not_in_journey' : 'error', message })
  }
  return keys.map((k) => ({ contactKey: k, ...(byKey.get(k) || { status: 'queued', message: '' }) }))
}

// When a contact has several versions in the status reply, the row shows the one that
// matters most: still queued, else exited, else an error, else not in the journey.
const RANK = { queued: 5, exited: 4, error: 3, unknown: 2, not_in_journey: 1 }

/**
 * The contactexit/status response: Map of contact key to { status, message, sfmcStatus, versions }.
 * Seen live on s10 (2026-11-11): an array of { contactKey, definitionKey, status: [{ version,
 * message }] }, e.g. message "Exit request Cancelled - Contact not in this Interaction". The
 * status array has one entry per version; the row shows the entry that matters most. Older
 * guesses (status as text, results/items wrappers) are still read.
 */
export function parseStatusResponse(data) {
  const list = data?.results || data?.items || data?.Results || (Array.isArray(data) ? data : [])
  const out = new Map()
  const add = (k, status, message, sfmcStatus, version) => {
    const prev = out.get(k)
    // SFMC keeps one entry per exit request, so a key sent twice lists its version twice
    const versions = [...new Set([...(prev?.versions || []), ...(version != null ? [version] : [])])]
    if (!prev || RANK[status] > RANK[prev.status]) out.set(k, { status, message, sfmcStatus, versions })
    else prev.versions = versions
  }
  for (const r of Array.isArray(list) ? list : []) {
    const k = keyOf(r)
    if (k == null) continue
    const raw = pick(r, 'status', 'Status', 'exitStatus', 'ExitStatus')
    const entries = Array.isArray(raw) ? raw : [{ ...r, status: raw }]
    for (const e of entries) {
      const text = e && typeof e === 'object' ? pick(e, 'status', 'Status', 'state') : e
      const sfmcStatus = text != null && typeof text !== 'object' ? String(text) : ''
      const message = String(pick(e, 'message', 'Message', 'statusMessage', 'StatusMessage') ?? (e === r ? '' : pick(r, 'message', 'Message') ?? ''))
      let status = statusOf(sfmcStatus)
      if (status === 'unknown') status = statusOf(message)
      add(String(k), status, message, sfmcStatus, pick(e, 'version', 'Version', 'versionNumber') ?? pick(r, 'version', 'Version', 'versionNumber'))
    }
  }
  return out
}

/** One contactexit call (at most EXIT_BATCH items). Refused under the admin policy. */
export async function requestExit(stack, items, fetcher = sfmcFetch) {
  if (!journeyWritesAllowed()) throw new Error('Removing contacts from journeys is turned off by your organization\'s policy.')
  if (items.length > EXIT_BATCH) throw new Error(`At most ${EXIT_BATCH} contacts per call.`)
  return fetcher(`${JB(stack)}/interactions/contactexit`, 'POST', items)
}

/** One contactexit/status call for the same items. */
export function fetchExitStatus(stack, items, fetcher = sfmcFetch) {
  return fetcher(`${JB(stack)}/interactions/contactexit/status`, 'POST', items)
}

/** Applies a status reply to result rows (rows with no entry in the reply keep their state). */
export function mergeStatus(rows, statusMap) {
  return rows.map((r) => {
    const s = statusMap.get(r.contactKey)
    if (!s) return r
    return { ...r, status: s.status, message: s.message || r.message, sfmcStatus: s.sfmcStatus, versions: s.versions }
  })
}

/**
 * Removes the keys from the journey, one batch of 50 at a time: the exit call, then a
 * status call for the batch's queued keys. `shouldStop()` is read between batches; keys
 * not sent are returned as not_sent. `onProgress({ done, total, rows })` after each batch.
 * Returns the result rows in key order.
 */
export async function runExit({ stack, keys, definitionKey, versions = null, onProgress = () => {}, shouldStop = () => false, fetcher = sfmcFetch }) {
  if (!definitionKey) throw new Error('This journey has no key, so contacts cannot be removed from it.')
  if (keys.length > EXIT_MAX_KEYS) throw new Error(`At most ${EXIT_MAX_KEYS.toLocaleString('en-US')} contacts at a time.`)
  const rows = []
  const batches = chunk(keys)
  let stopped = false
  for (const batch of batches) {
    if (shouldStop()) { stopped = true; break }
    const items = exitItems(batch, definitionKey, versions)
    let part
    try {
      part = parseExitResponse(batch, await requestExit(stack, items, fetcher))
    } catch (e) {
      part = batch.map((k) => ({ contactKey: k, status: 'error', message: e?.message || String(e) }))
    }
    const queued = part.filter((r) => r.status === 'queued').map((r) => r.contactKey)
    if (queued.length) {
      try {
        part = mergeStatus(part, parseStatusResponse(await fetchExitStatus(stack, exitItems(queued, definitionKey, versions), fetcher)))
      } catch { /* the rows stay queued; Check status again reads it later */ }
    }
    rows.push(...part)
    onProgress({ done: rows.length, total: keys.length, rows: [...rows] })
  }
  const sent = new Set(rows.map((r) => r.contactKey))
  const notSent = keys.filter((k) => !sent.has(k)).map((k) => ({ contactKey: k, status: 'not_sent', message: '' }))
  return { rows: [...rows, ...notSent], stopped }
}

/** Reads the status again for rows that are still queued or unknown, 50 at a time. */
export async function refreshExitStatus({ stack, rows, definitionKey, versions = null, fetcher = sfmcFetch }) {
  const open = rows.filter((r) => r.status === 'queued' || r.status === 'unknown').map((r) => r.contactKey)
  let out = rows
  for (const batch of chunk(open)) out = mergeStatus(out, parseStatusResponse(await fetchExitStatus(stack, exitItems(batch, definitionKey, versions), fetcher)))
  return out
}

export function exitCounts(rows) {
  const c = Object.fromEntries(Object.keys(EXIT_STATUS_LABELS).map((k) => [k, 0]))
  for (const r of rows) c[r.status] = (c[r.status] || 0) + 1
  return c
}

const csvCell = (v) => '"' + String(v == null ? '' : v).replace(/"/g, '""') + '"'

/** Result rows as CSV: Contact Key, Result, SFMC status, Versions, Message. */
export function exitResultsCsv(rows, journeyName = '') {
  const head = ['Contact Key', 'Result', 'SFMC status', 'Versions', 'Message', 'Journey']
  return [head, ...rows.map((r) => [r.contactKey, EXIT_STATUS_LABELS[r.status] || r.status, r.sfmcStatus || '', (r.versions || []).join(' '), r.message || '', journeyName])]
    .map((r) => r.map(csvCell).join(',')).join('\n')
}

/** What the user must type to enable the confirm button: the number of contacts, or the journey name. */
export function confirmMatches(typed, count, journeyName = '') {
  const t = String(typed || '').trim()
  if (!t) return false
  if (t.replace(/[,\s]/g, '') === String(count)) return true
  return !!journeyName && t === String(journeyName).trim()
}
