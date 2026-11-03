// Small helpers for the Saved queries list: the search box (with bu: terms), and a
// quick read of what a query reads, for the row and detail chips. The table names
// come from a light regex on purpose: the list can hold hundreds of queries and the
// full SQL parser is too slow to run for every row.

export function queryDisplayName(q) {
  return q?.name ?? (q?.timeStamp ? new Date(q.timeStamp).toLocaleString() : 'Unknown date')
}

// "bu:<text>" terms match the business unit name or ID; the rest matches the name,
// the SQL or the business unit name.
export function matchesQuerySearch(q, search) {
  const raw = String(search || '').toLowerCase().trim()
  if (!raw) return true
  const buTerms = [...raw.matchAll(/bu:(\S+)/g)].map((m) => m[1])
  const remaining = raw.replace(/bu:\S+/g, '').trim()
  const buName = (q.businessUnit?.name || '').toLowerCase()
  if (buTerms.length) {
    const buId = String(q.businessUnit?.accountId || '').toLowerCase()
    if (!buTerms.every((t) => buName.includes(t) || buId.includes(t))) return false
  }
  if (!remaining) return true
  return (q.queryText || '').toLowerCase().includes(remaining) ||
    queryDisplayName(q).toLowerCase().includes(remaining) ||
    buName.includes(remaining)
}

// Comments and string literals removed, so their words are not read as SQL.
function stripSql(sql) {
  return String(sql || '')
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/--[^\n]*/g, ' ')
    .replace(/'(?:[^']|'')*'/g, "''")
}

// Tables named after FROM or JOIN, in order, without duplicates.
export function queryTables(sql) {
  const text = stripSql(sql)
  const out = []
  const re = /\b(?:FROM|JOIN)\s+(?:(?:\[[^\]]+\]|\w+)\.)?(\[[^\]]+\]|\w+)(?![\w.[])/gi
  let m
  while ((m = re.exec(text)) !== null) {
    const name = m[1].replace(/^\[|\]$/g, '')
    if (name.toUpperCase() === 'SELECT') continue
    if (!out.some((t) => t.toLowerCase() === name.toLowerCase())) out.push(name)
  }
  return out
}

export function queryHasWhere(sql) {
  return /\bWHERE\b/i.test(stripSql(sql))
}

// The SQL on one line, for the list row.
export function sqlOneLine(sql, max = 220) {
  const s = String(sql || '').replace(/\s+/g, ' ').trim()
  return s.length > max ? s.slice(0, max) + '...' : s
}
