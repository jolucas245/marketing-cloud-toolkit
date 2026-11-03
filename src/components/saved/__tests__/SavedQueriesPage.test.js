import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'

vi.mock('vue-router', () => ({ useRouter: () => ({ push: vi.fn() }) }))
vi.mock('@/composables/useStack.js', async () => {
  const { ref } = await import('vue')
  return { useStack: () => ({ stack: ref(null) }) }
})

const now = Date.now()
const store = {
  sql_a: { id: 'sql_a', name: 'First query', queryText: 'SELECT Id FROM Alpha WHERE Id > 1', timeStamp: now, businessUnit: { name: 'Unit One', accountId: 1 } },
  sql_b: { id: 'sql_b', name: 'Second query', queryText: 'SELECT Id FROM Beta', timeStamp: now - 1000, isFavourite: true, businessUnit: { name: 'Unit Two', accountId: 2 } },
  sql_empty: { id: 'sql_empty', queryText: '' },
}

beforeEach(() => {
  globalThis.chrome = {
    storage: {
      local: {
        get: (k, cb) => cb(k === null ? { ...store } : typeof k === 'string' ? { [k]: store[k] } : {}),
        set: (o, cb) => { Object.assign(store, o); cb?.() },
        remove: (ids, cb) => { for (const id of ids) delete store[id]; cb?.() },
      },
      onChanged: { addListener: () => {}, removeListener: () => {} },
    },
  }
})

describe('SavedQueriesPage', () => {
  it('lists queries, filters by search, bu: and favourites, and opens the details panel', async () => {
    const { default: Page } = await import('@/views/queries/SavedQueriesPage.vue')
    const w = mount(Page, { attachTo: document.body, global: { stubs: { CodeView: true, ShareQueryDialog: true, AskAiDialog: true } } })
    await flushPromises()
    expect(w.text()).toContain('First query')
    expect(w.text()).toContain('Second query')
    expect(w.text()).toContain('2 saved queries shown')

    await w.find('#sq-search').setValue('bu:two')
    expect(w.text()).not.toContain('First query')
    expect(w.text()).toContain('1 saved query shown of 2')
    await w.find('#sq-search').setValue('')

    await w.find('button[aria-pressed="false"]').trigger('click') // Favourites
    expect(w.text()).not.toContain('First query')
    await w.find('button[aria-pressed="true"]').trigger('click')

    await w.findAll('button[aria-expanded]').find((b) => b.text().includes('First query')).trigger('click')
    const panel = w.find('aside[aria-label="Query details"]')
    expect(panel.exists()).toBe(true)
    expect(panel.text()).toContain('Open in editor')
    expect(panel.text()).toContain('Reads Alpha')
    expect(panel.text()).toContain('1 field')
    w.unmount()
  })
})
