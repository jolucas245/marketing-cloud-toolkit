// Remove contacts from a journey (API idea 4): nothing is sent until the review and the
// typed confirmation; Stop works between batches.
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { policy, normalizePolicy } from '@/utils/policy.js'
import Dialog from '../JourneyExitDialog.vue'

const api = vi.hoisted(() => ({ fetch: vi.fn() }))
vi.mock('@/utils/sfmcApi.js', async (original) => ({ ...await original(), sfmcFetch: (...args) => api.fetch(...args) }))

const journey = { id: 'j1', key: 'welcome-key', name: 'Welcome', version: 2, status: 'Published' }
const versions = [{ version: 2, status: 'Published' }, { version: 1, status: 'Stopped' }]

async function dialog(props = {}) {
  return mount(Dialog, { props: { stack: 's10', journey, versions, ...props }, attachTo: document.body, global: { stubs: { DEPickerDialog: true } } })
}
async function toConfirm(w, text) {
  await w.find('[data-exit-keys]').setValue(text)
  await w.find('[data-exit-next]').trigger('click')
  await w.find('[data-exit-open-confirm]').trigger('click')
}
const exitCalls = () => api.fetch.mock.calls.filter(([u]) => u.endsWith('/contactexit'))

describe('JourneyExitDialog', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    Object.assign(policy, normalizePolicy({}))
    api.fetch.mockImplementation(async (url, _m, body) => (url.endsWith('/status')
      ? { results: body.map((it) => ({ contactKey: it.ContactKey, status: 'Queued' })) }
      : { errors: [] }))
  })

  it('counts deduped keys and shows the review before anything is sent', async () => {
    const w = await dialog()
    await w.find('[data-exit-keys]').setValue('a\nb, a\n c ')
    expect(w.find('[data-exit-count]').text()).toContain('3 contacts, 1 duplicate left out')
    await w.find('[data-exit-next]').trigger('click')
    const review = w.find('[data-exit-review]').text()
    expect(review).toContain('Welcome')
    expect(review).toContain('All versions')
    expect(review).toContain('3, sent 50 at a time')
    expect(w.findAll('[data-exit-preview] li').map((li) => li.text())).toEqual(['a', 'b', 'c'])
    expect(api.fetch).not.toHaveBeenCalled()
    w.unmount()
  })

  it('enables Remove only after the number of contacts (or the journey name) is typed', async () => {
    const w = await dialog()
    await toConfirm(w, 'a\nb\nc')
    const confirm = w.find('[data-exit-confirm]')
    expect(confirm.text()).toContain('cannot be undone')
    expect(confirm.text()).toContain('not immediate')
    const run = () => w.find('[data-exit-confirm-run]')
    expect(run().attributes('disabled')).toBeDefined()
    await w.find('[data-exit-typed]').setValue('2')
    expect(run().attributes('disabled')).toBeDefined()
    await run().trigger('click')
    expect(api.fetch).not.toHaveBeenCalled()
    await w.find('[data-exit-typed]').setValue('Welcome')
    expect(run().attributes('disabled')).toBeUndefined()
    await w.find('[data-exit-typed]').setValue('3')
    await run().trigger('click')
    await flushPromises()
    expect(exitCalls()).toHaveLength(1)
    expect(exitCalls()[0][2]).toEqual([
      { ContactKey: 'a', DefinitionKey: 'welcome-key' }, { ContactKey: 'b', DefinitionKey: 'welcome-key' }, { ContactKey: 'c', DefinitionKey: 'welcome-key' },
    ])
    expect(w.find('[data-exit-results]').text()).toContain('Queued')
    expect(w.find('[data-exit-csv]').exists()).toBe(true)
    w.unmount()
  })

  it('sends only the chosen versions', async () => {
    const w = await dialog({ initialKeys: ['k1'], initialVersions: [1] })
    await w.find('[data-exit-next]').trigger('click')
    expect(w.find('[data-exit-review]').text()).toContain('Version 1')
    await w.find('[data-exit-open-confirm]').trigger('click')
    await w.find('[data-exit-typed]').setValue('1')
    await w.find('[data-exit-confirm-run]').trigger('click')
    await flushPromises()
    expect(exitCalls()[0][2]).toEqual([{ ContactKey: 'k1', DefinitionKey: 'welcome-key', Versions: [1] }])
    w.unmount()
  })

  it('Stop ends the run after the batch in flight', async () => {
    let release
    api.fetch.mockImplementation(async (url) => {
      if (url.endsWith('/contactexit')) await new Promise((r) => { release = r })
      return {}
    })
    const w = await dialog()
    const keys = Array.from({ length: 120 }, (_, i) => `k${i}`).join('\n')
    await toConfirm(w, keys)
    await w.find('[data-exit-typed]').setValue('120')
    await w.find('[data-exit-confirm-run]').trigger('click')
    await flushPromises()
    await w.find('[data-exit-stop]').trigger('click')
    release()
    await flushPromises()
    expect(exitCalls()).toHaveLength(1)
    expect(w.text()).toContain('Stopped: 70 contacts were not sent.')
    w.unmount()
  })

  it('sends nothing under the disableJourneyWrites policy', async () => {
    policy.disableJourneyWrites = true
    const w = await dialog()
    await toConfirm(w, 'a')
    await w.find('[data-exit-typed]').setValue('1')
    await w.find('[data-exit-confirm-run]').trigger('click')
    await flushPromises()
    expect(api.fetch).not.toHaveBeenCalled()
    w.unmount()
  })
})
