import { describe, it, expect } from 'vitest'
import { resultsWorkbookSheets } from '../resultsWorkbook.js'

describe('resultsWorkbookSheets (Excel from Run Query, user 2026-11-08)', () => {
  const columns = ['OrderId', 'Amount']
  const rows = [{ OrderId: 'ORD-1', Amount: '24.00' }, { OrderId: 'ORD-2' }]

  it('puts the SQL on the first sheet, one line per row, and the rows on the second', () => {
    const sheets = resultsWorkbookSheets({ sql: 'SELECT OrderId, Amount\r\nFROM Demo_Orders\n\n', columns, rows, name: 'Orders' })
    expect(sheets).toEqual([
      { name: 'SQL', columns: ['SQL'], rows: [['SELECT OrderId, Amount'], ['FROM Demo_Orders']] },
      { name: 'Data', columns, rows: [['ORD-1', '24.00'], ['ORD-2', '']] },
    ])
  })

  it('keeps only the rows without SQL (Preview data), named after the data extension', () => {
    expect(resultsWorkbookSheets({ sql: '  ', columns, rows, name: 'Demo_Orders' })).toEqual([{ name: 'Demo_Orders', columns, rows: [['ORD-1', '24.00'], ['ORD-2', '']] }])
  })
})
