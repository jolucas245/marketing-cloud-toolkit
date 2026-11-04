import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'

const params = { id: 'cloudpage_42' }
vi.mock('vue-router', () => ({ useRoute: () => ({ params }), useRouter: () => ({ push: vi.fn() }) }))
vi.mock('@/components/results/DiffView.vue', () => ({ default: { name: 'DiffView', props: ['left', 'right', 'lang'], template: '<div data-diff>{{ left }}|{{ right }}</div>' } }))
vi.mock('@/components/results/CodeView.vue', () => ({ default: { name: 'CodeView', props: ['code', 'lang', 'maxHeight'], template: '<pre data-code>{{ code }}</pre>' } }))

const record = {
  id: 'cloudpage_42', assetId: 42, name: 'Probe', kind: 'cloudpage', assetTypeName: 'webpage',
  versions: [
    { versionId: 'b', savedAt: 2000, compileAsset: { content: '<p>new</p>\n%%=v(@x)=%%' } },
    { versionId: 'a', savedAt: 1000, compileAsset: { content: '<p>old</p>' } },
  ],
}

beforeEach(() => {
  globalThis.chrome = { storage: { local: { get: (k, cb) => cb({ [k]: record }), set: (o, cb) => cb?.(), remove: (k, cb) => cb?.() } } }
})

const { default: EmailDetailPage } = await import('../EmailDetailPage.vue')
const stubs = { RouterLink: { template: '<a><slot /></a>' }, SelfRestoreDialog: true }

describe('Saved CloudPage detail (feedback #1046)', () => {
  it('shows the code of a version', async () => {
    const w = mount(EmailDetailPage, { props: { kind: 'cloudpage' }, global: { stubs } })
    await flushPromises()
    await w.find('[data-view="code"]').trigger('click')
    expect(w.find('[data-code]').text()).toContain('%%=v(@x)=%%')
  })

  it('compares two versions as code, older on the left, and as previews', async () => {
    const w = mount(EmailDetailPage, { props: { kind: 'cloudpage' }, global: { stubs } })
    await flushPromises()
    await w.find('[data-compare-select]').setValue('a')
    expect(w.find('[data-compare-bar]').text()).toMatch(/v1.*left.*v2.*right/)
    expect(w.findAll('[data-compare-preview] iframe')).toHaveLength(2)
    await w.find('[data-view="code"]').trigger('click')
    expect(w.find('[data-diff]').text()).toMatch(/^<p>old<\/p>\|<p>new<\/p>/)
    expect(w.find('[data-compare-bar]').text()).toContain('+2')
  })
})
