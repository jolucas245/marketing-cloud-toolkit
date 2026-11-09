import { describe, it, expect, vi } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { ref } from 'vue'

const downloadWorkbook = vi.fn(async () => {})
vi.mock('@/utils/exportDoc.js', () => ({ downloadWorkbook: (...a) => downloadWorkbook(...a) }))
vi.mock('@/composables/useStack.js', () => ({ useStack: () => ({ stack: ref('s10') }) }))
vi.mock('@/utils/exportName.js', () => ({ exportBaseName: async (stack, base) => base }))

describe('ResultsTable: Excel in Run Query (user, 2026-11-08)', () => {
  it('downloads the SQL on the first sheet and the rows shown on the second', async () => {
    const { default: ResultsTable } = await import('../ResultsTable.vue')
    const rows = [{ Country: 'Canada', N: '1' }, { Country: 'Japan', N: '2' }]
    const w = mount(ResultsTable, { props: { rows, columns: ['Country', 'N'], sql: 'SELECT Country, N\nFROM Demo_Customers', filename: 'Customers' } })
    await w.find('input[data-results-search]').setValue('Japan')
    await w.findAll('button').find((b) => b.text() === 'Excel').trigger('click')
    await flushPromises()
    const [sheets, file] = downloadWorkbook.mock.calls[0]
    expect(sheets.map((s) => s.name)).toEqual(['SQL', 'Data'])
    expect(sheets[0].rows).toEqual([['SELECT Country, N'], ['FROM Demo_Customers']])
    expect(sheets[1].rows).toEqual([['Japan', '2']])
    expect(file).toBe('query-Customers.xlsx')
  })
})
