import { describe, it, expect, beforeEach } from 'vitest'
import { mount } from '@vue/test-utils'
import DataTable from '../DataTable.vue'

const columns = [{ key: 'name', label: 'Name' }, { key: 'id', label: 'ID', hidden: true }]
const rows = [{ id: 'r1', name: 'One' }]
const heads = (w) => w.findAll('th').map((t) => t.text())

describe('DataTable hidden columns (feedback #1040)', () => {
  beforeEach(() => localStorage.clear())

  it('starts columns marked hidden as hidden', () => {
    expect(heads(mount(DataTable, { props: { columns, rows, storageKey: 't' } }))).toEqual(['Name'])
  })

  it('a saved Columns choice wins over the default', () => {
    localStorage.setItem('toolkit_cols_t', '[]')
    expect(heads(mount(DataTable, { props: { columns, rows, storageKey: 't' } }))).toEqual(['Name', 'ID'])
  })
})
