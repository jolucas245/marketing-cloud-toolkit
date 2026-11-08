import { describe, it, expect, vi } from 'vitest'

// Journey overview counts each journey once, by its live version (live test, 2026-11-08:
// "Welcome Journey" has a published version 2 and a draft version 3, and counted as a draft).
const urls = []
vi.mock('../sfmcApi.js', async (orig) => ({
  ...(await orig()),
  sfmcFetch: vi.fn(async (url) => {
    urls.push(url)
    return { count: 3, items: [
      { id: 'w', name: 'Welcome Journey', version: 3, status: 'Draft' },
      { id: 'w', name: 'Welcome Journey', version: 2, status: 'Published' },
      { id: 'a', name: 'Abandon Cart', version: 1, status: 'Draft' },
    ] }
  }),
}))

describe('listAllJourneys', () => {
  it('reads every version and keeps one row per journey, the live version first', async () => {
    const { listAllJourneys, summarizeJourneys } = await import('../overview.js')
    const list = await listAllJourneys('s10')
    expect(urls[0]).toContain('mostRecentVersionOnly=false')
    expect(list.map((j) => [j.name, j.version, j.status, j.versionCount])).toEqual([['Welcome Journey', 2, 'Published', 2], ['Abandon Cart', 1, 'Draft', 1]])
    expect(summarizeJourneys(list)).toMatchObject({ total: 2, live: 1 })
  })
})
