import { describe, it, expect, vi } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'

// Email validation lists only sendable data extensions (user, 2026-11-06): DEs SFMC's
// list marks not sendable are left out; unknown ones stay (checked when picked).
vi.mock('../../../utils/deCatalog.js', () => ({
  loadRootSections: async () => [],
  loadFolderContents: async () => [],
  getDataViewNodes: () => [],
  debouncedSearchDEs: (stack, q, cb) => cb([
    { id: 1, name: 'Subscribers', type: 'de', isSendable: true },
    { id: 2, name: 'Subscriber_Log', type: 'de', isSendable: false },
    { id: 3, name: 'Subscriber_Old', type: 'de', isSendable: null },
  ]),
}))
vi.mock('../../../utils/sfmcErrors.js', () => ({ withReconnect: (s, fn) => fn(), searchError: (e) => e }))

async function search(props) {
  const { default: DEBrowser } = await import('../DEBrowser.vue')
  const w = mount(DEBrowser, { props: { stack: 's12', hideDataViews: true, ...props }, global: { stubs: { ReportErrorButton: true, SfmcErrorNotice: true } } })
  await flushPromises()
  await w.find('#qb-src').setValue('Subscriber')
  await w.find('#qb-src').trigger('input')
  await flushPromises()
  return w.text()
}

describe('DEBrowser sendableOnly', () => {
  it('leaves out DEs marked not sendable', async () => {
    const text = await search({ sendableOnly: true })
    expect(text).toContain('Subscribers')
    expect(text).toContain('Subscriber_Old')
    expect(text).not.toContain('Subscriber_Log')
  })
  it('shows every DE without it', async () => {
    expect(await search({})).toContain('Subscriber_Log')
  })
})
