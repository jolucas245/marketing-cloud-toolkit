// Preview with TOP 10 (feedback #1028): the query as it would run, limited to the first
// rows, so a slow or wrong query shows quickly. A single SELECT gets TOP n (an existing
// TOP is replaced); a UNION / EXCEPT / INTERSECT is wrapped in SELECT TOP n * FROM (...).

export const PREVIEW_ROWS = 10

// Comments blanked to spaces, so offsets stay the same.
const blankComments = (s) => s.replace(/--[^\n]*|\/\*[\s\S]*?\*\//g, (m) => ' '.repeat(m.length))

// Whether UNION / EXCEPT / INTERSECT joins SELECTs at the top level (outside
// brackets, strings and comments). Kept here rather than importing the Query
// Builder's parser into Run Query.
export function hasSetOperation(sql) {
  const text = blankComments(String(sql || '')).replace(/'(?:[^']|'')*'/g, (m) => ' '.repeat(m.length)).replace(/\[[^\]]*\]/g, (m) => ' '.repeat(m.length))
  let depth = 0
  for (let i = 0; i < text.length; i++) {
    const c = text[i]
    if (c === '(') depth++
    else if (c === ')') depth = Math.max(0, depth - 1)
    else if (depth === 0 && /[a-z]/i.test(c) && (i === 0 || !/\w/.test(text[i - 1]))) {
      const word = /^[a-z]+/i.exec(text.slice(i))[0]
      if (/^(union|except|intersect)$/i.test(word)) return true
      i += word.length - 1
    }
  }
  return false
}

/** The SQL limited to `n` rows, or '' when there is no SELECT. */
export function topPreviewSql(sql, n = PREVIEW_ROWS) {
  const clean = String(sql || '').trim().replace(/;+\s*$/, '')
  if (!clean) return ''
  if (hasSetOperation(clean)) return `SELECT TOP ${n} *\nFROM (\n${clean}\n) AS toolkit_preview`
  const plain = blankComments(clean)
  const m = /\bselect\b(\s+(?:distinct|all)\b)?/i.exec(plain)
  if (!m) return ''
  const after = m.index + m[0].length
  const top = /^\s+top\s*(?:\(\s*\d+\s*\)|\d+)(\s+percent\b)?/i.exec(plain.slice(after))
  if (top) return `${clean.slice(0, after)} TOP ${n}${clean.slice(after + top[0].length)}`
  return `${clean.slice(0, after)} TOP ${n}${clean.slice(after)}`
}
