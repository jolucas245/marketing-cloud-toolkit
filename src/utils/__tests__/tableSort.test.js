import { describe, it, expect } from 'vitest'
import { sortRows, filterRows, nextSort, sortKey, isSortable, isFilterable, parseUsDate } from '../tableSort.js'

const columns = [
  { key: 'pick', label: '' },
  { key: 'name', label: 'Name', hideable: false },
  { key: 'status', label: 'Status', sortValue: (r) => ({ 3: 'Running', 2: 'Ready' })[r.status] ?? r.status },
  { key: 'modifiedDate', label: 'Modified', type: 'date' },
  { key: 'rows', label: 'Rows', sortValue: (r) => r.count ?? null },
  { key: 'actions', label: '', hideable: false },
]
const rows = [
  { id: 1, name: 'beta', status: 3, modifiedDate: '2026-10-02T10:00:00', count: 9 },
  { id: 2, name: 'Alpha', status: 2, modifiedDate: '2026-09-30T10:00:00', count: 100 },
  { id: 3, name: 'gamma 10', status: 'Error', modifiedDate: '', count: null },
  { id: 4, name: 'gamma 9', status: 2, modifiedDate: '2026-10-20T08:00:00', count: 20 },
]
const ids = (list) => list.map((r) => r.id)

describe('table sorting (feedback #126)', () => {
  it('sorts text case-insensitively and numbers inside text naturally', () => {
    expect(ids(sortRows(rows, columns, { key: 'name', dir: 'asc' }))).toEqual([2, 1, 4, 3])
    expect(ids(sortRows(rows, columns, { key: 'name', dir: 'desc' }))).toEqual([3, 4, 1, 2])
  })
  it('sorts dates as dates and keeps empty values last both ways', () => {
    expect(ids(sortRows(rows, columns, { key: 'modifiedDate', dir: 'asc' }))).toEqual([2, 1, 4, 3])
    expect(ids(sortRows(rows, columns, { key: 'modifiedDate', dir: 'desc' }))).toEqual([4, 1, 2, 3])
  })
  it('sorts numbers as numbers through sortValue', () => {
    expect(ids(sortRows(rows, columns, { key: 'rows', dir: 'asc' }))).toEqual([1, 4, 2, 3])
    expect(ids(sortRows(rows, columns, { key: 'rows', dir: 'desc' }))).toEqual([2, 4, 1, 3])
  })
  it('sorts statuses by their names, stable for ties', () => {
    expect(ids(sortRows(rows, columns, { key: 'status', dir: 'asc' }))).toEqual([3, 2, 4, 1])
  })
  it('leaves the order alone with no sort or an unknown column', () => {
    expect(sortRows(rows, columns, null)).toBe(rows)
    expect(sortRows(rows, columns, { key: 'nope', dir: 'asc' })).toBe(rows)
  })
  it('cycles ascending, descending, off', () => {
    let s = nextSort(null, 'name')
    expect(s).toEqual({ key: 'name', dir: 'asc' })
    s = nextSort(s, 'name')
    expect(s).toEqual({ key: 'name', dir: 'desc' })
    expect(nextSort(s, 'name')).toBeNull()
    expect(nextSort(s, 'status')).toEqual({ key: 'status', dir: 'asc' })
  })
  it('turns values into comparable keys', () => {
    expect(sortKey('42')).toBe(42)
    expect(sortKey('42', 'text')).toBe('42')
    expect(sortKey('  ')).toBeNull()
    expect(sortKey('2026-10-24')).toBe(Date.parse('2026-10-24'))
    expect(sortKey('2024 campaign')).toBe('2024 campaign')
  })
  it('skips columns without a label or opted out', () => {
    expect(isSortable(columns[0])).toBe(false)
    expect(isSortable(columns[1])).toBe(true)
    expect(isSortable({ key: 'x', label: 'X', sortable: false })).toBe(false)
    expect(isFilterable({ key: 'x', label: 'X', filterable: false })).toBe(false)
    expect(isFilterable(columns[5])).toBe(false)
  })
})

describe('table filters (feedback #126)', () => {
  it('matches case-insensitive text in every filled-in column', () => {
    expect(ids(filterRows(rows, columns, { name: 'GAMMA' }))).toEqual([3, 4])
    expect(ids(filterRows(rows, columns, { name: 'gamma', status: 'ready' }))).toEqual([4])
    expect(ids(filterRows(rows, columns, { name: '  ' }))).toEqual([1, 2, 3, 4])
  })
  it('filters computed cells and dates', () => {
    expect(ids(filterRows(rows, columns, { status: 'running' }))).toEqual([1])
    expect(ids(filterRows(rows, columns, { modifiedDate: '2026-10' }))).toEqual([1, 4])
    expect(ids(filterRows(rows, columns, { rows: '20' }))).toEqual([4])
  })
})

// SFMC writes dates as M/D/YYYY h:mm:ss AM in DE rows and query results; read as
// text they sorted month, day, year (live test, 2026-11-07).
describe('SFMC US dates', () => {
  it('reads M/D/YYYY with and without a time', () => {
    expect(parseUsDate('7/23/2025')).toBe(new Date(2025, 6, 23).getTime())
    expect(parseUsDate('7/23/2025 12:00:00 AM')).toBe(new Date(2025, 6, 23, 0, 0, 0).getTime())
    expect(parseUsDate('7/23/2025 12:30 PM')).toBe(new Date(2025, 6, 23, 12, 30).getTime())
    expect(parseUsDate('07/03/2025 4:05:09 pm')).toBe(new Date(2025, 6, 3, 16, 5, 9).getTime())
    expect(parseUsDate('7/23/2025 16:05')).toBe(new Date(2025, 6, 23, 16, 5).getTime())
    expect(parseUsDate('7/23/2025 4:05:09.123 PM')).toBe(new Date(2025, 6, 23, 16, 5, 9, 123).getTime())
  })
  it('rejects text that only looks like a date', () => {
    expect(parseUsDate('2/30/2026')).toBeNull()
    expect(parseUsDate('13/1/2026')).toBeNull()
    expect(parseUsDate('1/1/2026 13:00 PM')).toBeNull()
    expect(parseUsDate('1/1/26')).toBeNull()
    expect(parseUsDate('1/1/2026 and more')).toBeNull()
  })
  it('sorts by date, not by the text', () => {
    const r = [
      { id: 1, d: '7/23/2025 12:00:00 AM' },
      { id: 2, d: '1/2/2026 12:00:00 AM' },
      { id: 3, d: '9/13/2025 12:00:00 AM' },
      { id: 4, d: '1/13/2026 3:00:00 PM' },
      { id: 5, d: '1/13/2026 9:00:00 AM' },
      { id: 6, d: '' },
    ]
    const cols = [{ key: 'd', label: 'Date' }]
    expect(sortRows(r, cols, { key: 'd', dir: 'asc' }).map((x) => x.id)).toEqual([1, 3, 2, 5, 4, 6])
    expect(sortRows(r, cols, { key: 'd', dir: 'desc' }).map((x) => x.id)).toEqual([4, 5, 2, 3, 1, 6])
  })
})
