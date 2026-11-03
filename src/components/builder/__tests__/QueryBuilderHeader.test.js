import { describe, it, expect, vi } from 'vitest'
import { ref } from 'vue'
import { mount, flushPromises } from '@vue/test-utils'

vi.mock('vue-router', () => ({ useRouter: () => ({ push: vi.fn() }) }))
vi.mock('@/composables/useStack.js', () => ({ useStack: () => ({ stack: ref(null), state: ref('none') }) }))
vi.mock('@/composables/useAi.js', () => ({ useAi: () => ({ shown: ref(false) }) }))
vi.mock('@/utils/builderStorage.js', () => ({
  saveBuilderRecord: vi.fn(), getBuilderRecord: vi.fn(async () => null), listSavedQueryRecords: vi.fn(async () => []),
  defaultQueryOptions: () => ({}), plainClone: (x) => JSON.parse(JSON.stringify(x)),
}))

async function mountBuilder() {
  const { default: QueryBuilder } = await import('../QueryBuilder.vue')
  const w = mount(QueryBuilder, {
    shallow: true,
    global: { stubs: { HelpTip: true, AiButton: true } },
  })
  await flushPromises()
  return w
}

describe('Query Builder header (redesign #1031)', () => {
  it('shows Untitled query and the List / Visual switch', async () => {
    const w = await mountBuilder()
    expect(w.text()).toContain('Untitled query')
    const view = w.find('[role="group"][aria-label="View"]')
    expect(view.exists()).toBe(true)
    await view.findAll('button')[0].trigger('click')
    expect(view.findAll('button')[0].attributes('aria-pressed')).toBe('true')
  })

  it('New > New query asks the page for an empty query', async () => {
    const w = await mountBuilder()
    const newBtn = w.findAll('button').find((b) => b.text().startsWith('New'))
    await newBtn.trigger('click')
    const item = w.findAll('[role="menuitem"]').find((b) => b.text().startsWith('New query'))
    await item.trigger('click')
    expect(w.emitted('new-query')).toHaveLength(1)
    expect(w.find('[role="menu"]').exists()).toBe(false)
  })

  it('New > From SQL opens the Draw a query dialog', async () => {
    const w = await mountBuilder()
    await w.findAll('button').find((b) => b.text().startsWith('New')).trigger('click')
    await w.findAll('[role="menuitem"]').find((b) => b.text().startsWith('From SQL')).trigger('click')
    expect(w.text()).toContain('Draw a query')
  })
})
