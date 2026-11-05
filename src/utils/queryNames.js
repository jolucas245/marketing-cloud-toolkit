// Names for Run Query panels the user has not named (feedback #1053). A new panel used to
// be called "Panel 1 · 11/4/2026, 2:06:35 PM"; now it is "New query" until it has SQL,
// then a name from the tables it reads, kept up to date until the user names it.
import { tablesInSql } from './usage/match.js'

export const NEW_QUERY_NAME = 'New query'

const OLD_DEFAULT_RE = /^Panel \d+ · /
const AGGREGATE_RE = /\b(count|sum|avg|min|max)\s*\(|\bgroup\s+by\b/i

/** True when a record's name was made by the Toolkit, so it may follow the SQL. */
export function isAutoName(record) {
  if (!record) return false
  if (record.autoName === true) return true
  if (record.autoName === false) return false
  const name = String(record.name || '').trim()
  return !name || OLD_DEFAULT_RE.test(name)
}

/** A short name from the SQL: "_Sent, _Job +2", "Counts from _Sent". */
export function suggestQueryName(sql) {
  const text = String(sql || '')
  let tables = []
  try { tables = tablesInSql(text).map((t) => t.name) } catch { tables = [] }
  if (!tables.length) return NEW_QUERY_NAME
  const shown = tables.slice(0, 2).join(', ') + (tables.length > 2 ? ` +${tables.length - 2}` : '')
  return AGGREGATE_RE.test(text) ? `Counts from ${shown}` : shown
}
