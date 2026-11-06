import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { ref, defineComponent } from 'vue'
import { createRouter, createMemoryHistory } from 'vue-router'

// Setup > Installed Packages (user, 2026-11-05; renamed from Account, feedback #1078):
// package secrets, endpoints and Automation Studio access.
const secrets = vi.fn()
const endpoints = vi.fn()
const activityTypes = vi.fn()

vi.mock('@/composables/useStack.js', () => ({ useStack: () => ({ stack: ref('s12') }), whenStack: (fn) => fn() }))
vi.mock('@/utils/messaging.js', () => ({ sendToBackground: async () => ({ ok: true }) }))
vi.mock('@/utils/sfmcLinks.js', () => ({ openInSfmc: () => {} }))
vi.mock('@/utils/setupApi.js', () => ({
  fetchSecretExpirations: (...a) => secrets(...a),
  fetchTenantEndpoints: (...a) => endpoints(...a),
  fetchActivityTypeAccess: (...a) => activityTypes(...a),
}))

const day = 86400000
const iso = (ms) => new Date(Date.now() + ms).toISOString()

describe('Installed Packages page and secret alerts (user, 2026-11-05)', () => {
  beforeEach(async () => {
    vi.resetModules()
    secrets.mockReset().mockResolvedValue([
      { packageId: 'p1', name: 'CloudPage to Journey API', expires: iso(3 * day) },
      { packageId: 'p2', name: 'Cart Abandonment', expires: iso(60 * day) },
    ])
    endpoints.mockReset().mockResolvedValue({ tenant: 'mctenant-abc', items: [{ type: 'restAuth', label: 'REST authentication (OAuth token)', url: 'https://mctenant-abc.auth.marketingcloudapis.com' }] })
    activityTypes.mockReset().mockResolvedValue([{ id: 300, name: 'Query', access: true, granted: ['Create', 'Start'], denied: ['Move'], listsPermissions: true }])
  })

  it('lists endpoints, every secret and activity access', async () => {
    const { default: Page } = await import('../InstalledPackagesPage.vue')
    const w = mount(Page)
    await flushPromises()
    expect(w.text()).toContain('mctenant-abc')
    expect(w.text()).toContain('https://mctenant-abc.auth.marketingcloudapis.com')
    const rows = w.findAll('[data-secret-row]')
    expect(rows.map((r) => r.text().includes('CloudPage to Journey API') || r.text().includes('Cart Abandonment'))).toEqual([true, true])
    expect(rows[0].text()).toMatch(/expires in [23] days/)
    const type = w.find('[data-activity-type]')
    expect(type.text()).toContain('Query')
    expect(type.text()).toContain('Start')
    expect(type.text()).toContain('Move')
  })

  // Home's card closes too (user, 2026-11-06): one dismissal hides the bar and the Home card.
  it('alerts only about the secret expiring within a week; dismissing hides the bar and the Home card', async () => {
    const { refreshSecrets } = await import('@/composables/useSecretAlerts.js')
    await refreshSecrets('s12', { force: true })
    const { default: Alerts } = await import('@/components/shell/SecretAlerts.vue')
    const stubs = { global: { stubs: { RouterLink: true } } }
    const bar = mount(Alerts, { props: { variant: 'bar' }, ...stubs })
    const home = mount(Alerts, { props: { variant: 'home' }, ...stubs })
    expect(bar.text()).toContain('CloudPage to Journey API')
    expect(bar.text()).not.toContain('Cart Abandonment')
    expect(home.text()).toContain('1 installed package secret expiring within a week')
    await bar.findAll('button').find((b) => b.text().includes('Dismiss')).trigger('click')
    expect(bar.find('[data-secret-alert]').exists()).toBe(false)
    expect(home.find('[data-secret-alert]').exists()).toBe(false)
  })

  it('shows no alert when the user cannot read installed packages', async () => {
    secrets.mockReset().mockRejectedValue(new Error('SFMC API error 403: Forbidden'))
    const { refreshSecrets, secretsState } = await import('@/composables/useSecretAlerts.js')
    await refreshSecrets('s12', { force: true })
    expect(secretsState.error).toContain('403')
    const { default: Alerts } = await import('@/components/shell/SecretAlerts.vue')
    expect(mount(Alerts, { props: { variant: 'bar' }, global: { stubs: { RouterLink: true } } }).find('[data-secret-alert]').exists()).toBe(false)
  })

  // Feedback #1079: on the page the alert links to, Details went nowhere.
  it('the alert links to Installed Packages, and drops Details once there', async () => {
    const { refreshSecrets } = await import('@/composables/useSecretAlerts.js')
    await refreshSecrets('s12', { force: true })
    const { default: Alerts } = await import('@/components/shell/SecretAlerts.vue')
    const Blank = defineComponent({ render: () => null })
    const router = createRouter({ history: createMemoryHistory(), routes: [{ path: '/home', component: Blank }, { path: '/installed-packages', component: Blank }] })
    router.push('/home')
    await router.isReady()
    const bar = mount(Alerts, { props: { variant: 'bar' }, global: { plugins: [router] } })
    const details = bar.findAll('a').find((a) => a.text() === 'Details')
    expect(details.attributes('href')).toBe('/installed-packages')
    await details.trigger('click')
    await flushPromises()
    expect(router.currentRoute.value.path).toBe('/installed-packages')
    expect(bar.find('[data-secret-alert]').exists()).toBe(true)
    expect(bar.findAll('a').some((a) => a.text() === 'Details')).toBe(false)
  })
})
