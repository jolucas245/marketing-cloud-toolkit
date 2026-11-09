// Create DE from an AI's answer (feedback #1084): a prompt to copy into any AI
// assistant, and a reader for the JSON definition it gives back. Nothing is sent by
// the Toolkit: the user copies the prompt out and pastes the answer in.
// The rules in the prompt are the ones fieldProblem and checkCreateForm apply, so a
// definition that follows them passes the page's checks.
import { FIELD_TYPES, MAX_FIELDS, RETENTION_UNITS, blankSettings } from './createDE.js'
import { MAX_SAMPLE_ROWS, cellText } from './sample.js'

const TYPE_IDS = FIELD_TYPES.map((t) => t.id)

// Names an AI may use for a type, lower case, without spaces, dashes or underscores.
const TYPE_ALIASES = {
  text: 'Text', string: 'Text', varchar: 'Text', nvarchar: 'Text', char: 'Text',
  number: 'Number', integer: 'Number', int: 'Number', bigint: 'Number', wholenumber: 'Number',
  decimal: 'Decimal', numeric: 'Decimal', float: 'Decimal', double: 'Decimal', money: 'Decimal', currency: 'Decimal',
  date: 'Date', datetime: 'Date', timestamp: 'Date',
  boolean: 'Boolean', bool: 'Boolean', bit: 'Boolean',
  emailaddress: 'EmailAddress', email: 'EmailAddress',
  phone: 'Phone', phonenumber: 'Phone',
  locale: 'Locale',
}

const RETENTION_MODE_IDS = ['off', 'rows', 'all', 'allAndDE']
const UNIT_BY_NAME = Object.fromEntries(RETENTION_UNITS.map((u) => [u.label, u.id]))

const EXAMPLE = {
  dataExtension: {
    name: 'Customer_Orders',
    description: 'One row per order, for order confirmation sends',
    isSendable: true,
    sendField: 'SubscriberKey',
    isTestable: false,
    retention: { mode: 'off', length: 30, unit: 'days' },
  },
  fields: [
    { name: 'OrderID', type: 'Text', length: 50, primaryKey: true, required: true },
    { name: 'SubscriberKey', type: 'Text', length: 254, required: true },
    { name: 'EmailAddress', type: 'EmailAddress', required: true },
    { name: 'OrderTotal', type: 'Decimal', length: 18, decimals: 2 },
    { name: 'OrderDate', type: 'Date', default: 'now' },
    { name: 'IsFirstOrder', type: 'Boolean', default: 'false' },
  ],
  sampleRows: [
    { OrderID: 'A-1001', SubscriberKey: 'C-0001', EmailAddress: 'jane.doe@example.com', OrderTotal: '59.90', OrderDate: '2026-01-15', IsFirstOrder: 'true' },
  ],
}

/** The prompt for an AI assistant. `description` is what the user wants the DE to hold. */
export function buildDePrompt(description = '') {
  const want = String(description || '').trim()
  return [
    'You design data extensions for Salesforce Marketing Cloud Engagement.',
    want
      ? `Design one data extension for this:\n${want}`
      : 'Design one data extension for this: <describe what the data extension should hold, where the data comes from and how it is used>',
    '',
    'Follow these rules:',
    '- Data extension name: letters, numbers, spaces, underscores and dashes, at most 128 characters, not starting with an underscore.',
    `- At most ${MAX_FIELDS} fields. Field names: letters, numbers, spaces and underscores, at most 128 characters, not starting with an underscore, each name used once.`,
    `- Field types, exactly as written: ${TYPE_IDS.join(', ')}.`,
    '- Text: give a length from 1 to 4000, sized to the longest value you expect (for example 50 for codes, 254 for keys that may hold email addresses).',
    '- Number: whole numbers only. Decimal: length is the total digits (1 to 38) and decimals the digits after the point (0 to length), for example 18 and 2 for money.',
    '- EmailAddress, Date, Boolean, Phone and Locale take no length. Locale values look like en-US.',
    '- Mark the field or fields that identify a row as primaryKey: true. A primary key field must also be required: true.',
    '- required: true only when every row must have a value; otherwise leave it out.',
    '- default is optional: a value that fits the type, or "now" for a Date field that should get the current date.',
    '- If the data extension is used to send emails, set isSendable: true and sendField to a Text, EmailAddress or Number field that holds the Subscriber Key. Otherwise isSendable: false.',
    '- retention.mode is one of off, rows (delete individual records), all (delete all records) or allAndDE (delete all records and the data extension); unit is days, weeks, months or years; length is 1 to 999. Use off unless the data is temporary.',
    '- sampleRows is optional: up to 5 rows of made-up example data (never real people), keyed by field name.',
    '',
    'Reply with one JSON code block and nothing else, in exactly this shape:',
    '```json',
    JSON.stringify(EXAMPLE, null, 2),
    '```',
  ].join('\n')
}

/** The JSON object in an AI's reply: inside a ```json block, or the outermost { ... }. */
function extractJson(text) {
  const s = String(text || '').trim()
  const fence = s.match(/```(?:json)?\s*([\s\S]*?)```/i)
  if (fence) return fence[1].trim()
  const a = s.indexOf('{')
  const b = s.lastIndexOf('}')
  return a >= 0 && b > a ? s.slice(a, b + 1) : s
}

/** True when the text looks like a data extension definition (an object with a fields array). */
export function looksLikeDefinition(text) {
  try {
    const o = JSON.parse(extractJson(text))
    return !!o && typeof o === 'object' && !Array.isArray(o) && Array.isArray(o.fields)
  } catch {
    return false
  }
}

const keyOf = (s) => String(s ?? '').toLowerCase().replace(/[\s_-]+/g, '')
const truthy = (v) => v === true || /^(true|yes|1)$/i.test(String(v ?? '').trim())
const intOr = (v, d) => (Number.isFinite(Number(v)) && String(v).trim() !== '' ? Math.trunc(Number(v)) : d)

/**
 * Reads a definition. Returns { settings, fields, sample, notes }:
 * settings is a partial blankSettings() (name, description, sendable, testable, retention;
 * never the folder or key), fields are page fields with `src` pointing into sample's
 * columns, sample is { columns, rows, truncated, kind: 'definition' } or null, notes lists
 * what was changed to fit. Throws with a plain message when the text is not one.
 */
export function parseDefinition(text) {
  let o
  try {
    o = JSON.parse(extractJson(text))
  } catch (e) {
    throw new Error(`The answer is not valid JSON (${e.message}). Ask the AI to reply with the JSON block only.`)
  }
  if (!o || typeof o !== 'object' || Array.isArray(o) || !Array.isArray(o.fields)) {
    throw new Error('The JSON has no "fields" list. Copy the prompt again and ask the AI to use exactly that shape.')
  }
  if (!o.fields.length) throw new Error('The definition has no fields.')
  const notes = []
  const de = o.dataExtension && typeof o.dataExtension === 'object' ? o.dataExtension : o

  const fields = o.fields.map((raw, i) => {
    const r = raw && typeof raw === 'object' ? raw : { name: String(raw) }
    const name = String(r.name ?? r.fieldName ?? `Field${i + 1}`).trim()
    const given = r.type ?? r.fieldType ?? 'Text'
    let type = TYPE_IDS.find((t) => t.toLowerCase() === String(given).toLowerCase()) || TYPE_ALIASES[keyOf(given)]
    if (!type) { type = 'Text'; notes.push(`${name}: type "${given}" is not an SFMC type, so it is Text.`) }
    const isPrimaryKey = truthy(r.primaryKey ?? r.isPrimaryKey)
    const required = truthy(r.required ?? r.isRequired) || (r.isNullable != null && !truthy(r.isNullable))
    let defaultValue = String(r.default ?? r.defaultValue ?? '').trim()
    let currentDate = false
    if (type === 'Date' && /^(now|today|getdate\(\)|current ?date)$/i.test(defaultValue)) { currentDate = true; defaultValue = '' }
    const f = { name, sourceName: name, type, length: null, scale: 0, isPrimaryKey, isNullable: !(required || isPrimaryKey), defaultValue, currentDate, src: null }
    if (type === 'Text') f.length = intOr(r.length ?? r.maxLength, 255)
    if (type === 'EmailAddress') f.length = 254
    if (type === 'Decimal') {
      f.length = intOr(r.length ?? r.precision, 18)
      f.scale = intOr(r.decimals ?? r.scale, 2)
    }
    return f
  })
  if (fields.length > MAX_FIELDS) notes.push(`The definition has ${fields.length} fields; SFMC allows ${MAX_FIELDS}.`)

  const settings = {}
  if (de.name != null) settings.name = String(de.name).trim()
  if (de.description != null) settings.description = String(de.description)
  if (de.isSendable != null || de.sendable != null) settings.isSendable = truthy(de.isSendable ?? de.sendable)
  if (de.isTestable != null || de.testable != null) settings.isTestable = truthy(de.isTestable ?? de.testable)
  if (settings.isSendable) {
    const want = String(de.sendField ?? de.sendableField ?? '').trim()
    const f = fields.find((x) => x.name.toLowerCase() === want.toLowerCase())
    if (f) settings.sendField = f.name
    else notes.push(want ? `Send relationship field "${want}" is not in the fields: pick one under Settings.` : 'Sendable, but no send relationship field: pick one under Settings.')
  }
  const r = de.retention
  if (r && typeof r === 'object') {
    const mode = RETENTION_MODE_IDS.find((m) => m.toLowerCase() === String(r.mode ?? '').toLowerCase()) || 'off'
    const unit = typeof r.unit === 'number' ? r.unit : UNIT_BY_NAME[String(r.unit ?? '').toLowerCase().replace(/s?$/, 's')] ?? 3
    settings.retention = { ...blankSettings().retention, mode, length: intOr(r.length, 30), unit, resetOnImport: truthy(r.resetOnImport) }
    if (r.mode && mode === 'off' && String(r.mode).toLowerCase() !== 'off') notes.push(`Retention "${r.mode}" is not known, so retention is off.`)
  }

  // Sample rows as a table keyed by field name, so the page can preview and load them.
  let sample = null
  const rows = Array.isArray(o.sampleRows ?? o.rows) ? (o.sampleRows ?? o.rows).filter((x) => x && typeof x === 'object' && !Array.isArray(x)) : []
  if (rows.length) {
    const columns = fields.map((f) => f.name)
    const byKey = (row, name) => {
      const k = Object.keys(row).find((x) => x.toLowerCase() === name.toLowerCase())
      return k == null ? '' : cellText(row[k])
    }
    sample = {
      columns,
      rows: rows.slice(0, MAX_SAMPLE_ROWS).map((row) => columns.map((c) => byKey(row, c))),
      truncated: rows.length > MAX_SAMPLE_ROWS,
      kind: 'definition',
    }
    fields.forEach((f, i) => { f.src = i })
  }
  return { settings, fields, sample, notes }
}
