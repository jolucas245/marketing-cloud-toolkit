// Direct read (feedback #1076, user 2026-11-06): a query that only reads one data
// extension, with no filter, join, sort, grouping or expression, is answered by reading
// the DE's rows straight from SFMC instead of running a Query Activity, which can wait
// minutes in SFMC's queue. Anything else, a data view (_Sent...), a Shared DE (ENT.) or a
// DE that cannot be found by exact name goes through the normal Query Activity run.
import { searchLocalDEsByName, fetchDERows } from './sfmcApi.js'
import { fetchDEFieldList } from './deApi.js'

const NAME = String.raw`(?:\[[^\]]+\]|[A-Za-z0-9_]+)`
const COLUMN = String.raw`(?:[A-Za-z_][A-Za-z0-9_]*\.)?${NAME}`
const PLAN_RE = new RegExp(
  String.raw`^select\s+(?:top\s*(?:\(\s*(\d+)\s*\)|(\d+))\s+)?(\*|${COLUMN}(?:\s*,\s*${COLUMN})*)\s+from\s+(${NAME})(?:\s+(?:as\s+)?([A-Za-z_][A-Za-z0-9_]*))?$`,
  'i',
)
const unbracket = (s) => s.replace(/^\[(.*)\]$/, '$1').trim()
// Words that, after the table name, mean more than a plain read.
const CLAUSES = new Set(['where', 'join', 'inner', 'left', 'right', 'full', 'cross', 'order', 'group', 'having', 'union', 'except', 'intersect', 'offset', 'with'])

/** Strips comments, outer space and a trailing semicolon. */
export function cleanSql(sql) {
  return String(sql || '')
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/--[^\n]*/g, ' ')
    .trim()
    .replace(/;\s*$/, '')
    .trim()
}

/**
 * { table, columns: '*' | [names], top: number | null } for a plain read of one data
 * extension, else null.
 */
export function directReadPlan(sql) {
  const m = PLAN_RE.exec(cleanSql(sql))
  if (!m) return null
  const [, topParen, topBare, cols, rawTable, alias] = m
  if (alias && CLAUSES.has(alias.toLowerCase())) return null
  const table = unbracket(rawTable)
  if (!table || table.startsWith('_')) return null // data views
  const top = topParen ?? topBare
  const columns = cols.trim() === '*'
    ? '*'
    : cols.split(',').map((c) => unbracket(c.trim().replace(/^[A-Za-z_][A-Za-z0-9_]*\.(?=\[|[A-Za-z0-9_])/, '')))
  if (columns !== '*' && new Set(columns.map((c) => c.toLowerCase())).size !== columns.length) return null
  return { table, columns, top: top != null ? Number(top) : null }
}

/** A row from SFMC's rowset (keys and values, names often lowercased) as { [column]: value }. */
export function projectRow(item, columns) {
  const flat = { ...(item?.keys || {}), ...(item?.values || {}) }
  const lower = Object.fromEntries(Object.entries(flat).map(([k, v]) => [k.toLowerCase(), v]))
  return Object.fromEntries(columns.map((c) => [c, lower[c.toLowerCase()] ?? '']))
}

const API = { searchLocalDEsByName, fetchDEFieldList, fetchDERows }

/**
 * Reads the first page of the plan's data extension. Returns null when it should go
 * through a Query Activity instead (no single DE by that exact name, or a column it does
 * not have, which SFMC then reports). Else { de, columns, rows, total, top }.
 */
export async function readDirect(stack, plan, { pageSize = 2500, api: overrides } = {}) {
  const api = { ...API, ...overrides }
  const found = await api.searchLocalDEsByName(stack, plan.table, 50)
  const matches = (found?.items || []).filter((d) => String(d.name || '').toLowerCase() === plan.table.toLowerCase())
  if (matches.length !== 1) return null
  const d = matches[0]
  const key = d.customerKey || d.key
  if (!key || !d.id) return null
  const fields = [...(await api.fetchDEFieldList(stack, d.id) || [])]
    .sort((a, b) => (a.ordinal ?? 0) - (b.ordinal ?? 0))
    .map((f) => f.name)
  let columns
  if (plan.columns === '*') columns = fields
  else {
    const byLower = new Map(fields.map((f) => [f.toLowerCase(), f]))
    columns = plan.columns.map((c) => byLower.get(c.toLowerCase()))
    if (columns.some((c) => !c)) return null
  }
  const size = plan.top != null ? Math.min(pageSize, Math.max(plan.top, 1)) : pageSize
  const data = plan.top === 0 ? { items: [], count: 0 } : await api.fetchDERows(stack, key, 1, size)
  const count = data.count ?? (data.items || []).length
  const total = plan.top != null ? Math.min(plan.top, count) : count
  const rows = (data.items || []).map((item) => projectRow(item, columns)).slice(0, total)
  return { de: { id: d.id, key, name: d.name }, columns, rows, total, top: plan.top, pageSize: size }
}
