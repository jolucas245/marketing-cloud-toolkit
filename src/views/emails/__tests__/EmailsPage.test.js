import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'

// Feedback #1086: a save Chrome refused (storage full) is shown on the Saved page.
vi.mock('vue-router', () => ({ useRouter: () => ({ push: vi.fn() }) }))

let session
const local = {
  email_5: { id: 'email_5', assetId: 5, name: 'News', versions: [{ versionId: 'v', savedAt: 1, assetBody: { views: { html: { content: '<p>x</p>' } } } }] },
}
beforeEach(() => {
  session = { _savedAssetNotKept: { kind: 'email', key: 'email_9', name: 'Spring sale', at: Date.UTC(2026, 10, 9), error: 'QUOTA_BYTES quota exceeded' } }
  globalThis.chrome = {
    storage: {
      local: { get: (k, cb) => cb(k == null ? local : { [k]: local[k] }), set: (o, cb) => cb?.(), remove: (k, cb) => cb?.() },
      session: { get: (k, cb) => cb({ [k]: session[k] }), remove: (k) => { delete session[k] } },
      onChanged: { addListener: () => {}, removeListener: () => {} },
    },
  }
})

const { default: EmailsPage } = await import('../EmailsPage.vue')
const stubs = { EmailCard: { props: ['name', 'compileAsset'], template: '<div data-card>{{ name }}|{{ compileAsset ? "preview" : "none" }}</div>' }, ContentTabs: true }

describe('Saved Emails page', () => {
  it('shows the save that was not kept and can dismiss it', async () => {
    const w = mount(EmailsPage, { props: { kind: 'email' }, global: { stubs } })
    await flushPromises()
    expect(w.find('[data-save-not-kept]').text()).toContain('Spring sale')
    expect(w.find('[data-card]').text()).toBe('News|preview')
    await w.find('[data-save-not-kept-dismiss]').trigger('click')
    expect(w.find('[data-save-not-kept]').exists()).toBe(false)
    expect(session._savedAssetNotKept).toBeUndefined()
  })

  it('does not show an email notice on Saved CloudPages', async () => {
    const w = mount(EmailsPage, { props: { kind: 'cloudpage' }, global: { stubs } })
    await flushPromises()
    expect(w.find('[data-save-not-kept]').exists()).toBe(false)
  })
})
