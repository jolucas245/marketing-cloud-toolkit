// Email validation with SFMC's REST endpoint POST /address/v1/validateEmail
// (body { email, validators }, answer { email, valid, failedValidation? }). One call
// per address. Sources: one address, a pasted or uploaded list, contacts found by
// Contact Key, or a data extension column. For a data extension the results go into
// three columns of that DE (upsert by primary key) or into a new DE that copies the
// source's fields, settings and rows and adds the three result fields (feedback #1090).
//
// Checked live 2026-11-02 (through mc.<stack>.exacttarget.com/cloud/fuelapi): answers
// { email, valid, failedValidation } with one failed validator even when several fail, and
// not in the order sent (a domain with no mail server came back as ListDetectiveValidator
// with all three picked, MXValidator alone). How SFMC counts the calls against API limits: unknown.
import { sfmcFetch, insertDERowsAsync, upsertDERowsAsync, searchDEsAllSources } from './sfmcApi.js'
import { createDE, fieldProblem, SEND_FIELD_TYPES } from './createDE/createDE.js'
import { toCreateField, fieldsInOrder, copySettings } from './deReorder.js'

const AS_BASE = (stack) => `https://mc.${stack}.exacttarget.com/cloud/fuelapi`

export const VALIDATORS = [
  { id: 'SyntaxValidator', label: 'Syntax', detail: 'the address is written correctly' },
  { id: 'MXValidator', label: 'Mail server', detail: 'the domain has a mail server (MX record)' },
  { id: 'ListDetectiveValidator', label: 'List Detective', detail: 'not on SFMC\'s list of known bad, role or spam-trap addresses' },
]
export const DEFAULT_VALIDATORS = VALIDATORS.map((v) => v.id)

export const RESULT_COLUMNS = ['isValidEmail', 'invalidReason', 'APIresponse']
export const MAX_BULK = 5000
export const MAX_DE_ROWS = 50000
export const RESPONSE_MAX = 4000
export const WRITE_BATCH = 500

const REASONS = {
  SyntaxValidator: 'Syntax: the address is not written correctly',
  MXValidator: 'Mail server: the domain has no mail server (MX record)',
  ListDetectiveValidator: 'List Detective: SFMC treats this address as known bad, a role address, a spam trap or a domain that takes no mail',
}

/** A readable reason for a failed validation, keeping the validator's name. */
export function reasonFor(failedValidation) {
  if (!failedValidation) return ''
  return REASONS[failedValidation] || String(failedValidation)
}

/** Addresses from pasted text or a file: one per line, or separated by commas, semicolons, tabs or spaces. Duplicates (ignoring case) removed. */
export function parseEmailList(text, max = MAX_BULK) {
  const seen = new Set()
  const emails = []
  for (const raw of String(text || '').split(/[\r\n,;\t ]+/)) {
    const e = raw.trim().replace(/^["'<(]+|[>"')]+$/g, '').trim()
    if (!e) continue
    const k = e.toLowerCase()
    if (seen.has(k)) continue
    seen.add(k)
    emails.push(e)
  }
  return { emails: emails.slice(0, max), skipped: Math.max(0, emails.length - max) }
}

/** The result of one call as { email, valid, reason, failedValidation, response, error }. */
export function toResult(email, data, error = null) {
  if (error) {
    const msg = error.message || String(error)
    return { email, valid: null, reason: `Not checked: ${msg}`, failedValidation: '', response: JSON.stringify({ error: msg }), error: msg }
  }
  const valid = data?.valid === true || data?.valid === 'true' || data?.isValid === true
  const failed = data?.failedValidation || data?.failedValidators || ''
  return {
    email,
    valid,
    reason: valid ? '' : (reasonFor(failed) || 'Not valid (SFMC gave no reason)'),
    failedValidation: failed ? String(failed) : '',
    response: JSON.stringify(data ?? null),
    error: null,
  }
}

export async function validateEmail(stack, email, validators = DEFAULT_VALIDATORS, fetcher = sfmcFetch) {
  return fetcher(`${AS_BASE(stack)}/address/v1/validateEmail`, 'POST', { email, validators })
}

/**
 * Validates `emails` `limit` at a time. An empty value is not sent (reason "No email address").
 * `onResult(result, index)` gets each one as it lands; `shouldStop()` ends it early.
 * Returns the results in the input order (undefined where stopped before reaching it).
 */
export async function validateMany(stack, emails, { validators = DEFAULT_VALIDATORS, limit = 4, onResult, shouldStop = () => false, fetcher = sfmcFetch } = {}) {
  const out = new Array(emails.length)
  let next = 0
  async function worker() {
    while (next < emails.length && !shouldStop()) {
      const i = next++
      const email = String(emails[i] ?? '').trim()
      let r
      if (!email) r = { email, valid: false, reason: 'No email address', failedValidation: '', response: '', error: null }
      else {
        try { r = toResult(email, await validateEmail(stack, email, validators, fetcher)) }
        catch (e) { r = toResult(email, null, e) }
      }
      out[i] = r
      onResult?.(r, i)
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, emails.length) }, worker))
  return out
}

/** Email-like values from a contact found by Contact Builder's search (parseContacts in contactsApi.js). */
export function contactEmails(contact) {
  const out = []
  const seen = new Set()
  for (const v of contact?.values || []) {
    const val = String(v.value || '').trim()
    if (!/^[^\s@]+@[^\s@]+$/.test(val)) continue
    // Formulas and AMPscript-style defaults Contact Builder stores as text, such as
    // UserNameLC = {toLower(@EmailAddress)} (feedback #1022): not an address.
    if (/[{}()]/.test(val) || /^@|@[^.]*$/.test(val)) continue
    if (seen.has(val.toLowerCase())) continue
    seen.add(val.toLowerCase())
    out.push({ email: val, attribute: [v.set, v.name].filter(Boolean).join(' > ') })
  }
  return out
}

/** The field most likely to hold the address: an EmailAddress field, else a name with "email". */
export function guessEmailField(fields = []) {
  return fields.find((f) => f.type === 'EmailAddress' || f.type === 4 || f.fieldType === 'EmailAddress')?.name
    || fields.find((f) => /^e-?mail(address)?$/i.test(f.name))?.name
    || fields.find((f) => /e-?mail/i.test(f.name))?.name
    || ''
}

/** The DE's fields to use for the three results, matched by name (any case, spaces and underscores ignored). */
export function guessResultFields(fields = []) {
  const norm = (s) => String(s || '').toLowerCase().replace(/[\s_-]/g, '')
  const find = (...names) => fields.find((f) => names.includes(norm(f.name)))?.name || ''
  return {
    isValidEmail: find('isvalidemail', 'isvalid', 'validemail', 'emailvalid'),
    invalidReason: find('invalidreason', 'reason', 'invalidemailreason'),
    APIresponse: find('apiresponse', 'response', 'validationresponse'),
  }
}

const fieldLength = (f) => Number(f?.length ?? f?.maxLength ?? 0) || null
const isTextLike = (f) => f && (f.type === 'Text' || f.type === 0 || f.type == null)

/** Values for the three result columns, cut to the target fields' lengths. */
export function resultValues(r, fieldsByName = {}) {
  const cut = (v, name, fallback) => {
    const f = fieldsByName[name]
    const max = (f && isTextLike(f) && fieldLength(f)) || fallback
    const s = String(v ?? '')
    return max && s.length > max ? s.slice(0, max) : s
  }
  return {
    valid: r.valid == null ? '' : r.valid ? 'true' : 'false',
    reason: cut(r.reason, 'reason', 4000),
    response: cut(r.response, 'response', RESPONSE_MAX),
  }
}

/**
 * Checks before writing into the source DE: it needs a primary key (rows are
 * matched by it) and three different target fields that are not the key or the email field.
 */
export function checkInPlace({ fields = [], emailField, mapping }) {
  const keys = fields.filter((f) => f.isPrimaryKey).map((f) => f.name)
  if (!keys.length) return 'This data extension has no primary key, so the Toolkit cannot match each result to its row. Choose "New data extension" instead, or add a primary key in Contact Builder.'
  const picked = RESULT_COLUMNS.map((c) => mapping?.[c])
  if (picked.some((n) => !n)) return 'Pick a field for each of the three results.'
  if (new Set(picked).size !== picked.length) return 'Pick three different fields.'
  if (picked.some((n) => keys.includes(n))) return 'A result cannot go into a primary key field.'
  if (picked.includes(emailField)) return 'A result cannot go into the email field itself.'
  return ''
}

// The three result fields of a new DE (feedback #1090): types and lengths.
export const RESULT_FIELD_DEFS = [
  { id: 'isValidEmail', type: 'Boolean' },
  { id: 'invalidReason', type: 'Text', length: 500 },
  { id: 'APIresponse', type: 'Text', length: RESPONSE_MAX },
]

/**
 * Names for the three result fields that do not clash (ignoring case) with the source's
 * fields: isValidEmail, else isValidEmail_2, _3, ... Returns { names, renamed: [{ from, to }] }.
 */
export function resultFieldNames(sourceFields = []) {
  const taken = new Set(sourceFields.map((f) => String(f.name || '').toLowerCase()))
  const names = {}
  const renamed = []
  for (const { id } of RESULT_FIELD_DEFS) {
    let n = id
    for (let i = 2; taken.has(n.toLowerCase()); i++) n = `${id}_${i}`
    taken.add(n.toLowerCase())
    names[id] = n
    if (n !== id) renamed.push({ from: id, to: n })
  }
  return { names, renamed }
}

/**
 * The new DE's fields (feedback #1090): every source field as it is (name, type, length,
 * scale, primary key, required, default; in the DE's own order), then the three result
 * fields. A default value Create DE would refuse is left out and named in `droppedDefaults`.
 * Returns { fields, names, renamed, droppedDefaults }.
 */
export function copyFieldsWithResults(sourceFields = []) {
  const { names, renamed } = resultFieldNames(sourceFields)
  const droppedDefaults = []
  const fields = fieldsInOrder(sourceFields).map((src) => {
    const f = toCreateField(src)
    if ((f.defaultValue || f.currentDate) && /^Default value/.test(fieldProblem(f))) {
      droppedDefaults.push(f.name)
      return { ...f, defaultValue: '', currentDate: false }
    }
    return f
  })
  for (const d of RESULT_FIELD_DEFS) {
    fields.push({ name: names[d.id], type: d.type, length: d.length ?? '', scale: 0, isPrimaryKey: false, isNullable: true, defaultValue: '', currentDate: false })
  }
  return { fields, names, renamed, droppedDefaults }
}

const nameOf = (v) => (v && typeof v === 'object' ? v.name || v.fieldName || '' : String(v ?? '')).trim()

/**
 * Settings for the new DE from the source's record (fetchDEDetail): sendable with the same
 * send relationship field, testable, description; the folder picked on the page (the
 * source's by default). Retention is not copied (a copy should not delete itself).
 * Returns { settings, notes }.
 */
export function copyDESettings(de, detail = {}, { name, folderId, fields = [] } = {}) {
  const base = copySettings(de, detail || {}, name)
  const notes = []
  const wanted = nameOf(detail?.sendableCustomObjectField) || nameOf(detail?.sendableDataExtensionField)
  const field = wanted ? fields.find((f) => String(f.name).toLowerCase() === wanted.toLowerCase()) : null
  const isSendable = !!detail?.isSendable && !!field && SEND_FIELD_TYPES.includes(field.type)
  if (detail?.isSendable && !isSendable) notes.push(wanted ? `The send relationship field "${wanted}" could not be copied, so the new data extension is not sendable.` : 'SFMC did not say which field relates to Subscriber Key, so the new data extension is not sendable.')
  return {
    settings: {
      ...base,
      name: String(name || '').trim(),
      folderId: folderId ?? base.folderId,
      description: String(detail?.description || de?.description || '').slice(0, 400) || `Copy of ${de?.name || 'a data extension'} with email validation results`,
      isSendable,
      sendField: isSendable ? field.name : '',
    },
    notes,
  }
}

/**
 * One row to write for a result: in place (keys + the 3 mapped fields), or for the new
 * DE every source value (empty ones left out, so SFMC applies defaults and does not
 * refuse an empty number or date) plus the results under `names`. `r` null: the row is
 * copied without results (a run stopped before reaching it).
 */
export function rowForResult(r, sourceRow, { mode, keyFields = [], mapping, fieldsByName = {}, copyFields = [], names = {} }) {
  const row = {}
  if (mode === 'inplace') {
    for (const k of keyFields) row[k] = sourceRow?.[k] ?? ''
    const v = resultValues(r, { reason: fieldsByName[mapping.invalidReason], response: fieldsByName[mapping.APIresponse] })
    // An empty Boolean is refused; leave a not-checked row's flag unset.
    if (v.valid !== '') row[mapping.isValidEmail] = v.valid
    row[mapping.invalidReason] = v.reason
    row[mapping.APIresponse] = v.response
  } else {
    for (const f of copyFields) {
      const val = sourceRow?.[f]
      if (val != null && String(val) !== '') row[f] = val
    }
    if (!r) return row
    const v = resultValues(r, { reason: { type: 'Text', length: 500 }, response: { type: 'Text', length: RESPONSE_MAX } })
    if (v.valid !== '') row[names.isValidEmail || 'isValidEmail'] = v.valid
    row[names.invalidReason || 'invalidReason'] = v.reason
    row[names.APIresponse || 'APIresponse'] = v.response
  }
  return row
}

/**
 * Collects rows and sends them WRITE_BATCH at a time (upsert in place, insert for a
 * new DE), so stopping keeps what was already checked. `flush()` sends the rest.
 */
export function createResultWriter(stack, { key, mode }, api = { insertDERowsAsync, upsertDERowsAsync }) {
  const pending = []
  let sent = 0
  let chain = Promise.resolve()
  const send = mode === 'inplace' ? api.upsertDERowsAsync : api.insertDERowsAsync
  const push = (batch) => { chain = chain.then(() => send(stack, key, batch)).then(() => { sent += batch.length }) }
  return {
    add(row) {
      pending.push(row)
      if (pending.length >= WRITE_BATCH) push(pending.splice(0, WRITE_BATCH))
      return chain
    },
    async flush() {
      if (pending.length) push(pending.splice(0))
      await chain
      return sent
    },
    get sent() { return sent },
  }
}

/**
 * Makes the new DE (Create DE's createDE: numeric types, a retry with type names when
 * SFMC refuses a type). Returns { id, key, name }.
 */
export async function createCopyDE(stack, settings, fields, api = { createDE }) {
  const { de } = await api.createDE(stack, settings, fields)
  if (!de?.key) throw new Error(`"${settings.name}" was created, but SFMC did not return its key, so no rows were copied.`)
  return { id: de.id, key: de.key, name: de.name }
}

/** CSV rows for a download of results. */
export function resultsTable(results) {
  return results.filter(Boolean).map((r) => ({
    Email: r.email,
    isValidEmail: r.valid == null ? '' : r.valid ? 'true' : 'false',
    invalidReason: r.reason,
    APIresponse: r.response,
  }))
}

/** Whether a data extension with this name (any case) exists in the business unit. */
export async function deNameTaken(stack, name, search = searchDEsAllSources) {
  const n = String(name || '').trim().toLowerCase()
  if (!n) return false
  const items = (await search(stack, String(name).trim(), 25))?.items || []
  return items.some((d) => String(d.name || '').toLowerCase() === n)
}

/** The first of `base`, `base_2`, `base_3`, ... that is not taken (SFMC refuses a second DE with the same name). */
export async function freeDEName(stack, base, taken = deNameTaken) {
  const b = String(base || '').trim()
  if (!(await taken(stack, b))) return b
  for (let i = 2; i <= 50; i++) {
    const n = `${b.slice(0, 120)}_${i}`
    if (!(await taken(stack, n))) return n
  }
  return `${b.slice(0, 110)}_${Date.now()}`
}

export const isNameClash = (e) => e?.status === 409 || /already exists/i.test(String(e?.message || ''))

// ── Summary (feedback #1091) ──

const CATEGORY_LABELS = {
  SyntaxValidator: 'Syntax: not written correctly',
  MXValidator: 'Mail server: the domain has no mail server',
  ListDetectiveValidator: 'List Detective: known bad, role or spam-trap address',
  empty: 'No email address',
  unknown: 'Not valid, SFMC gave no reason',
}

/** The category of a not-valid result: the failed validator, "empty" or "unknown". */
export function invalidCategory(r) {
  if (r.failedValidation) return String(r.failedValidation)
  if (!String(r.email ?? '').trim()) return 'empty'
  return 'unknown'
}

/** The filter id a result matches: valid, notChecked, or invalid:<category>. */
export function resultMatches(r, filter) {
  if (!filter) return true
  if (filter === 'valid') return r.valid === true
  if (filter === 'notChecked') return r.valid == null
  if (filter === 'invalid') return r.valid === false
  if (filter.startsWith('invalid:')) return r.valid === false && invalidCategory(r) === filter.slice(8)
  return true
}

/**
 * Counts for a run: total, valid, invalid, notChecked, and the not-valid ones split by
 * category ([{ id, label, count }], largest first). Errors are counted per message too
 * (`errors`), so a session problem shows as one line.
 */
export function summarize(results = []) {
  const list = results.filter(Boolean)
  const out = { total: list.length, valid: 0, invalid: 0, notChecked: 0, categories: [], errors: [] }
  const cats = new Map()
  const errs = new Map()
  for (const r of list) {
    if (r.valid === true) out.valid++
    else if (r.valid === false) {
      out.invalid++
      const c = invalidCategory(r)
      cats.set(c, (cats.get(c) || 0) + 1)
    } else {
      out.notChecked++
      const m = String(r.error || r.reason || 'Not checked').replace(/^Not checked: /, '').slice(0, 200)
      errs.set(m, (errs.get(m) || 0) + 1)
    }
  }
  out.categories = [...cats].map(([id, count]) => ({ id, label: CATEGORY_LABELS[id] || reasonFor(id), count })).sort((a, b) => b.count - a.count)
  out.errors = [...errs].map(([message, count]) => ({ message, count })).sort((a, b) => b.count - a.count)
  return out
}

const pct = (n, total) => (total ? `${Math.round((1000 * n) / total) / 10}%` : '0%')

/** The summary as rows for a CSV or table: [{ Group, Count, Share }]. */
export function summaryRows(sum) {
  const rows = [
    { Group: 'Total', Count: sum.total, Share: '100%' },
    { Group: 'Valid', Count: sum.valid, Share: pct(sum.valid, sum.total) },
    { Group: 'Not valid', Count: sum.invalid, Share: pct(sum.invalid, sum.total) },
    ...sum.categories.map((c) => ({ Group: `Not valid: ${c.label}`, Count: c.count, Share: pct(c.count, sum.total) })),
    { Group: 'Not checked (errors)', Count: sum.notChecked, Share: pct(sum.notChecked, sum.total) },
  ]
  return rows
}

/** The summary as plain text (Copy), with no addresses. `title` names the run. */
export function summaryText(sum, title = 'Email validation') {
  const lines = [title, '']
  for (const r of summaryRows(sum)) lines.push(`${r.Group}: ${r.Count.toLocaleString()} (${r.Share})`)
  if (sum.errors.length) {
    lines.push('', 'Not checked, by error:')
    for (const e of sum.errors.slice(0, 10)) lines.push(`- ${e.message}: ${e.count.toLocaleString()}`)
  }
  return lines.join('\n')
}

/** One line for the activity history: counts only. */
export function summaryLine(sum) {
  return `${sum.valid.toLocaleString()} valid, ${sum.invalid.toLocaleString()} not valid${sum.notChecked ? `, ${sum.notChecked.toLocaleString()} not checked` : ''}`
}
