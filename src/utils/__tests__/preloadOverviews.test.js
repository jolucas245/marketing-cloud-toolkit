import { describe, it, expect, vi, beforeEach } from 'vitest'

const calls = { automations: 0, journeys: 0 }
vi.mock('../sfmcApi.js', () => ({ fetchCurrentBU: async () => ({ accountId: 7, name: 'BU' }) }))
vi.mock('../overview.js', () => ({
  listAllAutomations: async () => { calls.automations++; return [{ id: 'a1' }] },
  listAllJourneys: async () => { calls.journeys++; if (calls.failJourneys) throw new Error('boom'); return [{ id: 'j1' }] },
}))

const { preloadOverviews, preloadOverviewPage } = await import('../preloadOverviews.js')
const { pageCacheKey, readPageCache, writePageCache, clearPageCache, pendingPageCache } = await import('../pageCache.js')

describe('preloadOverviews (feedback #78)', () => {
  beforeEach(() => { clearPageCache(); calls.automations = 0; calls.journeys = 0; calls.failJourneys = false })

  it('fills the page cache for both overviews of the current BU', async () => {
    expect(await preloadOverviews('s13')).toEqual(['automation-overview', 'journey-overview'])
    expect(readPageCache(pageCacheKey('automation-overview', 's13', 7)).list).toEqual([{ id: 'a1' }])
    expect(readPageCache(pageCacheKey('journey-overview', 's13', 7)).list).toEqual([{ id: 'j1' }])
  })

  it('skips a page read in the last 10 minutes, and reads an older one again', async () => {
    writePageCache(pageCacheKey('automation-overview', 's13', 7), { list: [] }, 1000)
    writePageCache(pageCacheKey('journey-overview', 's13', 7), { list: [] }, 1000)
    expect(await preloadOverviews('s13', { now: () => 1000 + 5 * 60000 })).toEqual([])
    expect(calls.automations).toBe(0)
    expect(await preloadOverviews('s13', { now: () => 1000 + 11 * 60000 })).toEqual(['automation-overview', 'journey-overview'])
  })

  it('stays quiet on errors and leaves nothing pending', async () => {
    calls.failJourneys = true
    expect(await preloadOverviews('s13')).toEqual(['automation-overview'])
    expect(readPageCache(pageCacheKey('journey-overview', 's13', 7))).toBeNull()
    expect(pendingPageCache(pageCacheKey('journey-overview', 's13', 7))).toBeNull()
  })

  it('does nothing without a stack', async () => {
    expect(await preloadOverviews(null)).toEqual([])
  })

  it('preloadOverviewPage reads one overview, keeps a fresh one and reads again with maxAgeMs 0 (feedback #1037)', async () => {
    expect(await preloadOverviewPage('s13', 7, 'automation-overview')).toEqual({ list: [{ id: 'a1' }], cached: false })
    expect(await preloadOverviewPage('s13', 7, 'automation-overview')).toEqual({ list: [{ id: 'a1' }], cached: true })
    expect(calls.automations).toBe(1)
    await preloadOverviewPage('s13', 7, 'automation-overview', { maxAgeMs: 0 })
    expect(calls.automations).toBe(2)
    calls.failJourneys = true
    await expect(preloadOverviewPage('s13', 7, 'journey-overview')).rejects.toThrow('boom')
    await expect(preloadOverviewPage('s13', 7, 'nope')).rejects.toThrow('Unknown overview')
  })
})
