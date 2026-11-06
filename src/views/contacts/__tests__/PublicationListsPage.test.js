import { describe, it, expect, vi } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { ref } from 'vue'

// Feedback #1080: the first visit starts the count and says the user will be told.
let release
vi.mock('@/composables/useStack.js', () => ({ useStack: () => ({ stack: ref('s13') }), whenStack: (fn) => fn() }))
vi.mock('@/composables/useToast.js', () => ({ showToast: () => {} }))
vi.mock('@/utils/sfmcApi.js', async (orig) => ({
  ...(await orig()),
  fetchCurrentBU: async () => ({ name: 'Chatters', accountId: 7 }),
  getOrCreateDEFolder: async () => 1,
  getOrCreateQAFolder: async () => 2,
  createTargetDE: async (s, p) => ({ id: 'd', customerKey: 'K', name: p.name }),
  createQueryActivity: async () => ({ queryDefinitionId: 'q' }),
  startQueryActivity: async () => {},
  getQueryActivityStatus: async () => { await new Promise((r) => { release = r }); return { isRunning: false } },
  fetchDERows: async () => ({ items: [{ values: { listname: 'News', status: 'active', subscribercount: 5 } }] }),
}))

let store = {}
global.chrome = { storage: { local: {
  get: (k, cb) => cb(k === null ? { ...store } : { [k]: store[k] }),
  set: (items, cb) => { Object.assign(store, items); cb?.() },
} } }

describe('Publication Lists page (feedback #1080)', () => {
  it('starts on the first visit, says it will tell the user, then shows the counts', async () => {
    vi.useFakeTimers()
    const { default: Page } = await import('../PublicationListsPage.vue')
    const w = mount(Page)
    await vi.runAllTimersAsync()
    await flushPromises()
    expect(w.find('[data-pl-running]').text()).toContain('will let you know once the data is available')
    for (let i = 0; i < 5 && release; i++) { const r = release; release = null; r(); await vi.runAllTimersAsync(); await flushPromises() }
    vi.useRealTimers()
    expect(w.find('[data-pl-running]').exists()).toBe(false)
    expect(w.text()).toContain('1 list, counted')
    expect(w.text()).toContain('News')
  })
})
