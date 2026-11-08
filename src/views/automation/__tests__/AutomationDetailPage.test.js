import { describe, it, expect, vi } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { ref, defineComponent, h } from 'vue'
import { createRouter, createMemoryHistory, RouterView } from 'vue-router'

// Opened by REST GUID, the page switches to the list ID. It used to stay on "Loading the
// automation" for good: router.replace({ ...route, params }) kept the route's own path,
// so Vue Router ignored the new params (live test, 2026-11-08).
const GUID = '6ffd69f0-a04e-48d9-9822-930ff4e3e474'
const LIST_ID = 'OEduOWIwNmcyVWlZSXBNUDlPUGtkQToyNTow'
const fetchAutomation = vi.fn(async () => ({ details: { id: GUID, name: 'Zip multiple files', steps: [] }, notifications: [] }))

vi.mock('@/composables/useStack.js', () => ({ useStack: () => ({ stack: ref('s10') }), whenStack: () => {} }))
vi.mock('@/composables/useUsage.js', () => ({ useUsage: () => ({}) }))
vi.mock('@/composables/useAi.js', () => ({ useAi: () => ({ available: ref(false), shown: ref(false) }) }))
vi.mock('@/utils/automationApi.js', () => ({
  fetchAutomation: (...a) => fetchAutomation(...a),
  fetchActivityDetails: vi.fn(),
  fetchAutomationStatus: vi.fn(async () => ({})),
  fetchLatestRun: vi.fn(async () => null),
  isAutomationGuid: (id) => /^[0-9a-f-]{36}$/i.test(id),
  legacyAutomationId: vi.fn(async () => LIST_ID),
}))
vi.mock('@/utils/localCache.js', () => ({
  cached: vi.fn(), cacheKey: (...p) => p.join(':'), cacheScope: async () => 'scope',
  readCache: async () => null, writeCache: async () => ({ savedAt: 1 }), savedAgo: () => 'now',
}))

describe('Automation detail opened by REST GUID', () => {
  it('moves to the list ID and loads the automation', async () => {
    const { default: Page } = await import('../AutomationDetailPage.vue')
    const router = createRouter({ history: createMemoryHistory(), routes: [{ path: '/automations/:id', component: Page }] })
    await router.push(`/automations/${GUID}?from=entry`)
    const w = mount(defineComponent({ render: () => h(RouterView) }), {
      global: { plugins: [router], stubs: { AutomationCanvas: true, RunHistory: true, WatchButton: true, DownloadMenu: true, PrevNext: true, AiButton: true, AskAiDialog: true } },
    })
    for (let i = 0; i < 5; i++) await flushPromises()
    expect(router.currentRoute.value.fullPath).toBe(`/automations/${LIST_ID}?from=entry`)
    expect(fetchAutomation.mock.calls.map((c) => c[1])).toEqual([GUID, LIST_ID])
    expect(w.text()).not.toContain('Loading the automation')
    expect(w.text()).toContain('Zip multiple files')
  })
})
