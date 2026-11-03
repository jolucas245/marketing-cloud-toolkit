// Email validation with SFMC's REST endpoint POST /address/v1/validateEmail
// (body { email, validators }, answer { email, valid, failedValidation? }). One call
// per address. Sources: one address, a pasted or uploaded list, contacts found by
// Contact Key, or a data extension column. For a data extension the results go into
// three columns of that DE (upsert by primary key) or into a new DE.
//
// Checked live 2026-11-02 (through mc.<stack>.exacttarget.com/cloud/fuelapi): answers
// { email, valid, failedValidation } with one failed validator even when several fail, and
// not in the order sent (a domain with no mail server came back as ListDetectiveValidator
// with all three picked, MXValidator alone). How SFMC counts the calls against API limits: unknown.
import { sfmcFetch, createTargetDE, insertDERowsAsync, upsertDERowsAsync, searchDEsAllSources } from './sfmcApi.js'

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

/** Fields for a new results DE: the source's primary keys (as Text), the email, and the three results. */
export function newDEFields(sourceFields = [], emailField) {
  const keys = sourceFields.filter((f) => f.isPrimaryKey && f.name !== emailField)
  const out = keys.map((f) => ({ name: f.name, type: 'Text', length: Math.min(Math.max(fieldLength(f) || 254, 50), 4000), isNullable: true }))
  out.push({ name: emailField || 'Email', type: 'Text', length: 254, isNullable: true })
  out.push({ name: 'isValidEmail', type: 'Boolean', isNullable: true })
  out.push({ name: 'invalidReason', type: 'Text', length: 500, isNullable: true })
  out.push({ name: 'APIresponse', type: 'Text', length: RESPONSE_MAX, isNullable: true })
  return out
}

/** One row to write for a result: in place (keys + the 3 mapped fields) or for the new DE. */
export function rowForResult(r, sourceRow, { mode, keyFields = [], emailField, mapping, fieldsByName = {} }) {
  const row = {}
  for (const k of keyFields) row[k] = sourceRow?.[k] ?? ''
  if (mode === 'inplace') {
    const v = resultValues(r, { reason: fieldsByName[mapping.invalidReason], response: fieldsByName[mapping.APIresponse] })
    // An empty Boolean is refused; leave a not-checked row's flag unset.
    if (v.valid !== '') row[mapping.isValidEmail] = v.valid
    row[mapping.invalidReason] = v.reason
    row[mapping.APIresponse] = v.response
  } else {
    const v = resultValues(r, { reason: { type: 'Text', length: 500 }, response: { type: 'Text', length: RESPONSE_MAX } })
    row[emailField || 'Email'] = r.email
    if (v.valid !== '') row.isValidEmail = v.valid
    row.invalidReason = v.reason
    row.APIresponse = v.response
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

/** Makes the new results DE. Returns { id, key, name }. */
export async function createResultsDE(stack, { name, categoryID, fields }, api = { createTargetDE }) {
  const made = await api.createTargetDE(stack, { name, categoryID, fields: toBuildFields(fields) })
  return { id: made.id, key: made.customerKey, name }
}

// createTargetDE takes fields already shaped by buildDEFields (numeric types).
const TYPE_NUM = { Text: 0, Number: 1, Date: 2, Boolean: 3, EmailAddress: 4, Phone: 5, Decimal: 6, Locale: 7 }
function toBuildFields(fields) {
  return fields.map((f, i) => {
    const type = TYPE_NUM[f.type] ?? 0
    const field = {
      name: f.name, ordinal: i, type, scale: 0, isPrimaryKey: false, isTemplateField: false, isHidden: false,
      isReadOnly: false, isOverridable: false, isInheritable: false, updatable: true, retrievable: true,
      isActive: true, mustOverride: false, isNullable: true,
    }
    if (type === 0) field.length = f.length || 254
    return field
  })
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
