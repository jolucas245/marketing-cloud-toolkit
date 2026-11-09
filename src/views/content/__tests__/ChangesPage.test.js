import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { ref } from 'vue'

// Content > Changes (feedback #1087) with a fake SFMC: Content Builder through sfmcFetch,
// automations and journeys through their list calls.
const api = vi.hoisted(() => ({ fetch: vi.fn(), automations: vi.fn(), journeys: vi.fn(), saved: [] }))
vi.mock('@/composables/useStack.js', () => ({ useStack: () => ({ stack: ref('s13') }), whenStack: (fn) => fn() }))
vi.mock('@/utils/sfmcApi.js', () => ({ sfmcFetch: (...a) => api.fetch(...a) }))
vi.mock('@/utils/automationApi.js', () => ({ searchAutomations: (...a) => api.automations(...a), loadMoreAutomations: vi.fn(async () => ({ entries: [] })) }))
vi.mock('@/utils/journeys.js', () => ({ searchJourneys: (...a) => api.journeys(...a), JOURNEY_PAGE_SIZE: 50 }))
vi.mock('@/utils/messaging.js', () => ({ sendToBackground: async () => ({ ok: true }) }))
vi.mock('@/utils/download.js', () => ({ saveTextFile: (...a) => { api.saved.push(a); return true } }))

const recent = new Date(Date.now() - 2 * 86400000).toISOString()
const old = new Date(Date.now() - 60 * 86400000).toISOString()
const ASSETS = [
  { id: 1, name: 'Welcome email', customerKey: 'wk', assetType: { id: 208, displayName: 'HTML Email' }, category: { name: 'Promos' }, createdDate: old, createdBy: { name: 'Bo Chan', email: 'bo@example.com' }, modifiedDate: recent, modifiedBy: { name: 'Ann Lee', email: 'ann@example.com' } },
  { id: 2, name: 'Footer block', assetType: { id: 197, displayName: 'Free Form' }, category: { name: 'Blocks' }, createdDate: recent, createdBy: { name: 'Bo Chan', email: 'bo@example.com' }, modifiedDate: recent, modifiedBy: { name: 'Bo Chan', email: 'bo@example.com' } },
]

async function mountPage() {
  const { default: Page } = await import('../ChangesPage.vue')
  return mount(Page, { global: { stubs: { DownloadMenu: true, RouterLink: { props: ['to'], template: '<a :data-to="JSON.stringify(to)"><slot /></a>' } } } })
}
const names = (w) => w.findAll('tbody tr').map((r) => r.findAll('td')[1]?.text()).filter(Boolean)

describe('ChangesPage (feedback #1087)', () => {
  beforeEach(() => {
    api.fetch.mockReset(); api.automations.mockReset(); api.journeys.mockReset(); api.saved.length = 0
    try { localStorage.clear() } catch { /* none */ }
    api.fetch.mockResolvedValue({ count: 2, items: ASSETS })
    api.automations.mockResolvedValue({ entries: [{ id: 'a1', name: 'Nightly import', modifiedDate: recent }, { id: 'a2', name: 'Old automation', modifiedDate: old }], total: 2 })
    api.journeys.mockResolvedValue({ items: [{ id: 'j1', name: 'Welcome Journey', version: 2, modifiedDate: recent, createdDate: old, modifiedBy: 555, createdBy: 555 }], total: 1 })
  })

  it('loads nothing until Find changes', async () => {
    const w = await mountPage()
    await flushPromises()
    expect(api.fetch).not.toHaveBeenCalled()
    expect(api.automations).not.toHaveBeenCalled()
    expect(w.find('[data-changes-period]').element.value).toBe('7')
    expect(w.find('[data-changes-what]').element.value).toBe('modified')
  })

  it('finds changes in every source, newest first, with Open links', async () => {
    const w = await mountPage()
    await w.find('form').trigger('submit')
    await flushPromises()
    const [url, method, body] = api.fetch.mock.calls[0]
    expect(url).toBe('https://content-builder.s13.marketingcloudapps.com/fuelapi/asset/v1/content/assets/query')
    expect(method).toBe('POST')
    expect(body.query.property).toBe('modifiedDate')
    expect(names(w).sort()).toEqual(['Footer block', 'Nightly import', 'Welcome Journey', 'Welcome email'])
    expect(w.text()).not.toContain('Old automation')
    const links = w.findAll('[data-changes-open]').map((a) => JSON.parse(a.attributes('data-to')))
    expect(links).toEqual(expect.arrayContaining([{ path: '/emails', query: { q: 'wk' } }, { path: '/automations/a1' }, { path: '/journeys/j1', query: { version: '2' } }]))
    expect(w.find('[data-changes-summary]').text()).toContain('matches journeys by ID')
    expect(w.text()).toContain('User ID 555')
  })

  it('filters by person text and by a picked person', async () => {
    const w = await mountPage()
    await w.find('[data-changes-source="automations"]').setValue(false)
    await w.find('[data-changes-source="journeys"]').setValue(false)
    await w.find('form').trigger('submit')
    await flushPromises()
    await w.find('[data-changes-person]').setValue('ANN')
    expect(names(w)).toEqual(['Welcome email'])
    await w.find('[data-changes-person]').setValue('')
    const options = w.findAll('[data-changes-people] option').map((o) => o.text())
    expect(options).toEqual(['Everyone (2)', 'Ann Lee (ann@example.com)', 'Bo Chan (bo@example.com)'])
    await w.find('[data-changes-people]').setValue('email:bo@example.com')
    expect(names(w)).toEqual(['Footer block'])
  })

  it('created matches createdDate on the server and the creator here', async () => {
    const w = await mountPage()
    await w.find('[data-changes-source="automations"]').setValue(false)
    await w.find('[data-changes-source="journeys"]').setValue(false)
    await w.find('[data-changes-what]').setValue('created')
    await w.find('form').trigger('submit')
    await flushPromises()
    expect(api.fetch.mock.calls[0][2].query.property).toBe('createdDate')
    await w.find('[data-changes-person]').setValue('ann')
    expect(names(w)).toEqual([])
  })

  it('shows one failing source and keeps the others', async () => {
    api.automations.mockRejectedValue(new Error('SFMC API error 500: boom'))
    const w = await mountPage()
    await w.find('form').trigger('submit')
    await flushPromises()
    expect(w.find('[data-changes-status="automations"]').text()).toContain('boom')
    expect(names(w)).toContain('Welcome email')
    expect(names(w)).toContain('Welcome Journey')
  })

  it('needs a From date for a custom period, and downloads CSV', async () => {
    const w = await mountPage()
    await w.find('[data-changes-period]').setValue('custom')
    await w.find('form').trigger('submit')
    await flushPromises()
    expect(w.find('[data-changes-form-error]').text()).toBe('Pick a From date.')
    expect(api.fetch).not.toHaveBeenCalled()
    const d = new Date(Date.now() - 90 * 86400000)
    const from = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
    await w.find('[data-changes-from]').setValue(from)
    await w.find('form').trigger('submit')
    await flushPromises()
    expect(api.fetch.mock.calls[0][2].query.value).toBe(new Date(d.getFullYear(), d.getMonth(), d.getDate()).toISOString())
    await w.find('[data-changes-csv]').trigger('click')
    expect(api.saved[0][1]).toMatch(/^changes-\d{4}-\d{2}-\d{2}\.csv$/)
    expect(api.saved[0][0].split('\r\n')).toHaveLength(6) // header, 2 assets, 2 automations (both in the last 90 days), 1 journey
  })
})
