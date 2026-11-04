import { describe, it, expect, beforeEach } from 'vitest'
import { setBrowseList, getBrowseList, browseNeighbours, clearBrowseLists } from '../browseList.js'

describe('browse list for Next / Previous (feedback #1043)', () => {
  beforeEach(() => { sessionStorage.clear(); clearBrowseLists() })

  it('gives the position and neighbours in the shown order', () => {
    setBrowseList('automations', [{ id: 'a', name: 'A' }, { id: 'b', name: 'B' }, { id: 'c', name: 'C' }])
    expect(browseNeighbours('automations', 'b')).toMatchObject({ index: 1, total: 3, prev: { id: 'a' }, next: { id: 'c' } })
    expect(browseNeighbours('automations', 'a').prev).toBeNull()
    expect(browseNeighbours('automations', 'C').next).toBeNull()
    expect(browseNeighbours('automations', 'zzz')).toBeNull()
    expect(browseNeighbours('journeys', 'a')).toBeNull()
  })

  it('keeps journey versions and survives a reload of the tab (sessionStorage)', () => {
    setBrowseList('journeys', [{ id: 'j1', name: 'J', query: { version: '2' } }, { id: null }])
    clearBrowseLists()
    expect(getBrowseList('journeys')).toEqual([{ id: 'j1', name: 'J', query: { version: '2' } }])
  })
})
