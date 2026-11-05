import { describe, it, expect, vi, beforeEach } from 'vitest'
vi.mock('../sfmcApi.js', () => ({ sfmcFetch: vi.fn() }))
import { searchAutomationsInFolder } from '../automationApi.js'

const all = Array.from({ length: 5 }, (_, i) => ({ id: `A${i}`, name: `a${i}` }))
describe('Automations in a folder (feedback #1071)', () => {
  beforeEach(() => localStorage.clear())
  it('skips a filter SFMC ignores and remembers the one that narrows the list', async () => {
    const fetch = vi.fn(async (url) => {
      if (url.includes('%24top=1') || url.includes('$top=1&')) return { entry: all.slice(0, 1), totalResults: 278 }
      if (url.includes('categoryId%20eq')) return { entry: all, totalResults: 278 } // ignored
      if (url.includes('&categoryId=11')) return { entry: all.slice(0, 2), totalResults: 2 } // works
      return { entry: all, totalResults: 278 }
    })
    const r = await searchAutomationsInFolder('s1', '', '11', 0, 50, fetch)
    expect(r).toMatchObject({ form: 'param', total: 2 })
    expect(localStorage.getItem('toolkit_automationFolderForm_s1')).toBe('param')
    fetch.mockClear()
    await searchAutomationsInFolder('s1', '', '11', 0, 50, fetch)
    expect(fetch).toHaveBeenCalledTimes(1)
  })
  it('says so when no form filters', async () => {
    const fetch = vi.fn(async () => ({ entry: all, totalResults: 278, items: all, count: 278 }))
    expect(await searchAutomationsInFolder('s2', '', '11', 0, 50, fetch)).toEqual({ entries: [], total: 0, unsupported: true })
  })
})
