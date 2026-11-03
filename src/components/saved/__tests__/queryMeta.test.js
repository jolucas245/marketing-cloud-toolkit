import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import { matchesQuerySearch, queryTables, queryHasWhere, sqlOneLine, queryDisplayName } from '../queryMeta.js'
import QueryRow from '../QueryRow.vue'

const q = {
  id: 'sql_1', name: 'Weekly members', timeStamp: Date.now(), isFavourite: false,
  queryText: 'SELECT a.Id, b.Name\nFROM [Members A] a\nJOIN ENT.[Shared Things] b ON a.Id = b.Id\nWHERE a.Active = 1',
  businessUnit: { name: 'Test Unit', accountId: 123 },
}

describe('queryMeta', () => {
  it('searches name, SQL and business unit, with bu: terms', () => {
    expect(matchesQuerySearch(q, '')).toBe(true)
    expect(matchesQuerySearch(q, 'weekly')).toBe(true)
    expect(matchesQuerySearch(q, 'shared things')).toBe(true)
    expect(matchesQuerySearch(q, 'bu:test')).toBe(true)
    expect(matchesQuerySearch(q, 'bu:123 members')).toBe(true)
    expect(matchesQuerySearch(q, 'bu:other')).toBe(false)
    expect(matchesQuerySearch(q, 'nothing here')).toBe(false)
  })
  it('reads tables from FROM and JOIN, ignoring comments, strings and subqueries', () => {
    expect(queryTables(q.queryText)).toEqual(['Members A', 'Shared Things'])
    expect(queryTables("SELECT x FROM T1 -- FROM Hidden\nWHERE y = 'from Nope'")).toEqual(['T1'])
    expect(queryTables('SELECT * FROM (SELECT * FROM Inner1) s')).toEqual(['Inner1'])
  })
  it('spots WHERE outside comments and strings', () => {
    expect(queryHasWhere(q.queryText)).toBe(true)
    expect(queryHasWhere("SELECT 'where' FROM T /* WHERE */")).toBe(false)
  })
  it('puts the SQL on one line and names unnamed queries by date', () => {
    expect(sqlOneLine('SELECT\n  a\nFROM  T')).toBe('SELECT a FROM T')
    expect(sqlOneLine('x'.repeat(10), 5)).toBe('xxxxx...')
    expect(queryDisplayName({ timeStamp: null })).toBe('Unknown date')
  })
})

describe('QueryRow', () => {
  it('opens on click and selects in delete mode', async () => {
    const w = mount(QueryRow, { props: { query: q } })
    expect(w.text()).toContain('Weekly members')
    expect(w.text()).toContain('Reads Members A')
    expect(w.text()).toContain('Filtered by WHERE')
    await w.find('[aria-expanded]').trigger('click')
    expect(w.emitted('open')[0]).toEqual(['sql_1'])
    await w.find('[aria-label="Favourite"]').trigger('click')
    expect(w.emitted('toggle-favourite')[0]).toEqual(['sql_1'])
    await w.setProps({ deleteMode: true })
    await w.find('input[type="checkbox"]').trigger('change')
    expect(w.emitted('toggle-select')[0]).toEqual(['sql_1'])
  })
})
