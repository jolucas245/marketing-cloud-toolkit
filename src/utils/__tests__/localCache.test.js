import { describe, it, expect, vi } from 'vitest'
vi.mock('../sfmcApi.js', () => ({ fetchCurrentBU: vi.fn(async () => ({ accountId: 77 })) }))
import { cached, cacheKey, cacheScope, forgetCache, mergeChanges, changesSince, newestModified, savedAgo, CACHE_DAYS } from '../localCache.js'
import { cachedList, storedList, saveList } from '../listCache.js'

describe('Stored SFMC data (feedback #1066, #1069)', () => {
  it('keeps values 30 days per stack and business unit, and forgets them', async () => {
    expect(CACHE_DAYS).toBe(30)
    const scope = await cacheScope('s1')
    expect(scope).toBe('s1:77')
    const fetcher = vi.fn(async () => ({ a: 1 }))
    const k = cacheKey(scope, 'folders-x', '0')
    expect((await cached(k, fetcher)).fromCache).toBe(false)
    expect((await cached(k, fetcher)).fromCache).toBe(true)
    expect(fetcher).toHaveBeenCalledTimes(1)
    expect((await cached(k, fetcher, { force: true })).fromCache).toBe(false)
    await forgetCache('folders-x', scope)
    expect((await cached(k, fetcher)).fromCache).toBe(false)
    expect(fetcher).toHaveBeenCalledTimes(3)
  })
  it('merges changes and reads changed pages until an older item', async () => {
    const stored = [{ id: 1, modifiedDate: '2026-01-02' }, { id: 2, modifiedDate: '2026-01-01' }]
    expect(newestModified(stored)).toBe('2026-01-02')
    const merged = mergeChanges(stored, [{ id: 2, modifiedDate: '2026-02-01', name: 'x' }, { id: 3, modifiedDate: '2026-02-02' }], { sortBy: (a, b) => b.modifiedDate.localeCompare(a.modifiedDate) })
    expect(merged.map((i) => i.id)).toEqual([3, 2, 1])
    const pages = { 1: [{ id: 9, modifiedDate: '2026-03-01' }, { id: 8, modifiedDate: '2026-02-01' }], 2: [{ id: 7, modifiedDate: '2025-12-01' }] }
    const fetchPage = vi.fn(async (p) => pages[p] || [])
    expect((await changesSince('2026-01-02', fetchPage)).map((i) => i.id)).toEqual([9, 8])
    expect(fetchPage).toHaveBeenCalledTimes(2) // page 1 was all newer, page 2 held an older one
  })
  it('shows a stored list, then reads only the changes, and Refresh reads all', async () => {
    const full = vi.fn(async () => ({ items: [{ id: 'a', modifiedDate: '2026-01-01' }], total: 1 }))
    const changes = vi.fn(async () => [{ id: 'b', modifiedDate: '2026-02-01' }])
    const params = { text: '', folderId: '5' }
    expect(await storedList('s1', 'emails', params)).toBe(null)
    expect((await cachedList({ stack: 's1', kind: 'emails', params, full, changes })).mode).toBe('full')
    expect((await storedList('s1', 'emails', params)).items).toHaveLength(1)
    const d = await cachedList({ stack: 's1', kind: 'emails', params, full, changes })
    expect(d).toMatchObject({ mode: 'delta', changed: 1, total: 2 })
    expect(changes).toHaveBeenCalledWith('2026-01-01')
    expect((await cachedList({ stack: 's1', kind: 'emails', params, full, changes, force: true })).mode).toBe('full')
    expect(full).toHaveBeenCalledTimes(2)
    await saveList('s1', 'emails', params, [{ id: 'z' }], 9)
    expect(await storedList('s1', 'emails', params)).toMatchObject({ total: 9 })
  })
  it('says how old a stored copy is', () => {
    const now = Date.UTC(2026, 0, 10)
    expect(savedAgo(now - 5 * 60000, now)).toBe('5 min ago')
    expect(savedAgo(now - 86400000, now)).toBe('yesterday')
    expect(savedAgo(now - 3 * 86400000, now)).toBe('3 days ago')
  })
})
