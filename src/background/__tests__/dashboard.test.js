import { describe, it, expect, vi } from 'vitest'

// The dashboard card counts each journey once, by its live version (live test,
// 2026-11-08: it said 28 live where Home said 40).
const urls = []
vi.mock('../fetchProxy.js', () => ({
  sfmcFetch: vi.fn(async ({ url }) => {
    urls.push(url)
    return { count: 3, items: [
      { id: 'w', name: 'Welcome Journey', version: 3, status: 'Draft' },
      { id: 'w', name: 'Welcome Journey', version: 2, status: 'Published' },
      { id: 'a', name: 'Abandon Cart', version: 1, status: 'Draft' },
    ] }
  }),
}))
vi.mock('../chromeAsync.js', () => ({ storageGet: vi.fn(async () => ({})) }))

describe('dashboard listJourneys', () => {
  it('reads every version and keeps the live one per journey', async () => {
    const { listJourneys, dashboardSummary } = await import('../dashboard.js')
    const list = await listJourneys('s10')
    expect(urls[0]).toContain('mostRecentVersionOnly=false')
    expect(list.map((j) => [j.name, j.version, j.status])).toEqual([['Welcome Journey', 2, 'Published'], ['Abandon Cart', 1, 'Draft']])
    expect(dashboardSummary([], list, {}, 's10').journeys).toMatchObject({ total: 2, live: 1 })
  })
})
