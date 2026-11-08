// Better SQL from the built-in model (feedback #1044). The on-device model is small and
// takes a few thousand tokens, so it gets only what one request needs:
// - the core rules, plus the rule topics whose keywords appear in the request or SQL
//   (data/aiSqlRules.json: written for the Toolkit from Mateusz Dąbrowski's SFMC SQL
//   guides at mateuszdabrowski.pl, in our own words);
// - the data views the request talks about ("opened" means _Open), with their real
//   fields and how they join (utils/dataViews.js);
// - one or two worked examples that match.
// After it answers, the SQL goes through the Toolkit's own SQL checks; when they find
// problems the model gets one round to fix them (aiSqlProblems, buildAiPrompt 'fix').
import RULES from '@/data/aiSqlRules.json'
import { DATA_VIEW_FIELDS, DATA_VIEW_INFO, dataViewJoin } from './dataViews.js'
import { lintSql } from './sqlLint.js'

export const MAX_SYSTEM_CHARS = 6000
const MAX_EXAMPLES = 2
const MAX_VIEW_FIELDS = 30

const HEAD = 'You write SQL for Salesforce Marketing Cloud Engagement query activities (a subset of SQL Server T-SQL).'
const TAIL = 'Use only the tables and fields listed. Do not invent field names; if something is missing, say so.\nAnswer with one SQL query in a ```sql code block, then at most two short sentences explaining it.'

// Words in a request that point at a data view.
const VIEW_WORDS = [
  [/\bopen(s|ed|er|ers|ing)?\b/, '_Open'],
  [/\bclick(s|ed|er|ers|ing)?\b/, '_Click'],
  [/\b(sent|sends?|sending|delivered)\b/, '_Sent'],
  [/\bbounc(e|es|ed|ing)\b/, '_Bounce'],
  [/\bunsub(scribe|scribed|scribes)?\b|\bopt(ed)?[- ]?out/, '_Unsubscribe'],
  [/\bcomplain(t|ts|ed)?\b|\bspam\b/, '_Complaint'],
  [/\bsubscriber(s)?\b|\bsubscription status\b/, '_Subscribers'],
  [/\bjourney(s)?\b/, '_Journey'],
  [/\bjourney activit(y|ies)\b|\bjourney (email|step)s?\b/, '_JourneyActivity'],
  [/\b(email name|subject line|subject|job(s)?|send job)\b/, '_Job'],
  [/\bautomation run(s)?\b|\bautomation instance/, '_AutomationInstance'],
]

const lc = (s) => String(s || '').toLowerCase()
// Whole words only: "de" must not match "delete".
const has = (text, word) => new RegExp(`(^|[^a-z0-9_])${word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}($|[^a-z0-9_])`, 'i').test(text)

/** Data view names (as written, e.g. _Open) a request or SQL is about. */
export function viewsFor(text) {
  const t = lc(text)
  const out = new Set()
  for (const [re, view] of VIEW_WORDS) if (re.test(t)) out.add(view)
  for (const key of Object.keys(DATA_VIEW_FIELDS)) if (has(t, key.toLowerCase())) out.add(nameOf(key))
  return [...out]
}
const nameOf = (upper) => {
  const u = String(upper).toUpperCase()
  const known = ['_Subscribers', '_Sent', '_Open', '_Click', '_Bounce', '_Complaint', '_Unsubscribe', '_Job', '_Journey', '_JourneyActivity', '_AutomationInstance', '_AutomationActivityInstance', '_ListSubscribers', '_EnterpriseAttribute', '_BusinessUnitUnsubscribes', '_FTAF']
  return known.find((n) => n.toUpperCase() === u) || upper
}

/** Topic ids whose keywords appear in the text, the most mentioned first. */
export function topicsFor(text, rules = RULES) {
  const t = lc(text)
  return Object.entries(rules.topics || {})
    .map(([k, v], i) => ({ k, i, hits: (v.when || []).filter((w) => has(t, lc(w))).length }))
    .filter((x) => x.hits > 0)
    .sort((a, b) => b.hits - a.hits || a.i - b.i)
    .map((x) => x.k)
}

/** Data view lines for the prompt: fields and joins between the views picked. */
export function viewLines(views, known = []) {
  const skip = new Set(known.map((n) => lc(n).replace(/^ent\./, '')))
  const list = views.filter((v) => DATA_VIEW_FIELDS[v.toUpperCase()])
  const lines = []
  for (const v of list) {
    if (skip.has(lc(v))) continue
    const fields = DATA_VIEW_FIELDS[v.toUpperCase()].slice(0, MAX_VIEW_FIELDS).map((f) => f.name).join(', ')
    const note = DATA_VIEW_INFO[v.toUpperCase()]?.notes
    lines.push(`- ${v}: ${fields}${note ? `. ${note}` : ''}`)
  }
  const joins = []
  for (let i = 0; i < list.length; i++) {
    for (let j = i + 1; j < list.length; j++) {
      const c = dataViewJoin({ name: list[i], fields: [] }, { name: list[j], fields: [] })
      if (c) joins.push(`- ${list[i]} to ${list[j]}: ${c.map((x) => `${list[i]}.${x.leftField} = ${list[j]}.${x.rightField}`).join(' AND ')}`)
    }
  }
  return { fields: lines, joins }
}

/**
 * The system prompt for one request: core rules, matching topics, data views and
 * examples, kept under MAX_SYSTEM_CHARS (examples go first when it is too long, then
 * the lowest topics).
 * Returns { text, topics, views }.
 */
export function buildSqlSystem({ request = '', sql = '', tables = [] } = {}, rules = RULES) {
  const text = `${request}\n${sql}`
  const topics = topicsFor(text, rules)
  const views = viewsFor(text)
  const { fields, joins } = viewLines(views, tables.map((t) => t.name))
  // (fields is trimmed below when the text is too long)
  const examples = (rules.examples || [])
    .map((e) => ({ e, score: (e.topics || []).filter((t) => topics.includes(t)).length + views.filter((v) => (e.sql || '').includes(v)).length }))
    .filter((x) => x.score > 0).sort((a, b) => b.score - a.score).slice(0, MAX_EXAMPLES).map((x) => x.e)

  const build = (tp, ex) => [
    HEAD,
    `Rules:\n${(rules.core || []).map((r) => `- ${r}`).join('\n')}`,
    ...tp.map((k) => `${k}:\n${(rules.topics[k].rules || []).map((r) => `- ${r}`).join('\n')}`),
    fields.length ? `System data views you may use (fields):\n${fields.join('\n')}` : '',
    joins.length ? `Join them like this:\n${joins.join('\n')}` : '',
    ...ex.map((e) => `Example. Request: ${e.request}\n\`\`\`sql\n${e.sql}\n\`\`\``),
    TAIL,
  ].filter(Boolean).join('\n\n')

  let tp = topics
  let ex = examples
  let out = build(tp, ex)
  while (out.length > MAX_SYSTEM_CHARS && ex.length) { ex = ex.slice(0, -1); out = build(tp, ex) }
  while (out.length > MAX_SYSTEM_CHARS && tp.length) { tp = tp.slice(0, -1); out = build(tp, ex) }
  // Still too long (many data views named): keep the first views' fields only.
  while (out.length > MAX_SYSTEM_CHARS && fields.length) { fields.pop(); out = build(tp, ex) }
  if (out.length > MAX_SYSTEM_CHARS) out = out.slice(0, MAX_SYSTEM_CHARS)
  return { text: out, topics: tp, views }
}

/** Problems the SQL checks find in an answer (errors and warnings), as lines of text. */
export function aiSqlProblems(sql, options = {}) {
  return lintSql(sql, options)
    .filter((d) => d.severity === 'error' || d.severity === 'warning')
    .map((d) => `${d.code}: ${d.message}`)
}

/** Everything the model gets, as one text to paste into another assistant. */
export function promptForCopy(system, prompt) {
  return `${system}\n\n---\n\n${prompt}`
}

export const RULES_SOURCE = RULES.source || ''
