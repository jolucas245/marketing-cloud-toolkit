import { describe, it, expect, vi, beforeEach } from 'vitest'

const calls = { load: [], refresh: [] }
vi.mock('../sfmcApi.js', () => ({ fetchCurrentBU: async () => ({ accountId: 7, name: 'BU' }) }))
vi.mock('../usage/sources.js', () => {
  class StoppedError extends Error { constructor() { super('Stopped.'); this.stopped = true } }
  return {
    StoppedError,
    SOURCES: {
      automations: {
        load: async () => { calls.load.push('automations'); return { items: [{ id: 'a' }], total: 1 } },
        refresh: async (saved) => { calls.refresh.push('automations'); return { value: saved, changed: 0 } },
      },
      emailsends: {
        load: async ({ get }) => { calls.load.push('emailsends'); const a = await get('automations'); return { items: a.items, total: 1 } },
      },
      locations: { load: async () => { calls.load.push('locations'); return { items: [], total: 0, unavailable: true } } },
    },
  }
})
vi.mock('../usage/kinds.js', () => ({ KINDS: {}, PROFILE_LABELS: {} }))

const { preloadUsageSource } = await import('../usage/index.js')
const { loadSaved, forget } = await import('../usage/store.js')

describe('preloadUsageSource (feedback #1037)', () => {
  beforeEach(async () => { calls.load = []; calls.refresh = []; await forget('') })

  it('loads a source into the Where used saved data under the stack and BU key', async () => {
    const r = await preloadUsageSource('s10', 7, 'automations')
    expect(r.cached).toBe(false)
    expect((await loadSaved('s10:7:automations')).value.items).toEqual([{ id: 'a' }])
  })

  it('keeps data saved under 5 minutes ago, refreshes older data, reads in full with force', async () => {
    await preloadUsageSource('s10', 7, 'automations')
    expect((await preloadUsageSource('s10', 7, 'automations')).cached).toBe(true)
    const later = Date.now() + 6 * 60000
    const r = await preloadUsageSource('s10', 7, 'automations', { now: () => later })
    expect(r).toMatchObject({ cached: false, note: 'no changes' })
    expect(calls.refresh).toEqual(['automations'])
    await preloadUsageSource('s10', 7, 'automations', { force: true })
    expect(calls.load).toEqual(['automations', 'automations'])
  })

  it('loads a source another one needs first, and notes unavailable ones', async () => {
    const r = await preloadUsageSource('s10', 7, 'emailsends')
    expect(calls.load).toEqual(['emailsends', 'automations'])
    expect(r.value.items).toEqual([{ id: 'a' }])
    expect((await preloadUsageSource('s10', 7, 'locations')).note).toBe('not available in this account')
  })

  it('throws when stopped and saves nothing', async () => {
    await expect(preloadUsageSource('s10', 7, 'automations', { shouldStop: () => true })).rejects.toMatchObject({ stopped: true })
    expect(await loadSaved('s10:7:automations')).toBeNull()
  })
})
