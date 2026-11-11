import { describe, it, expect, vi } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { ref, reactive } from 'vue'

// Recycle bin and Data model pages (user, 2026-11-10): read only, with links into SFMC.
const route = reactive({ path: '/recycle-bin', query: { tab: 'content', type: 'emails' } })
vi.mock('vue-router', () => ({ useRoute: () => route, useRouter: () => ({ push() {}, replace() {} }) }))
vi.mock('@/composables/useStack.js', () => ({ useStack: () => ({ stack: ref('s10') }), whenStack: (fn) => fn() }))
const NOW = Date.now()
vi.mock('@/utils/sfmcApi.js', async (orig) => ({
  ...(await orig()),
  sfmcFetch: async (url) => {
    if (url.includes('/legacy/v1/beta/folder')) return { entry: [{ id: '1', type: 'recyclebin' }] }
    if (url.includes('/customobjects/category/')) return { count: 1, items: [{ id: 'd', name: 'Gone DE', modifiedDate: new Date(NOW - 6 * 86400000).toISOString(), modifiedByName: 'Mathes', categoryFullPathForRecyclebin: 'Data Extensions\\Old' }] }
    if (url.includes('/assets/query')) return { count: 2, items: [{ id: 1, name: 'Gone email', assetType: { id: 208, name: 'htmlemail', displayName: 'HTML Email' } }, { id: 2, name: 'Gone block', assetType: { id: 197, name: 'htmlblock', displayName: 'HTML Block' } }] }
    if (url.endsWith('/contacts/v1/schema')) return { item: { schemaID: 'x' } }
    if (url.includes('attributeGroups')) return { items: [{ id: 'G1', name: { value: 'Main group' } }] }
    if (url.includes('attributeSetDefinitions')) return { count: 1, items: [{ id: 'S1', name: { value: 'Members' }, isRoot: true, relationships: [{ id: 'R', leftItem: { relationshipType: 'AttributeGroup', identifier: 'G1', cardinality: 'One' }, rightItem: { relationshipType: 'AttributeSet', identifier: 'S1', cardinality: 'Many' } }] }] }
    throw new Error(`unexpected ${url}`)
  },
}))

describe('Recycle bin page', () => {
  it('opens on the Content Builder tab with emails picked, and switches to data extensions', async () => {
    const { default: Page } = await import('../RecycleBinPage.vue')
    const w = mount(Page)
    await flushPromises()
    expect(w.text()).toContain('Gone email')
    expect(w.text()).not.toContain('Gone block')
    expect(w.find('[data-open-content-builder]').attributes('href')).toBe('https://mc.s10.exacttarget.com/cloud/#app/Content%20Builder')
    await w.find('[data-recycle-tab="des"]').trigger('click')
    expect(w.text()).toContain('Gone DE')
    expect(w.text()).toContain('Data Extensions > Old')
    expect(w.text()).toContain('24 days')
    expect(w.find('[data-open-contact-builder]').attributes('href')).toContain('contactsmeta/admin.html#admin/data-extensions')
    expect(w.findAll('button').some((b) => /^\s*Restore\s*$/.test(b.text()))).toBe(false)
  }, 30000)
})

describe('Data model page', () => {
  it('lists each group with its attribute sets and relationships', async () => {
    const { default: Page } = await import('../../contacts/DataModelPage.vue')
    const w = mount(Page)
    await flushPromises()
    expect(w.text()).toContain('Main group')
    expect(w.text()).toContain('Members')
    expect(w.text()).toContain('Linked to Main group, many-to-one')
    await w.find('[data-view="diagram"]').trigger('click')
    expect(w.find('svg').exists()).toBe(true)
  }, 30000)
})
