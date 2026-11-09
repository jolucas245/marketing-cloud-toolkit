// Contact journeys opened from a journey page's "Is a contact in this journey?" link (feedback #1088).
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { ref } from 'vue'

const api = vi.hoisted(() => ({ members: vi.fn(), history: vi.fn(), replace: vi.fn(), query: {} }))
vi.mock('@/composables/useStack.js', () => ({ useStack: () => ({ stack: ref('s13') }), whenStack: (fn) => fn() }))
vi.mock('vue-router', () => ({ useRoute: () => ({ path: '/contact-journeys', query: api.query }), useRouter: () => ({ push: () => {}, replace: api.replace }) }))
vi.mock('@/utils/contactJourneys.js', async (original) => ({ ...await original(), fetchContactMembership: (...a) => api.members(...a), fetchContactHistory: (...a) => api.history(...a) }))

async function page() {
  const { default: Page } = await import('../ContactJourneysPage.vue')
  const wrapper = mount(Page, { global: { stubs: { JourneyCanvas: true, DownloadMenu: true, StatusBadge: true } } })
  await flushPromises()
  return wrapper
}

describe('Contact journeys from a link', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    api.members.mockResolvedValue({ memberships: [{ contactKey: 'c1', definitionKey: 'welcome-key', version: 2 }, { contactKey: 'c1', definitionKey: 'other', version: 1 }], errors: [] })
    api.history.mockResolvedValue({ items: [], raw: [], total: 0 })
  })

  it('runs the search for the key within the linked journey and clears the URL', async () => {
    api.query = { key: 'c1', jid: 'J-ID', jkey: 'welcome-key', jname: 'Welcome', jversion: '2' }
    const wrapper = await page()
    expect(api.members).toHaveBeenCalledWith('s13', 'c1')
    expect(api.history).toHaveBeenCalledWith('s13', 'c1', { days: 30 })
    expect(api.replace).toHaveBeenCalledWith({ path: '/contact-journeys', query: {} })
    expect(wrapper.find('input[aria-label="Contact Key"]').element.value).toBe('c1')
    expect(wrapper.text()).toContain('Journey: Welcome')
    expect(wrapper.text()).toContain('welcome-key')
    expect(wrapper.text()).not.toContain('other')
    wrapper.unmount()
  })

  it('reads nothing without a key in the link', async () => {
    api.query = {}
    const wrapper = await page()
    expect(api.members).not.toHaveBeenCalled()
    wrapper.unmount()
  })
})
