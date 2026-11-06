import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { ref } from 'vue'

// Customize Home (user, 2026-11-06): sections and cards can be hidden, shown and
// reordered; the layout is saved in chrome.storage.local and nothing is sent.
const stored = {}
const listeners = []
globalThis.chrome = {
  storage: {
    local: {
      get: (k, cb) => cb(k == null ? { ...stored } : { [k]: stored[k] }),
      set: (o) => { Object.assign(stored, o); listeners.forEach((l) => l(Object.fromEntries(Object.entries(o).map(([key, v]) => [key, { newValue: v }])), 'local')) },
    },
    onChanged: { addListener: (l) => listeners.push(l), removeListener: () => {} },
  },
}
vi.mock('vue-router', () => ({ useRouter: () => ({ push: vi.fn() }), useRoute: () => ({ path: '/' }) }))
vi.mock('@/composables/useStack.js', () => ({ useStack: () => ({ stack: ref('s1'), state: ref('connected') }), whenStack: () => {} }))
vi.mock('@/composables/useAi.js', () => ({ useAi: () => ({ shown: ref(true) }) }))
vi.mock('@/components/shell/QueryStudioNotice.vue', () => ({ default: { template: '<div />' } }))
vi.mock('@/components/shell/SecretAlerts.vue', () => ({ default: { template: '<div />' } }))

const RouterLink = { props: ['to'], template: '<a :href="String(to)"><slot /></a>' }

async function mountHome() {
  const { default: Home } = await import('../HomePage.vue')
  const w = mount(Home, { global: { stubs: { RouterLink, ReportErrorButton: true } } })
  await flushPromises()
  return w
}
const startLabels = (w) => w.findAll('h2').filter((h) => h.text() === 'Good places to start').length
  ? w.find('h2 + div').findAll('a .font-semibold').map((e) => e.text()) : []
const glanceTitles = (w) => w.findAll('a').filter((a) => ['/automation-overview', '/journey-overview'].includes(a.attributes('href'))).map((a) => a.find('.text-muted-foreground').text())

describe('Customize Home', () => {
  beforeEach(() => { for (const k of Object.keys(stored)) delete stored[k]; listeners.length = 0 })

  it('shows every section and card by default, with no arrange controls', async () => {
    const w = await mountHome()
    expect(glanceTitles(w)).toEqual(['Automations', 'Journeys', 'Needs a look', 'Watched here'])
    expect(startLabels(w)[0]).toBe('Run a query')
    expect(w.find('[data-home-block]').exists()).toBe(false)
    expect(w.find('[data-customize-home]').text()).toBe('Customize Home')
  })

  it('hides a card and moves another, saves the layout, and keeps it after Done', async () => {
    const w = await mountHome()
    await w.find('[data-customize-home]').trigger('click')
    expect(w.find('[data-customize-bar]').exists()).toBe(true)
    await w.find('[data-home-block="glance:journeys"] [data-toggle-hidden]').trigger('click')
    await w.find('[data-home-block="glance:watched"] [data-move-earlier]').trigger('click')
    await flushPromises()
    // While customizing, a hidden card stays on screen, marked hidden.
    expect(w.find('[data-home-block="glance:journeys"]').attributes('data-hidden')).toBe('true')
    expect(stored.toolkit_homeLayout).toEqual({
      order: expect.objectContaining({ glance: ['automations', 'journeys', 'watched', 'needsLook'] }),
      hidden: ['glance:journeys'],
    })

    await w.find('[data-customize-done]').trigger('click')
    expect(glanceTitles(w)).toEqual(['Automations', 'Watched here', 'Needs a look'])
    expect(w.find('[data-customize-home]').text()).toBe('Customize Home · 1 hidden')
  })

  it('reads a saved layout, hides a whole section, and Reset brings back the default', async () => {
    stored.toolkit_homeLayout = { order: { starts: ['whereUsed', 'runQuery', 'buildQuery', 'contactJourneys', 'emailValidation', 'automationList'] }, hidden: ['sections:glance'] }
    const w = await mountHome()
    expect(glanceTitles(w)).toEqual([])
    expect(startLabels(w)[0]).toBe('Where used')

    await w.find('[data-customize-home]').trigger('click')
    // A card's links do nothing while customizing.
    expect(w.find('[data-home-block="starts:whereUsed"] [inert]').exists()).toBe(true)
    await w.find('[data-reset-home]').trigger('click')
    await flushPromises()
    await w.find('[data-customize-done]').trigger('click')
    expect(glanceTitles(w)).toEqual(['Automations', 'Journeys', 'Needs a look', 'Watched here'])
    expect(startLabels(w)[0]).toBe('Run a query')
    expect(stored.toolkit_homeLayout).toBe(null)
  })

  it('reorders by dragging a card onto another of the same section', async () => {
    const w = await mountHome()
    await w.find('[data-customize-home]').trigger('click')
    const dt = { setData: () => {}, effectAllowed: '' }
    await w.find('[data-home-block="starts:automationList"]').trigger('dragstart', { dataTransfer: dt })
    await w.find('[data-home-block="starts:runQuery"]').trigger('dragover', { dataTransfer: dt })
    await w.find('[data-home-block="starts:runQuery"]').trigger('drop', { dataTransfer: dt })
    await flushPromises()
    expect(stored.toolkit_homeLayout.order.starts.slice(0, 2)).toEqual(['automationList', 'runQuery'])
    // A card can't be dropped into another section.
    await w.find('[data-home-block="glance:watched"]').trigger('dragstart', { dataTransfer: dt })
    await w.find('[data-home-block="starts:runQuery"]').trigger('drop', { dataTransfer: dt })
    expect(stored.toolkit_homeLayout.order.glance).toEqual(['automations', 'journeys', 'needsLook', 'watched'])
  })
})
