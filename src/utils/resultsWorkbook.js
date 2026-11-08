// Excel download of query results (user, 2026-11-08): the first sheet holds the SQL,
// one line per row so a long query never meets Excel's 32,767-character cell limit and
// reads as written; the second holds the rows. Without SQL (Preview data) the rows
// alone, on a sheet named after the data extension.

/** Sheets for downloadWorkbook: [{ name, columns, rows }]. */
export function resultsWorkbookSheets({ sql = '', columns = [], rows = [], name = 'Rows' }) {
  const data = rows.map((r) => columns.map((c) => r[c] ?? ''))
  const text = String(sql || '').replace(/\r\n?/g, '\n').replace(/\s+$/, '')
  if (!text.trim()) return [{ name: name || 'Rows', columns, rows: data }]
  return [
    { name: 'SQL', columns: ['SQL'], rows: text.split('\n').map((line) => [line]) },
    { name: 'Data', columns, rows: data },
  ]
}
