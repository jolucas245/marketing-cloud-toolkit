import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount } from '@vue/test-utils'
import { nextTick } from 'vue'

// Home's installed package secrets card has a close button (user, 2026-11-06). It uses
// the bar's dismissal, so closing it hides both until an expiry changes.
vi.mock('vue-router', () => ({ useRoute: () => ({ path: '/' }) }))
const stored = {}
globalThis.chrome = { storage: { local: { get: (k, cb) => cb({ [k]: stored[k] }), set: (o) => Object.assign(stored, o) } } }

const day = 24 * 3600 * 1000
const expired = { packageId: 'p1', name: 'Bell MuleSoft', expires: new Date(Date.now() - 3 * day).toISOString() }
const stubs = { global: { stubs: { RouterLink: { template: '<a><slot /></a>' } } } }

async function setup() {
  const { secretsState } = await import('@/composables/useSecretAlerts.js')
  Object.assign(secretsState, { stack: 's12', list: [expired], dismissed: {} })
  const { default: SecretAlerts } = await import('../SecretAlerts.vue')
  return { secretsState, SecretAlerts }
}

describe('SecretAlerts', () => {
  beforeEach(() => { for (const k of Object.keys(stored)) delete stored[k] })

  it('closes the Home card, and the bar with it, until the expiry changes', async () => {
    const { secretsState, SecretAlerts } = await setup()
    const home = mount(SecretAlerts, { props: { variant: 'home' }, ...stubs })
    const bar = mount(SecretAlerts, { props: { variant: 'bar' }, ...stubs })
    expect(home.text()).toContain('Bell MuleSoft')
    expect(bar.find('[data-secret-alert]').exists()).toBe(true)

    await home.find('[data-close-secret-alert]').trigger('click')
    expect(home.find('[data-secret-alert]').exists()).toBe(false)
    expect(bar.find('[data-secret-alert]').exists()).toBe(false)
    expect(Object.keys(stored.toolkit_secret_alerts_dismissed)).toEqual([`s12:p1:${expired.expires}`])

    // Renewed secret, still expiring soon: it alerts again.
    secretsState.list = [{ ...expired, expires: new Date(Date.now() + 2 * day).toISOString() }]
    await nextTick()
    expect(home.find('[data-secret-alert]').exists()).toBe(true)
  })
})

describe('SecretAlerts on Home with many secrets (live test, 2026-11-07)', () => {
  beforeEach(() => { for (const k of Object.keys(stored)) delete stored[k] })
  const many = (n) => Array.from({ length: n }, (_, i) => ({ packageId: `p${i}`, name: `Package ${i}`, expires: new Date(Date.now() - (i + 1) * day).toISOString() }))

  it('lists the first 5 and says how many more are on Installed Packages', async () => {
    const { secretsState, SecretAlerts } = await setup()
    secretsState.list = many(38)
    await nextTick()
    const home = mount(SecretAlerts, { props: { variant: 'home' }, ...stubs })
    expect(home.findAll('li')).toHaveLength(5)
    expect(home.get('[data-secret-more]').text()).toBe('33 more: see all installed package secrets')
    expect(home.text()).toContain('38 installed package secrets expired or expiring')
  })

  it('lists all of a short list', async () => {
    const { secretsState, SecretAlerts } = await setup()
    secretsState.list = many(2)
    await nextTick()
    const home = mount(SecretAlerts, { props: { variant: 'home' }, ...stubs })
    expect(home.findAll('li')).toHaveLength(2)
    expect(home.get('[data-secret-more]').text()).toBe('All installed package secrets')
  })
})
