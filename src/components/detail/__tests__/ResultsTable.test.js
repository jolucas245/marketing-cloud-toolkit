import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import ResultsTable from '../ResultsTable.vue'

const rows = Array.from({ length: 2500 }, (_, i) => ({ id: i }))

describe('ResultsTable: more than 2,500 rows (feedback)', () => {
  it('says how many rows exist and offers to load more', async () => {
    const w = mount(ResultsTable, { props: { rows, columns: ['id'], totalCount: 6000, canLoadMore: true } })
    expect(w.text()).toContain('Showing 2,500 of 6,000 rows')
    const buttons = w.findAll('button').filter((b) => /Load (next|all)/.test(b.text()))
    expect(buttons.map((b) => b.text())).toEqual(['Load next 2,500', 'Load all'])
    await buttons[0].trigger('click')
    await buttons[1].trigger('click')
    expect(Object.keys(w.emitted())).toEqual(expect.arrayContaining(['load-more', 'load-all']))
  })

  it('caps Load all and says so for very large results', () => {
    const w = mount(ResultsTable, { props: { rows, columns: ['id'], totalCount: 120000, canLoadMore: true, loadAllLimit: 50000 } })
    expect(w.text()).toContain('Load all (up to 50,000)')
  })

  it('shows no load buttons when everything is loaded', () => {
    const w = mount(ResultsTable, { props: { rows: rows.slice(0, 10), columns: ['id'], totalCount: 10, canLoadMore: true } })
    expect(w.text()).toContain('10 rows')
    expect(w.text()).not.toContain('Load next')
  })
})

describe('ResultsTable: column values (feedback #1012)', () => {
  const data = [
    { Ref: 'A', Kind: 'Placed' }, { Ref: 'B', Kind: 'Placed' }, { Ref: 'A', Kind: 'Settled' },
    { Ref: 'C', Kind: 'Changed' }, { Ref: '', Kind: 'Placed' },
  ]
  const open = async (w, col) => { await w.find(`button[aria-label="Values of ${col}"]`).trigger('click') }

  it('lists distinct values with counts, filters to ticked values and to duplicates', async () => {
    const w = mount(ResultsTable, { props: { rows: data, columns: ['Ref', 'Kind'] }, attachTo: document.body })
    await open(w, 'Ref')
    expect(w.find('[data-testid="values-summary"]').text()).toMatch(/4 distinct values in 5 rows, 1 blank\.\s*1 value repeats\./)
    expect(w.findAll('[data-testid="values-list"] li').map((li) => li.text().replace(/\s+/g, ' '))).toEqual(['A2', '(blank)1', 'B1', 'C1'])
    await w.findAll('[data-testid="values-list"] input[type="checkbox"]')[2].setValue(true)
    expect(w.text()).toContain('1 of 5 loaded rows (filtered)')
    await w.findAll('[role="dialog"] button').find((b) => b.text().startsWith('Clear')).trigger('click')
    await w.find('[role="dialog"] label input[type="checkbox"]').setValue(true) // Duplicates only
    expect(w.text()).toContain('2 of 5 loaded rows (filtered)')
    expect(w.findAll('tbody tr').map((tr) => tr.text())).toEqual(['APlaced', 'ASettled'])
    // The other column's list counts only the rows left.
    await open(w, 'Kind')
    expect(w.findAll('[data-testid="values-list"] li').map((li) => li.text().replace(/\s+/g, ' '))).toEqual(['Placed1', 'Settled1'])
    await w.findAll('button').find((b) => b.text() === 'Clear value filters').trigger('click')
    expect(w.text()).toContain('5 rows')
    w.unmount()
  })

  it('says counts are partial and offers SFMC queries on Preview data', async () => {
    const w = mount(ResultsTable, { props: { rows: data, columns: ['Ref'], totalCount: 900, sfmcValues: true }, attachTo: document.body })
    await open(w, 'Ref')
    expect(w.text()).toContain('Counts cover the rows loaded so far')
    await w.findAll('button').find((b) => b.text() === 'Duplicates in SFMC').trigger('click')
    expect(w.emitted('values-query')[0][0]).toEqual({ col: 'Ref', kind: 'duplicates' })
    expect(w.find('[role="dialog"]').exists()).toBe(false)
    w.unmount()
  })

  it('closes on Escape', async () => {
    const w = mount(ResultsTable, { props: { rows: data, columns: ['Ref'] }, attachTo: document.body })
    await open(w, 'Ref')
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }))
    await w.vm.$nextTick()
    expect(w.find('[role="dialog"]').exists()).toBe(false)
    w.unmount()
  })
})

describe('ResultsTable: page after the rows change (feedback #1082)', () => {
  const firstCell = (w) => w.find('tbody tr td:last-child').text()
  it('keeps the page when rows are appended, starts at page 1 when they are replaced', async () => {
    const w = mount(ResultsTable, { props: { rows: rows.slice(0, 100), columns: ['id'] } })
    await w.find('button[title="Next page"]').trigger('click')
    expect(firstCell(w)).toBe('50')
    await w.setProps({ rows: rows.slice(0, 200) })
    expect(firstCell(w)).toBe('50')
    await w.setProps({ rows: rows.slice(70, 105) })
    expect(firstCell(w)).toBe('70')
  })
})

describe('ResultsTable: search every column (user, 2026-11-06)', () => {
  const data = [
    { Email: 'ann@acme.com', City: 'Austin' },
    { Email: 'bob@other.org', City: 'Boston' },
    { Email: 'cy@acme.com', City: 'Chicago' },
    ...Array.from({ length: 60 }, (_, i) => ({ Email: `x${i}@filler.net`, City: 'Dallas' })),
  ]
  const cells = (w) => w.findAll('tbody tr').map((tr) => tr.findAll('td')[0].text())

  it('keeps the rows with the text in any column, case-insensitive, and back to page 1', async () => {
    const w = mount(ResultsTable, { props: { rows: data, columns: ['Email', 'City'] } })
    await w.findAll('button[title="Next page"]')[0].trigger('click')
    const box = w.find('input[data-results-search]')
    await box.setValue('ACME')
    expect(cells(w)).toEqual(['ann@acme.com', 'cy@acme.com'])
    expect(w.text()).toContain('2 of 63 loaded rows (filtered)')
    await box.setValue('boston')
    expect(cells(w)).toEqual(['bob@other.org'])
    await box.trigger('keydown', { key: 'Escape' })
    expect(box.element.value).toBe('')
    expect(cells(w)).toHaveLength(50)
  })

  it('works with the column filters', async () => {
    const w = mount(ResultsTable, { props: { rows: data, columns: ['Email', 'City'] } })
    await w.find('input[data-results-search]').setValue('acme')
    await w.findAll('button').find((b) => b.text() === 'Filters').trigger('click')
    await w.find('input[aria-label="Filter City"]').setValue('chi')
    expect(cells(w)).toEqual(['cy@acme.com'])
  })

  it('is left out where the page has its own search', () => {
    const w = mount(ResultsTable, { props: { rows: data, columns: ['Email', 'City'], searchable: false } })
    expect(w.find('input[data-results-search]').exists()).toBe(false)
  })
})
