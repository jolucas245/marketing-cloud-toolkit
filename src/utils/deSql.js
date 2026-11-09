// The SELECT that Automation Viewer's Data Extension Finder wrote from ticked fields:
// every ticked field, FROM the first DE, and an INNER JOIN for each other DE on the
// first column name the two share (ticked, else any field of both). When they share
// none, the first ticked fields are joined and the SQL starts with a "MUST REVIEW" comment.
import { sqlName } from './format.js'

/**
 * @param {Array<{ de: string, fields: string[], allFields?: string[], sourceType?: string }>} selections  in the order ticked
 *   (sourceType 'shared': a Shared DE, read from a child business unit as ENT.[name], feedback #73;
 *   allFields: every field of the DE, so a join can use a column that was not ticked)
 * @returns {string} '' when nothing is ticked
 */
export function buildDESelect(selections) {
  const tables = selections.filter((s) => s.fields.length)
  if (!tables.length) return ''
  const alias = new Map(tables.map((t, i) => [t.de, tables.length > 1 ? `t${i + 1}` : null]))
  const shared = new Set(tables.filter((t) => t.sourceType === 'shared').map((t) => t.de))
  const ref = (de, field) => (alias.get(de) ? `${alias.get(de)}.${sqlName(field)}` : sqlName(field))
  const from = (de) => `${shared.has(de) ? 'ENT.' : ''}${sqlName(de)}${alias.get(de) ? ` ${alias.get(de)}` : ''}`
  const lower = (x) => String(x).toLowerCase()
  const findIn = (list, name) => (list || []).find((g) => lower(g) === lower(name))

  const [first, ...rest] = tables
  const review = []
  const joins = []
  const joinCols = new Map() // de -> its join column (same value as the first DE's, so selected once)
  for (const t of rest) {
    // A column ticked in both; else one the two DEs share at all (live test, 2026-11-07:
    // Demo_Orders and Demo_Customers both have SubscriberKey, but it was not ticked in
    // both, so the first ticked fields were joined, an ID to a status); else a guess.
    let left = first.fields.find((f) => findIn(t.fields, f))
    let right = left && findIn(t.fields, left)
    if (!left) {
      left = (first.allFields || first.fields).find((f) => findIn(t.allFields || t.fields, f))
      right = left && findIn(t.allFields || t.fields, left)
    }
    if (!left) {
      left = first.fields[0]
      right = t.fields[0]
      review.push(`-- MUST REVIEW: ${first.de} and ${t.de} share no column; the join below uses the first selected column of each.`)
    } else {
      joinCols.set(t.de, right)
    }
    joins.push(`INNER JOIN ${from(t.de)}\n    ON ${ref(first.de, left)} = ${ref(t.de, right)}`)
  }

  // Output names must be unique for SFMC to save the result into a data extension: the
  // join column of a joined DE is left out when its partner is selected, and any other
  // repeated name gets the table alias as a prefix.
  const used = new Set()
  const columns = []
  for (const t of tables) {
    for (const f of t.fields) {
      const isJoin = joinCols.has(t.de) && lower(joinCols.get(t.de)) === lower(f)
      if (used.has(lower(f))) {
        if (isJoin) continue
        const name = `${alias.get(t.de)}_${f}`
        columns.push(`${ref(t.de, f)} AS ${sqlName(name)}`)
        used.add(lower(name))
        continue
      }
      used.add(lower(f))
      columns.push(ref(t.de, f))
    }
  }
  const lines = [`SELECT\n    ${columns.join(',\n    ')}`, `FROM ${from(first.de)}`, ...joins]
  return [...review, ...(review.length ? [''] : []), ...lines].join('\n')
}
