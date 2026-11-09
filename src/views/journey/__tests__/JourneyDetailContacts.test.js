// Journey page: "Is a contact in this journey?" (feedback #1088) and Contact paths (#1089).
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { ref, defineComponent } from 'vue'
import { parseHistoryItem } from '@/utils/contactJourneys.js'

const api = vi.hoisted(() => ({ fetch: vi.fn(), names: vi.fn(), history: vi.fn(), members: vi.fn(), contactHistory: vi.fn(), push: vi.fn() }))
vi.mock('@/composables/useStack.js', () => ({ useStack: () => ({ stack: ref('s13') }) }))
vi.mock('vue-router', () => ({ useRoute: () => ({ path: '/journeys/example', params: { id: 'example' }, query: {} }), useRouter: () => ({ push: api.push }) }))
vi.mock('@/utils/journeys.js', async (original) => ({ ...await original(), fetchJourney: (...args) => api.fetch(...args), sendNames: (...args) => api.names(...args), searchJourneys: async () => ({ items: [] }) }))
vi.mock('@/utils/journeyPaths.js', async (original) => ({ ...await original(), fetchJourneyHistory: (...args) => api.history(...args), fetchMembershipMany: (...args) => api.members(...args) }))
vi.mock('@/utils/contactJourneys.js', async (original) => ({ ...await original(), fetchContactHistory: (...args) => api.contactHistory(...args) }))

const Canvas = defineComponent({
  props: ['selected', 'counts'], emits: ['select'],
  template: '<div data-canvas-counts>{{ counts ? `entries ${counts.entries}` : "none" }}</div>',
})
const journey = {
  id: 'example', key: 'example-key', name: 'Example journey', version: 1,
  activities: [
    { id: 'A1', key: 'mail', type: 'EMAILV2', name: 'Welcome', outcomes: [{ next: 'wait' }] },
    { id: 'A2', key: 'wait', type: 'WAIT', name: 'Wait', configurationArguments: { waitDuration: 3, waitUnit: 'DAYS' }, outcomes: [] },
  ],
}
const row = (contactKey, activityId, t, extra = {}) => ({ ...parseHistoryItem({ definitionId: 'example', activityId, activityType: activityId ? 'EMAILV2' : 'Trigger', transactionTime: `2026-11-0${t}T00:00:00Z`, status: 'Complete', ...extra }), contactKey })

async function page() {
  const { default: Page } = await import('../JourneyDetailPage.vue')
  const wrapper = mount(Page, { global: { stubs: { JourneyCanvas: Canvas, DownloadMenu: true, WatchButton: true, StatusBadge: true, RouterLink: { props: ['to'], template: '<a :data-to="JSON.stringify(to)"><slot /></a>' }, AiButton: true } } })
  await flushPromises()
  return wrapper
}
const noReads = () => {
  expect(api.history).not.toHaveBeenCalled()
  expect(api.members).not.toHaveBeenCalled()
  expect(api.contactHistory).not.toHaveBeenCalled()
}

describe('Journey page: contacts', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    api.fetch.mockResolvedValue(journey)
    api.names.mockResolvedValue(null)
  })

  it('reads nothing about contacts until asked, even with the panels open', async () => {
    const wrapper = await page()
    noReads()
    await wrapper.find('[data-open-contact-paths]').trigger('click')
    await wrapper.find('[data-open-contact-check]').trigger('click')
    await flushPromises()
    noReads()
    expect(wrapper.find('[data-canvas-counts]').text()).toBe('none')
    wrapper.unmount()
  })

  it('shows contact paths on the canvas for the chosen period, and Clear removes them', async () => {
    api.history.mockImplementation(async (_stack, _j, opts) => {
      opts.onProgress({ read: 3, total: 3, kept: 3 })
      return { items: [row('c1', '', 1), row('c1', 'A1', 2), row('c1', 'A2', 3)], read: 3, total: 3, capped: false, searchKey: 'example-key' }
    })
    const wrapper = await page()
    await wrapper.find('[data-open-contact-paths]').trigger('click')
    await wrapper.find('[data-paths-period]').setValue('30')
    await wrapper.find('[data-contact-paths] form').trigger('submit')
    await flushPromises()
    expect(api.history).toHaveBeenCalledTimes(1)
    const [stack, j, opts] = api.history.mock.calls[0]
    expect(stack).toBe('s13')
    expect(j.key).toBe('example-key')
    expect(new Date(opts.end) - new Date(opts.start)).toBe(30 * 86400000)
    expect(wrapper.find('[data-canvas-counts]').text()).toBe('entries 1')
    expect(wrapper.find('[data-paths-summary]').text()).toContain('Last 30 days: 1 contact entry by 1 contact')
    expect(wrapper.find('[data-paths-table]').text()).toContain('Welcome')
    expect(wrapper.find('[data-paths-capped]').exists()).toBe(false)
    await wrapper.find('[data-paths-clear]').trigger('click')
    expect(wrapper.find('[data-canvas-counts]').text()).toBe('none')
    expect(wrapper.find('[data-paths-summary]').exists()).toBe(false)
    wrapper.unmount()
  })

  it('says when the read stopped at the cap', async () => {
    api.history.mockResolvedValue({ items: [row('c1', 'A1', 2)], read: 5000, total: 9000, capped: true, searchKey: '' })
    const wrapper = await page()
    await wrapper.find('[data-open-contact-paths]').trigger('click')
    await wrapper.find('[data-contact-paths] form').trigger('submit')
    await flushPromises()
    expect(wrapper.find('[data-paths-capped]').text()).toContain('5,000 history rows of 9,000')
    wrapper.unmount()
  })

  it('explains a refused whole-journey search and offers the data-view send counts', async () => {
    api.history.mockRejectedValue(Object.assign(new Error('Journey Builder did not answer a history search without contact keys.'), { code: 'HISTORY_SEARCH_REFUSED' }))
    const wrapper = await page()
    await wrapper.find('[data-open-contact-paths]').trigger('click')
    await wrapper.find('[data-contact-paths] form').trigger('submit')
    await flushPromises()
    expect(wrapper.find('[data-paths-error]').text()).toContain('without contact keys')
    expect(wrapper.find('[data-paths-error]').text()).toContain('data views')
    expect(wrapper.find('[data-canvas-counts]').text()).toBe('none')
    await wrapper.find('[data-paths-sends]').trigger('click')
    expect(api.push).toHaveBeenCalledWith({ path: '/queries/workspace', query: { sql: expect.stringContaining("j.JourneyName = 'Example journey'") } })
    wrapper.unmount()
  })

  it('checks contact keys against this journey only and links to Contact journeys', async () => {
    api.members.mockResolvedValue({ memberships: [{ contactKey: 'c1', definitionKey: 'example-key', version: 1 }, { contactKey: 'c2', definitionKey: 'another', version: 4 }], errors: [] })
    api.contactHistory.mockImplementation(async (_s, key) => ({ items: key === 'c1' ? [row('c1', '', 1), row('c1', 'A1', 2)] : [row('c2', 'Z', 2, { definitionId: 'another' })] }))
    const wrapper = await page()
    await wrapper.find('[data-open-contact-check]').trigger('click')
    await wrapper.find('[data-check-keys]').setValue('c1\nc2, c1')
    await wrapper.find('[data-contact-check] form').trigger('submit')
    await flushPromises()
    expect(api.members).toHaveBeenCalledWith('s13', ['c1', 'c2'])
    expect(api.contactHistory).toHaveBeenCalledTimes(2)
    const r1 = wrapper.find('[data-check-row="c1"]')
    expect(r1.find('[data-in-now]').text()).toBe('Yes')
    expect(r1.find('[data-last-step]').text()).toContain('Welcome')
    expect(JSON.parse(r1.find('[data-check-link]').attributes('data-to'))).toMatchObject({ path: '/contact-journeys', query: { key: 'c1', jkey: 'example-key', jid: 'example' } })
    const r2 = wrapper.find('[data-check-row="c2"]')
    expect(r2.find('[data-in-now]').text()).toBe('No')
    expect(r2.find('[data-last-step]').text()).toContain('No steps in this journey')
    wrapper.unmount()
  })

  it('refuses more than 25 keys without reading', async () => {
    const wrapper = await page()
    await wrapper.find('[data-open-contact-check]').trigger('click')
    await wrapper.find('[data-check-keys]').setValue(Array.from({ length: 26 }, (_, i) => `k${i}`).join('\n'))
    expect(wrapper.find('[data-check-run]').attributes('disabled')).toBeDefined()
    await wrapper.find('[data-contact-check] form').trigger('submit')
    await flushPromises()
    noReads()
    wrapper.unmount()
  })
})
