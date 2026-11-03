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
  return parts.join('\n\n')
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
