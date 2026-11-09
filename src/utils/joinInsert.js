// "Join to the query" from the schema search: adds a JOIN for a data view or DE to the
// SQL in the editor, with the ON condition from the data view join rules or a shared
// key field, after the last table of the outer query's FROM.
import { tokenize, significant, isWord } from './sqlTokens.js'
import { referencedTables } from './sqlContext.js'
import { suggestJoinConditions } from './sqlBuilder.js'
import { fieldRef, tableRef } from './insertFields.js'
import { bareTableName } from './schemaCatalog.js'
import { RESERVED } from './sqlLint.js'
import { SQL_KEYWORDS, SQL_DATA_TYPES, SQL_FUNCTIONS } from './sqlDocs.js'

const END_OF_FROM = ['WHERE', 'GROUP', 'HAVING', 'ORDER', 'UNION', 'EXCEPT', 'INTERSECT', 'OPTION']

/** Where the JOIN goes: before the outer query's WHERE/GROUP BY/... or at the end. */
export function joinInsertPoint(sql) {
  const toks = significant(tokenize(sql))
  const from = toks.findIndex((t) => t.depth === 0 && isWord(t, 'FROM'))
  if (from < 0) return null
  const stop = toks.findIndex((t, i) => i > from && t.depth === 0 && isWord(t, ...END_OF_FROM))
  if (stop >= 0) return toks[stop].start
  const semi = toks.findIndex((t, i) => i > from && t.type === 'semi')
  return semi >= 0 ? toks[semi].start : sql.replace(/\s+$/, '').length
}

// Words of a table name: Demo_Orders -> Demo, Orders; _SMSMessageTracking ->
// SMS, Message, Tracking; "My DE 2024" -> My, DE, 2024.
function nameWords(name) {
  return bareTableName(name)
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/([A-Z]+)([A-Z][a-z])/g, '$1 $2')
    .split(/[^A-Za-z0-9]+/)
    .filter(Boolean)
}

const IDENT = /^[a-z][a-z0-9_]*$/

// Not aliases: T-SQL reserved words, and words that read as SQL keywords, data types
// or functions though SFMC would accept them (DO is a keyword in other SQL dialects).
const NOT_ALIAS = new Set([
  ...RESERVED,
  ...SQL_KEYWORDS.filter((k) => !k.includes(' ')),
  ...SQL_DATA_TYPES.filter((t) => /^[A-Z0-9_]+$/.test(t)),
  ...Object.keys(SQL_FUNCTIONS),
  'DO', 'LIMIT', 'NEXT', 'FIRST', 'LAST', 'ONLY', 'ROW', 'ROWS',
])

/**
 * A readable alias for a joined table that is not taken and not a reserved word:
 * the initials (Demo_Customers -> dc), else the last word (Demo_Orders: "do" reads
 * as a keyword, so orders), else the whole name (demo_orders), else a number on the
 * initials. Before this it was the first two letters, so Demo_Orders read "de"
 * (live test, 2026-11-07).
 */
export function newAlias(name, taken) {
  const words = nameWords(name).map((w) => w.toLowerCase())
  const letters = words.filter((w) => /^[a-z]/.test(w))
  const initials = letters.map((w) => w[0]).join('')
  const candidates = [initials, letters[letters.length - 1], words.join('_')]
  const free = (a) => !!a && IDENT.test(a) && !NOT_ALIAS.has(a.toUpperCase()) && !taken.has(a)
  const pick = candidates.find(free)
  if (pick) return pick
  const base = IDENT.test(initials) ? initials : 't'
  for (let i = 2; ; i++) if (free(base + i)) return base + i
}

/**
 * Plans the JOIN text. `fieldsOf(name)` gives a table's fields (or a promise of them).
 * Returns { at, insert, alias, matched } or { error }.
 */
export async function planJoin(sql, table, fields, fieldsOf, joinType = 'LEFT JOIN') {
  const at = joinInsertPoint(sql || '')
  if (at === null) return { error: 'Write a SELECT ... FROM first; the join goes after its tables.' }
  const refs = referencedTables(sql)
  if (refs.some((r) => bareTableName(r.name).toLowerCase() === bareTableName(table.name).toLowerCase())) {
    return { error: `${bareTableName(table.name)} is already in the query.` }
  }
  // Aliases in use, and names of tables written without one (FROM Orders, then AS orders would clash).
  const taken = new Set(refs.map((r) => String(r.alias || (/^[A-Za-z_][A-Za-z0-9_]*$/.test(bareTableName(r.name)) ? bareTableName(r.name) : '')).toLowerCase()).filter(Boolean))
  const alias = newAlias(table.name, taken)
  let matched = null
  for (const r of refs) {
    const own = await Promise.resolve(fieldsOf(r.name)).catch(() => null)
    const conds = suggestJoinConditions({ name: bareTableName(r.name), fields: own || [] }, { name: bareTableName(table.name), fields })
    if (conds.length) { matched = { ref: r, conds }; break }
  }
  const head = `${joinType} ${tableRef(table.name)} AS ${alias}`
  let on = '/* set the join condition */'
  if (matched) {
    const q = matched.ref.alias || tableRef(matched.ref.name)
    on = matched.conds.map((c) => `${fieldRef(c.leftField, q)} = ${fieldRef(c.rightField, alias)}`).join('\n  AND ')
  }
  const before = sql.slice(0, at)
  const lead = /\n\s*$/.test(before) ? '' : '\n'
  return { at, insert: `${lead}${head}\n  ON ${on}\n`, alias, matched: !!matched }
}
