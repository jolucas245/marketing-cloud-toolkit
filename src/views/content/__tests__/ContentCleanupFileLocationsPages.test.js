import { describe, it, expect, vi } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { ref } from 'vue'

// Content > Clean-up report and Setup > File locations (API ideas 18 and 20): read only.
vi.mock('vue-router', () => ({ useRoute: () => ({ path: '/', query: {} }), useRouter: () => ({ push() {}, replace() {} }) }))
vi.mock('@/composables/useStack.js', () => ({ useStack: () => ({ stack: ref('s10') }), whenStack: (fn) => fn() }))
const calls = []
vi.mock('@/utils/sfmcApi.js', async (orig) => ({
  ...(await orig()),
  fetchCurrentBU: async () => ({ name: 'BU', accountId: 123 }),
  sfmcFetch: async (url, method, body) => {
    calls.push([method, url])
    if (url.includes('/assets/query')) {
      return { count: 4, items: [
        { id: 1, name: 'Hero', assetType: { id: 28, name: 'png', displayName: 'Image' }, fileProperties: { fileSize: 5 * 1024 * 1024 }, modifiedDate: '2026-11-01T00:00:00Z' },
        { id: 2, name: 'Old footer', assetType: { id: 197, name: 'htmlblock', displayName: 'HTML Block' }, modifiedDate: '2020-01-01T00:00:00Z' },
        { id: 3, name: 'Old footer', assetType: { id: 197, name: 'htmlblock', displayName: 'HTML Block' }, modifiedDate: '2026-10-01T00:00:00Z' },
        { id: 4, name: 'Welcome copy', assetType: { id: 208, name: 'htmlemail', displayName: 'HTML Email' }, modifiedDate: '2026-10-01T00:00:00Z' },
      ] }
    }
    if (url.includes('/ftplocations/')) return { items: [{ id: 'L1', name: 'Partner SFTP', relPath: '/in', locationUrl: 'sftp://bob:secretpw@partner.example.com', password: 'hunter2' }] }
    throw new Error(`unexpected ${url}`)
  },
}))

describe('Clean-up report page', () => {
  it('reads only after a click, then shows each part without delete buttons', async () => {
    const { default: Page } = await import('../ContentCleanupPage.vue')
    const w = mount(Page)
    await flushPromises()
    expect(calls.some(([, u]) => u.includes('/assets/query'))).toBe(false)
    expect(w.find('[data-unused-note]').text()).toMatch(/does not say whether an item is unused/)
    await w.find('[data-read]').trigger('click')
    await flushPromises()
    expect(calls.filter(([, u]) => u.includes('/assets/query')).every(([m]) => m === 'POST')).toBe(true)
    expect(w.text()).toContain('HTML Block')
    await w.find('[data-cleanup-tab="largest"]').trigger('click')
    expect(w.text()).toContain('Hero')
    expect(w.text()).toContain('5.0 MB')
    await w.find('[data-cleanup-tab="stale"]').trigger('click')
    expect(w.text()).toContain('Old footer')
    expect(w.find('[data-cb-link]').attributes('href')).toBe('https://mc.s10.exacttarget.com/cloud/#app/Content%20Builder')
    await w.find('[data-cleanup-tab="duplicates"]').trigger('click')
    expect(w.text()).toContain('Old footer (2)')
    expect(w.text()).toContain('Welcome copy')
    expect(w.findAll('button').some((b) => /delete|move/i.test(b.text()))).toBe(false)
  }, 30000)
})

describe('File locations page', () => {
  it('lists locations without passwords and with the activity finder', async () => {
    const { default: Page } = await import('../../setup/FileLocationsPage.vue')
    const w = mount(Page)
    await flushPromises()
    expect(w.text()).toContain('Partner SFTP')
    expect(w.text()).toContain('External SFTP')
    expect(w.text()).toContain('sftp://partner.example.com')
    await w.find('[data-location="L1"] button').trigger('click')
    expect(w.html()).not.toMatch(/hunter2|secretpw|bob:/)
    expect(w.find('[data-find-activities]').exists()).toBe(true)
    expect(calls.filter(([, u]) => u.includes('ftplocations')).every(([m]) => m === 'GET')).toBe(true)
  }, 30000)
})
