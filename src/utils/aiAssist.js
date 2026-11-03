// AI Assist (feedback #1028): write or fix a query with Chrome's built-in model
// (Gemini Nano through the Prompt API). The model runs on this computer: nothing is
// sent over the network, and query results are never part of a prompt. The prompt
// holds only the user's request, the SQL, the problems found, and the names and
// fields of the tables named; the user sees it before it runs.
// API: `LanguageModel` (Chrome 138+), or `ai.languageModel` in older Chrome.

export const MAX_TABLES = 8
export const MAX_FIELDS = 60

const OPTIONS = { expectedInputs: [{ type: 'text', languages: ['en'] }], expectedOutputs: [{ type: 'text', languages: ['en'] }] }

function api(g = globalThis) {
  if (g.LanguageModel) return { kind: 'new', lm: g.LanguageModel }
  if (g.ai?.languageModel) return { kind: 'old', lm: g.ai.languageModel }
  return null
}

/**
 * 'available' | 'downloadable' | 'downloading' | 'unavailable' | 'unsupported'
 * ('unsupported': this Chrome has no Prompt API at all).
 */
export async function aiAvailability(g = globalThis) {
  const a = api(g)
  if (!a) return 'unsupported'
  try {
    if (a.kind === 'new') return await a.lm.availability(OPTIONS)
    const c = await a.lm.capabilities()
    return c?.available === 'readily' ? 'available' : c?.available === 'after-download' ? 'downloadable' : 'unavailable'
  } catch {
    return 'unavailable'
  }
}

/** A session with the system prompt. `onProgress(0..1)` while the model downloads. Call from a click. */
export async function createAiSession(system, { onProgress, signal, g = globalThis } = {}) {
  const a = api(g)
  if (!a) throw new Error('This version of Chrome has no built-in AI model.')
  const monitor = (m) => m.addEventListener('downloadprogress', (e) => onProgress?.(typeof e.loaded === 'number' ? e.loaded : 0))
  const opts = a.kind === 'new'
    ? { ...OPTIONS, initialPrompts: [{ role: 'system', content: system }], monitor, signal }
    : { systemPrompt: system, monitor, signal }
  return a.lm.create(opts)
}

export const AI_SYSTEM = `You write SQL for Salesforce Marketing Cloud Engagement query activities (a subset of SQL Server 2019 T-SQL).
Rules:
- Only SELECT statements. No INSERT, UPDATE, DELETE, variables, temporary tables or stored procedures.
- Prefer subqueries to WITH (common table expressions).
- Put table and field names with spaces, dashes or other special characters in [brackets]. Shared data extensions in a child business unit are written ENT.[Name].
- System data views start with an underscore, such as _Subscribers, _Sent, _Open, _Click, _Bounce, _Unsubscribe, _Job, _Journey, _JourneyActivity. Join tracking views on JobID, ListID, BatchID and SubscriberID, or on SubscriberKey. Data views keep about six months of data and their dates are in Central Standard Time.
- Every column in the result needs a name: give expressions an alias, such as COUNT(*) AS Total.
- ORDER BY only with TOP. No duplicate column names in the result.
- Use only the tables and fields listed. Do not invent field names; if something is missing, say so.
Answer with one SQL query in a \`\`\`sql code block, then at most two short sentences explaining it.`

const tableLines = (tables) => tables.slice(0, MAX_TABLES).map((t) => {
  const fields = (t.fields || []).slice(0, MAX_FIELDS).map((f) => (f.type ? `${f.name} (${f.type})` : f.name))
  const more = (t.fields || []).length > MAX_FIELDS ? `, and ${t.fields.length - MAX_FIELDS} more` : ''
  return `- ${t.name}${t.kind ? ` (${t.kind})` : ''}: ${fields.join(', ') || 'fields unknown'}${more}`
}).join('\n')

/** The user message for `mode` 'write' or 'fix'. */
export function buildAiPrompt({ mode, request = '', sql = '', problems = [], tables = [] }) {
  const parts = []
  if (mode === 'fix') {
    parts.push('Fix this query so it runs in Marketing Cloud. Keep what it returns the same unless a problem requires a change.')
    const list = problems.map((p) => String(p || '').trim()).filter(Boolean)
    parts.push(`Problems found:\n${list.length ? list.map((p) => `- ${p}`).join('\n') : '- None reported; check it for mistakes.'}`)
    if (request.trim()) parts.push(`Also: ${request.trim()}`)
    parts.push(`Query:\n\`\`\`sql\n${sql.trim()}\n\`\`\``)
  } else {
    parts.push(`Write a query that does this: ${request.trim()}`)
    if (sql.trim()) parts.push(`The current query, to start from or replace:\n\`\`\`sql\n${sql.trim()}\n\`\`\``)
  }
  if (tables.length) parts.push(`Tables you can use:\n${tableLines(tables)}`)
  // Personal data out, and short enough for the built-in model (feedback #1029).
  return fitText(maskPersonal(parts.join('\n\n')))
}

/** { sql, note } from the model's answer: the first sql (or any) code block, else the text from the first SELECT. */
export function readAiAnswer(text) {
  const t = String(text || '')
  const m = /```(?:sql|tsql|SQL)?\s*\n?([\s\S]*?)```/.exec(t)
  if (m) return { sql: m[1].trim(), note: (t.slice(0, m.index) + t.slice(m.index + m[0].length)).trim() }
  const s = /\bselect\b/i.exec(t)
  return s ? { sql: t.slice(s.index).trim(), note: t.slice(0, s.index).trim() } : { sql: '', note: t.trim() }
}

export const AVAILABILITY_TEXT = {
  available: 'Ready: Chrome\'s built-in model is on this computer.',
  downloadable: 'Chrome needs to download its built-in model first (a few GB, once). Click Download to start.',
  downloading: 'Chrome is downloading its built-in model.',
  unavailable: 'Chrome\'s built-in model is not available on this computer. It needs Chrome 138 or later on Windows, macOS, Linux or ChromeOS (not on phones), about 22 GB of free disk space, and a GPU with more than 4 GB of memory or 16 GB of RAM.',
  unsupported: 'This version of Chrome has no built-in AI model. Update Chrome (version 138 or later) to use AI Assist.',
}

// ── Feedback #1029: AI in more places (Experimental, on by default) ──

/** The Settings switch (chrome.storage.local). On unless turned off. */
export const AI_SETTING = '_aiAssistEnabled'

/** True when this browser has Chrome's built-in model API at all. */
export const aiPresent = (g = globalThis) => !!api(g)

/**
 * Google Chrome only (feedback #1029): Edge, Opera, Brave and others ship their own
 * models or none. Uses the browser brands when the browser gives them.
 */
export function isChromeBrowser(nav = globalThis.navigator) {
  const brands = nav?.userAgentData?.brands
  if (Array.isArray(brands) && brands.length) return brands.some((b) => b?.brand === 'Google Chrome')
  const ua = String(nav?.userAgent || '')
  return /Chrome\//.test(ua) && !/Edg\/|OPR\/|Brave|YaBrowser|Vivaldi/.test(ua)
}

// The built-in model takes a few thousand tokens at most: longer text is cut.
export const MAX_PROMPT_CHARS = 12000

/** `text` cut to `max` characters, with a note saying how much was left out. */
export function fitText(text, max = MAX_PROMPT_CHARS) {
  const t = String(text || '')
  return t.length <= max ? t : `${t.slice(0, max)}\n[... ${(t.length - max).toLocaleString('en-US')} more characters left out]`
}

const EMAIL_RE = /[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)*\.[A-Za-z]{2,}/g
const DATE_LIKE = /^\s*(\d{4}-\d{1,2}-\d{1,2}|\d{1,2}[/.-]\d{1,2}[/.-]\d{2,4})([ T]\d{1,2}:\d{2}(:\d{2}(\.\d+)?)?)?\s*(AM|PM)?\s*$/i

/**
 * Personal data out of text before a prompt (feedback #1029): email addresses
 * anywhere; inside quoted values, phone numbers and Salesforce record IDs (such as a
 * contact ID in a WHERE). International phone numbers (+1 ...) anywhere. Names and
 * free text cannot be told apart reliably, so prompts never carry data values: only
 * names of things, SQL and settings.
 */
export function maskPersonal(text) {
  return String(text || '')
    .replace(EMAIL_RE, '[email]')
    .replace(/'([^'\n]{1,200})'/g, (m, inner) => {
      const digits = inner.replace(/\D/g, '')
      if (digits.length >= 9 && /^[\d\s()+./-]+$/.test(inner) && !DATE_LIKE.test(inner)) return '\'[phone]\''
      if (/^[A-Za-z0-9]{15}(?:[A-Za-z0-9]{3})?$/.test(inner) && /\d/.test(inner) && /[A-Za-z]/.test(inner) && /^[0-9a-zA-Z]{3}[0-9]/.test(inner)) return '\'[record id]\''
      return m
    })
    .replace(/(^|[^\w+])\+\d[\d ().-]{7,}\d/g, (m, pre) => `${pre}[phone]`)
}

/**
 * A document from utils/exportDoc.js (automation, journey, Where used) as plain text
 * for a prompt: headings, key-value rows, tables and paragraphs; code cut to 1,500
 * characters a block; pictures left out.
 */
export function docText(doc) {
  const out = []
  if (doc?.title) out.push(`# ${doc.title}`)
  for (const b of doc?.blocks || []) {
    if (b.type === 'h') out.push(`${'#'.repeat(Math.min(6, (b.level || 2)))} ${b.text || ''}`)
    else if (b.type === 'p') out.push(String(b.text || ''))
    else if (b.type === 'kv') out.push((b.rows || []).map(([k, v]) => `${k}: ${v ?? ''}`).join('\n'))
    else if (b.type === 'table') out.push([(b.columns || []).join(' | '), ...(b.rows || []).slice(0, 80).map((r) => r.map((c) => c ?? '').join(' | ')), ...((b.rows || []).length > 80 ? [`(${b.rows.length - 80} more rows)`] : [])].join('\n'))
    else if (b.type === 'list') out.push((b.items || []).map((i) => `- ${typeof i === 'string' ? i : i?.text || ''}`).join('\n'))
    else if (b.type === 'code') out.push(`\`\`\`\n${fitText(b.text, 1500)}\n\`\`\``)
  }
  return out.filter((s) => String(s).trim()).join('\n\n')
}

export const AI_TEXT_SYSTEM = `You help people who use Salesforce Marketing Cloud Engagement understand their setup.
Answer in plain English for a marketer: short paragraphs or a short list, no more than about 200 words.
Use only the information given. If something is not there, say you cannot tell. Do not make up names, fields or numbers.
Text like [email], [phone] or [record id] stands for a value that was removed on purpose.`

/** Text tasks (feedback #1029). Each `build(data)` gives the user message. */
export const AI_TASKS = {
  explainQuery: {
    title: 'Explain this query',
    build: ({ sql, name }) => `Explain what this SQL query returns, in plain words: which tables it reads, how they are joined, which rows it keeps, and what each output column holds. Then list anything that looks wrong, slow or risky in Marketing Cloud.\n\nQuery${name ? ` "${name}"` : ''}:\n\`\`\`sql\n${String(sql || '').trim()}\n\`\`\``,
  },
  automation: {
    title: 'Summarize this automation',
    build: ({ text }) => `Summarize what this Marketing Cloud automation does, in at most 8 short points: when it runs, what each step does, which data extensions it reads and writes, and anything that looks risky (a step that overwrites data, a failed run, no error notification).\n\n${text}`,
  },
  journey: {
    title: 'Summarize this journey',
    build: ({ text }) => `Summarize this Marketing Cloud journey in at most 8 short points: how contacts enter, the path they take (waits, decisions, splits), what is sent and when, and how they leave. Point out anything that looks risky.\n\n${text}`,
  },
  whereUsed: {
    title: 'Summarize where it is used',
    build: ({ text }) => `Below is where something in Marketing Cloud is used. Summarize in plain words what depends on it, and what would break or need changing if it were renamed or deleted. Most important first.\n\n${text}`,
  },
}

/** The masked, size-limited user message for a text task. */
export function buildAiTaskPrompt(task, data) {
  const t = AI_TASKS[task]
  if (!t) throw new Error(`Unknown AI task: ${task}`)
  return fitText(maskPersonal(t.build(data || {})))
}

// Create DE: field types from column names (never sample values).
export const AI_FIELDS_SYSTEM = `You design Salesforce Marketing Cloud data extensions.
Field types: Text (length 1 to 4000), Number (whole numbers), Decimal (length and decimal places), Date (date and time), Boolean, EmailAddress, Phone, Locale.
For each field, answer with exactly one line in this form, and nothing else:
Name | Type | Length | Decimals | Primary key (yes or no)
Leave Length and Decimals empty when the type has none. Keep the field names exactly as given. Mark as primary key only fields that identify a row, such as a subscriber or contact key.`

export function buildFieldsPrompt(fields, purpose = '') {
  const lines = fields.map((f) => `- ${f.name}${f.type ? ` (guessed from the data: ${f.type}${f.type === 'Text' && f.length ? `, ${f.length}` : ''})` : ''}`)
  return fitText(maskPersonal(`${purpose.trim() ? `The data extension is for: ${purpose.trim()}\n\n` : ''}Suggest a type for each of these fields:\n${lines.join('\n')}`))
}

const TYPE_NAMES = ['Text', 'Number', 'Decimal', 'Date', 'Boolean', 'EmailAddress', 'Phone', 'Locale']

/** [{ name, type, length, scale, isPrimaryKey }] from the model's lines; unknown types dropped. */
export function readFieldSuggestions(text) {
  const out = []
  for (const line of String(text || '').split('\n')) {
    const cells = line.replace(/^\s*[-*]\s*/, '').split('|').map((c) => c.trim().replace(/^`|`$/g, ''))
    if (cells.length < 2) continue
    const type = TYPE_NAMES.find((t) => t.toLowerCase() === cells[1].replace(/\s+/g, '').toLowerCase())
    if (!type || !cells[0] || /^name$/i.test(cells[0])) continue
    const num = (v) => (/^\d+$/.test(v || '') ? Number(v) : null)
    out.push({ name: cells[0], type, length: num(cells[2]), scale: num(cells[3]), isPrimaryKey: /^y/i.test(cells[4] || '') })
  }
  return out
}
