// Content > Changes (feedback #1087): what was created or modified in a period, and by
// whom, across Content Builder assets, automations and journeys. Read only.
//
// Content Builder: one asset query for every asset type, the date filtered by SFMC
// (modifiedDate / createdDate greaterThan), newest first, 50 a page up to a cap. The
// person is matched here: Content Builder is assumed to send createdBy / modifiedBy as
// objects ({ id, email, name, userId }); that shape and server-side filtering on them
// were not checked against a live org.
// Automations and journeys: their list calls, dates filtered here. Journeys only carry
// user IDs in createdBy / modifiedBy (see journeyApi.js), so the person filter matches
// their IDs, not names. Automation rows name the saver only if SFMC sends a name field
// (the field names below are guesses).
import { sfmcFetch } from './sfmcApi.js'
import { EMAIL_ASSET_TYPE_IDS } from './contentEmails.js'
import { CLOUD_PAGE_ASSET_TYPE_IDS } from './savedAssets.js'
import { searchAutomations, loadMoreAutomations } from './automationApi.js'
import { searchJourneys, JOURNEY_PAGE_SIZE } from './journeys.js'
import { csvQuote } from './queryCsv.js'

export const CHANGE_PAGE_SIZE = 50
export const MAX_ASSET_PAGES = 20 // 1,000 assets
export const MAX_LIST_ITEMS = 2000 // automations, journey versions
export const PERIODS = [1, 7, 30, 90]
export const WHAT = ['modified', 'created', 'both']
const CB = (stack) => `https://content-builder.${stack}.marketingcloudapps.com/fuelapi`
const ASSET_FIELDS = ['id', 'name', 'customerKey', 'assetType', 'category', 'createdDate', 'createdBy', 'modifiedDate', 'modifiedBy', 'status']
const DAY = 86400000

const time = (v) => { const t = Date.parse(v || ''); return Number.isNaN(t) ? null : t }

/**
 * The start of the period as a Date: `days` back from now, or local midnight of the
 * custom `from` date (YYYY-MM-DD). Null when neither gives a date.
 */
export function cutoffDate({ days = null, from = '' } = {}, now = new Date()) {
  if (from) {
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(from))
    if (!m) return null
    return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]))
  }
  const n = Number(days)
  return Number.isFinite(n) && n > 0 ? new Date(now.getTime() - n * DAY) : null
}

const dateLeaf = (property, since) => ({ property, simpleOperator: 'greaterThan', value: since })

/** Content Builder asset query body: every asset type changed after `since`. */
export function assetChangesBody({ since, what = 'modified', page = 1, pageSize = CHANGE_PAGE_SIZE }) {
  const value = since instanceof Date ? since.toISOString() : String(since)
  const query = what === 'created' ? dateLeaf('createdDate', value)
    : what === 'both' ? { leftOperand: dateLeaf('modifiedDate', value), logicalOperator: 'OR', rightOperand: dateLeaf('createdDate', value) }
      : dateLeaf('modifiedDate', value)
  const sortBy = what === 'created' ? 'createdDate' : 'modifiedDate'
  return { page: { page, pageSize }, query, sort: [{ property: sortBy, direction: 'DESC' }], fields: ASSET_FIELDS }
}

/**
 * A person from whatever SFMC sends: an object ({ id, email, name, userId }), a name,
 * or a bare user ID (a number or GUID-like value). Null when empty.
 */
export function toPerson(v, nameHint = '') {
  if (v == null || v === '') return nameHint ? { id: '', name: String(nameHint), email: '' } : null
  if (typeof v === 'object') {
    const id = v.id ?? v.userId ?? v.employeeId ?? ''
    const name = v.name || v.displayName || nameHint || ''
    const email = v.email || ''
    if (id === '' && !name && !email) return null
    return { id: String(id), name: String(name), email: String(email) }
  }
  const s = String(v)
  const looksLikeId = /^\d+$/.test(s) || /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s)
  if (looksLikeId) return { id: s, name: nameHint ? String(nameHint) : '', email: '' }
  return { id: '', name: s, email: '' }
}

/** How a person reads in the table: name, else email, else "User ID n". */
export function personLabel(p) {
  if (!p) return ''
  return p.name || p.email || (p.id ? `User ID ${p.id}` : '')
}

/** A stable key for the people dropdown. */
export function personKey(p) {
  if (!p) return ''
  if (p.email) return `email:${p.email.toLowerCase()}`
  if (p.name) return `name:${p.name.toLowerCase()}`
  return p.id ? `id:${p.id}` : ''
}

const inIds = (ids, id) => ids.includes(Number(id))

/** Where an asset opens in the Toolkit: emails and CloudPages have a page, others none. */
export function assetOpen(a) {
  const typeId = Number(a?.assetType?.id)
  if (inIds(EMAIL_ASSET_TYPE_IDS, typeId)) return { path: '/emails', query: { q: a.customerKey || a.name || '' } }
  if (inIds(CLOUD_PAGE_ASSET_TYPE_IDS, typeId)) return { path: '/cloudpages', query: { q: a.name || '' } }
  return null
}

/** One table row for a Content Builder asset. */
export function assetRow(a) {
  return {
    key: `asset:${a.id}`,
    source: 'contentBuilder',
    type: a.assetType?.displayName || a.assetType?.name || 'Asset',
    name: a.name || '',
    folder: a.category?.name || '',
    createdDate: a.createdDate || null,
    createdBy: toPerson(a.createdBy),
    modifiedDate: a.modifiedDate || null,
    modifiedBy: toPerson(a.modifiedBy),
    open: assetOpen(a),
  }
}

// Automation list rows: the saver's name, if any of these fields is sent (guessed, not
// seen live; the grid view may send none, then the column stays empty).
const firstText = (o, keys) => keys.map((k) => o?.[k]).find((v) => typeof v === 'string' && v.trim()) || ''

/** One table row for an automation (Automation Studio list entry). */
export function automationRow(a) {
  const modName = firstText(a, ['modifiedByName', 'lastSavedByName', 'updatedByName'])
  const createdName = firstText(a, ['createdByName'])
  return {
    key: `automation:${a.id}`,
    source: 'automations',
    type: 'Automation',
    name: a.name || '',
    folder: '',
    createdDate: a.createdDate || null,
    createdBy: toPerson(a.createdBy, createdName),
    modifiedDate: a.modifiedDate ?? a.lastSavedDate ?? a.updatedDate ?? null,
    modifiedBy: toPerson(a.modifiedBy ?? a.lastSavedBy ?? a.updatedBy, modName),
    open: a.id ? { path: `/automations/${encodeURIComponent(a.id)}` } : null,
  }
}

/** One table row for a journey version. createdBy / modifiedBy are user IDs. */
export function journeyRow(j) {
  return {
    key: `journey:${j.id}:${j.version ?? ''}`,
    source: 'journeys',
    type: j.version != null ? `Journey (version ${j.version})` : 'Journey',
    name: j.name || '',
    folder: '',
    createdDate: j.createdDate || null,
    createdBy: toPerson(j.createdBy),
    modifiedDate: j.modifiedDate || null,
    modifiedBy: toPerson(j.modifiedBy),
    open: j.id ? { path: `/journeys/${encodeURIComponent(j.id)}`, ...(j.version != null ? { query: { version: String(j.version) } } : {}) } : null,
  }
}

/** Whether a row's dates fall in the period for what changed. */
export function inPeriod(row, cutoff, what = 'modified') {
  const limit = cutoff instanceof Date ? cutoff.getTime() : time(cutoff)
  if (limit == null) return true
  const after = (v) => { const t = time(v); return t != null && t >= limit }
  if (what === 'created') return after(row.createdDate)
  if (what === 'both') return after(row.createdDate) || after(row.modifiedDate)
  return after(row.modifiedDate)
}

/** The people a row is matched on for what changed. */
export function rowPeople(row, what = 'modified') {
  const list = what === 'created' ? [row.createdBy] : what === 'both' ? [row.createdBy, row.modifiedBy] : [row.modifiedBy]
  return list.filter(Boolean)
}

/**
 * Whether a row matches the person filter: `text` (case-insensitive, contained in the
 * name, email or user ID) and `key` (one person picked from the list). Empty filters match.
 */
export function matchesPerson(row, { text = '', key = '' } = {}, what = 'modified') {
  const people = rowPeople(row, what)
  const t = String(text || '').trim().toLowerCase()
  if (t && !people.some((p) => [p.name, p.email, p.id].some((v) => String(v || '').toLowerCase().includes(t)))) return false
  if (key && !people.some((p) => personKey(p) === key)) return false
  return true
}

/** Distinct people in the rows for what changed, by label: [{ key, label }]. */
export function distinctPeople(rows, what = 'modified') {
  const seen = new Map()
  for (const r of rows) {
    for (const p of rowPeople(r, what)) {
      const k = personKey(p)
      if (!k || seen.has(k)) continue
      const label = p.name && p.email ? `${p.name} (${p.email})` : personLabel(p)
      seen.set(k, { key: k, label })
    }
  }
  return [...seen.values()].sort((a, b) => a.label.localeCompare(b.label))
}

/**
 * Content Builder assets changed in the period, 50 a page up to `maxPages`.
 * Returns { rows, total, capped }. onProgress(loaded, total).
 */
export async function loadAssetChanges(stack, { since, what = 'modified', maxPages = MAX_ASSET_PAGES, onProgress = () => {}, fetch = sfmcFetch } = {}) {
  const rows = []
  let total = null
  let capped = false
  for (let page = 1; page <= maxPages; page++) {
    const d = await fetch(`${CB(stack)}/asset/v1/content/assets/query`, 'POST', assetChangesBody({ since, what, page }))
    const items = d?.items || []
    total = d?.count ?? total
    rows.push(...items.map(assetRow))
    onProgress(rows.length, total)
    if (items.length < CHANGE_PAGE_SIZE) break
    if (page === maxPages) capped = true
  }
  return { rows, total: total ?? rows.length, capped }
}

/**
 * Automations changed in the period: the Automation Studio list (up to 2,000), dates
 * filtered here. Returns { rows, total, capped }.
 */
export async function loadAutomationChanges(stack, { since, what = 'modified', onProgress = () => {}, search = searchAutomations, more = loadMoreAutomations } = {}) {
  const first = await search(stack, '', 0)
  let items = first.entries || []
  let total = first.total ?? items.length
  onProgress(items.length, total)
  while (items.length < Math.min(total, MAX_LIST_ITEMS)) {
    const r = await more(stack, '', items)
    if (!r.entries?.length) break
    items = items.concat(r.entries)
    total = r.total ?? total
    onProgress(items.length, total)
  }
  const rows = items.map(automationRow).filter((r) => inPeriod(r, since, what))
  return { rows, total: rows.length, capped: total > items.length }
}

/**
 * Journey versions changed in the period (every version, so a new draft of a
 * published journey shows). The list is sorted newest change first, so for Modified
 * reading stops at a page holding an older version. Returns { rows, total, capped }.
 */
export async function loadJourneyChanges(stack, { since, what = 'modified', onProgress = () => {}, search = searchJourneys } = {}) {
  const limit = since instanceof Date ? since.getTime() : time(since)
  const items = []
  let capped = false
  for (let page = 1; ; page++) {
    const r = await search(stack, { page, allVersions: true })
    const got = r.items || []
    items.push(...got)
    onProgress(items.length, r.total ?? null)
    if (got.length < JOURNEY_PAGE_SIZE) break
    if (what === 'modified' && limit != null && got.some((j) => (time(j.modifiedDate) ?? Infinity) < limit)) break
    if (items.length >= MAX_LIST_ITEMS) { capped = true; break }
  }
  const rows = items.map(journeyRow).filter((r) => inPeriod(r, since, what))
  return { rows, total: rows.length, capped }
}

/** The date the table sorts by first for what changed. */
export const sortDate = (row, what = 'modified') => (what === 'created' ? row.createdDate : row.modifiedDate ?? row.createdDate)

/** Every row newest first, by the date for what changed. */
export function sortChanges(rows, what = 'modified') {
  return [...rows].sort((a, b) => (time(sortDate(b, what)) ?? 0) - (time(sortDate(a, what)) ?? 0))
}

export const CSV_COLUMNS = ['Type', 'Name', 'Folder', 'Created', 'Created by', 'Modified', 'Modified by']
const csvPerson = (p) => (p ? [personLabel(p), p.email && p.name ? p.email : ''].filter(Boolean).join(' ') : '')

/** The rows as CSV (dates as SFMC sent them). */
export function changesCsv(rows) {
  const lines = [CSV_COLUMNS.map(csvQuote).join(',')]
  for (const r of rows) {
    lines.push([r.type, r.name, r.folder, r.createdDate || '', csvPerson(r.createdBy), r.modifiedDate || '', csvPerson(r.modifiedBy)].map(csvQuote).join(','))
  }
  return lines.join('\r\n')
}
