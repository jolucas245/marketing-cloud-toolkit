import { beforeEach, describe, expect, it, vi } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { ref, defineComponent } from 'vue'

const api = vi.hoisted(() => ({ fetch: vi.fn(), email: vi.fn(), compile: vi.fn(), focus: vi.fn(), names: vi.fn() }))
vi.mock('@/composables/useStack.js', () => ({ useStack: () => ({ stack: ref('s13') }) }))
vi.mock('vue-router', () => ({ useRoute: () => ({ path: '/journeys/example', params: { id: 'example' }, query: {} }), useRouter: () => ({ push: () => {} }) }))
vi.mock('@/utils/journeys.js', async (original) => ({ ...await original(), fetchJourney: (...args) => api.fetch(...args), fetchJourneyEmailAsset: (...args) => api.email(...args), sendNames: (...args) => api.names(...args) }))
vi.mock('@/utils/emailCompiler.js', () => ({ compile: (...args) => api.compile(...args) }))

const Canvas = defineComponent({
  props: ['selected'], emits: ['select'],
  setup(_, { expose }) { expose({ focusActivity: api.focus }) },
  template: '<div><button data-email @click="$emit(\'select\', \'original-email\')">Welcome</button><button data-wait @click="$emit(\'select\', \'wait\')">Wait</button></div>',
})
const journey = {
  id: 'example', name: 'Example journey', version: 1,
  activities: [
    { key: 'original-email', type: 'EMAILV2', name: 'Welcome', configurationArguments: { triggeredSend: { emailId: 123, emailSubject: 'Hello', sendClassificationId: 'SC-1', senderProfileId: 'SP-1' } }, outcomes: [{ next: 'wait' }] },
    { key: 'wait', type: 'WAIT', name: 'Wait', configurationArguments: { waitDuration: 3, waitUnit: 'DAYS' }, outcomes: [] },
  ],
}
async function page() {
  const { default: Page } = await import('../JourneyDetailPage.vue')
  const wrapper = mount(Page, { global: { stubs: { JourneyCanvas: Canvas, ActivityCard: { props: ['description'], template: '<div>{{ description.title }} {{ description.typeLabel }} <p data-main>{{ description.main.map((r) => r.join(\': \')).join(\' | \') }}</p></div>' }, DownloadMenu: true, WatchButton: true, StatusBadge: true, RouterLink: true } } })
  await flushPromises()
  return wrapper
}

describe('Journey activity details and email preview', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    api.fetch.mockResolvedValue(journey)
    api.email.mockResolvedValue({ id: 123 })
    api.compile.mockReturnValue('<h1>Welcome preview</h1>')
    api.names.mockResolvedValue({ sendClassifications: new Map([['sc-1', { id: 'SC-1', name: 'Default Commercial' }]]), senderProfiles: new Map(), deliveryProfiles: new Map() })
  })

  it('names the send classification and labels an unknown profile as an ID (live test, 2026-11-07)', async () => {
    const wrapper = await page()
    expect(api.names).toHaveBeenCalledWith('s13')
    await wrapper.find('[data-email]').trigger('click')
    await flushPromises()
    const main = wrapper.find('[data-main]').text()
    expect(main).toContain('Send classification: Default Commercial')
    expect(main).toContain('Sender profile ID: SP-1')
    wrapper.unmount()
  })

  it('shows the IDs when the names cannot be read', async () => {
    api.names.mockRejectedValue(new Error('SFMC API error 401'))
    const wrapper = await page()
    await wrapper.find('[data-email]').trigger('click')
    await flushPromises()
    expect(wrapper.find('[data-main]').text()).toContain('Send classification ID: SC-1')
    wrapper.unmount()
  })

  it('opens the original activity configuration and a sandboxed email preview', async () => {
    const wrapper = await page()
    await wrapper.find('[data-email]').trigger('click')
    await flushPromises()
    expect(api.email).toHaveBeenCalledWith('s13', 123)
    expect(wrapper.find('aside').text()).toContain('Welcome')
    expect(wrapper.find('iframe').attributes()).toMatchObject({ sandbox: '', srcdoc: '<h1>Welcome preview</h1>' })
    await wrapper.find('[aria-label="Close activity details"]').trigger('click')
    await flushPromises()
    expect(wrapper.find('aside').exists()).toBe(false)
    expect(api.focus).toHaveBeenCalledWith('original-email')
    wrapper.unmount()
  })

  it('ignores a late email response after another activity is selected', async () => {
    let finish
    api.email.mockReturnValue(new Promise((resolve) => { finish = resolve }))
    const wrapper = await page()
    await wrapper.find('[data-email]').trigger('click')
    await wrapper.find('[data-wait]').trigger('click')
    finish({ id: 123 })
    await flushPromises()
    expect(wrapper.find('aside').text()).toContain('Wait')
    expect(wrapper.find('iframe').exists()).toBe(false)
    wrapper.unmount()
  })

  it('shows an error and retries loading the journey', async () => {
    api.fetch.mockRejectedValueOnce(new Error('Synthetic unavailable session'))
    const wrapper = await page()
    expect(wrapper.find('[role="alert"]').text()).toContain('Could not load')
    const retry = wrapper.findAll('button').find((button) => button.text() === 'Retry')
    await retry.trigger('click')
    await flushPromises()
    expect(wrapper.find('[role="alert"]').exists()).toBe(false)
    expect(wrapper.find('[data-email]').exists()).toBe(true)
    wrapper.unmount()
  })
})
