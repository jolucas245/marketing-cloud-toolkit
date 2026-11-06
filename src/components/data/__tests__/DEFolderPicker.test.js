import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'

// The folder tree looks like the DE tree and opens to a folder set from outside:
// Email validation presets the picked DE's folder (user, 2026-11-06).
const tree = {
  1: [{ id: 10, name: 'Test' }, { id: 11, name: 'Sales' }],
  10: [{ id: 20, name: 'ck' }],
  20: [{ id: 30, name: 'Kyle' }, { id: 31, name: 'MK' }],
  30: [],
  11: [],
  31: [],
}
const parents = { 1: null, 10: 1, 11: 1, 20: 10, 30: 20, 31: 20, 99: 98, 98: null }
const folderNames = { 1: 'Data Extensions', 10: 'Test', 11: 'Sales', 20: 'ck', 30: 'Kyle', 31: 'MK', 98: 'Shared Data Extensions', 99: 'Shared' }

vi.mock('../../../utils/saveAsActivity.js', () => ({
  loadDERoot: vi.fn(async () => ({ id: 1, name: 'Data Extensions' })),
  loadDEChildFolders: vi.fn(async (_s, id) => tree[id] || []),
}))
vi.mock('../../../utils/deApi.js', () => ({
  fetchDEFolderChain: vi.fn(async (_s, id) => {
    const chain = []
    for (let f = id; f != null; f = parents[f]) chain.unshift({ id: String(f), name: folderNames[f] })
    return chain
  }),
}))

async function mountPicker(props = {}) {
  const { default: Picker } = await import('../DEFolderPicker.vue')
  const w = mount(Picker, {
    props: { stack: 's1', modelValue: null, ...props, 'onUpdate:modelValue': (v) => w.setProps({ modelValue: v }) },
    attachTo: document.body,
  })
  await flushPromises()
  return w
}
const names = (w) => w.findAll('[role="treeitem"]').map((r) => r.text().replace(/\s*selected$/, ''))
const selected = (w) => w.findAll('[role="treeitem"][aria-selected="true"]').map((r) => r.attributes('data-folder-id'))

describe('DEFolderPicker', () => {
  beforeEach(() => { document.body.innerHTML = '' })

  it('opens the tree to a preset folder, selects it and shows its path', async () => {
    const w = await mountPicker({ modelValue: 30 })
    expect(names(w)).toEqual(['Data Extensions', 'Test', 'ck', 'Kyle', 'MK', 'Sales'])
    expect(selected(w)).toEqual(['30'])
    expect(w.find('[data-folder-path]').text()).toBe('Data Extensions > Test > ck > Kyle')
    expect(w.emitted('update:path').at(-1)).toEqual(['Data Extensions > Test > ck > Kyle'])
  })

  it('reveals a folder set after mounting', async () => {
    const w = await mountPicker()
    expect(names(w)).toEqual(['Data Extensions', 'Test', 'Sales'])
    await w.setProps({ modelValue: 31 })
    await flushPromises()
    expect(selected(w)).toEqual(['31'])
    expect(names(w)).toContain('MK')
  })

  it('clears a folder outside the local Data Extensions tree, so the user picks one', async () => {
    const w = await mountPicker({ modelValue: 99 })
    expect(w.emitted('update:modelValue').at(-1)).toEqual([null])
    expect(w.find('[data-folder-path]').text()).toBe('none picked')
  })

  it('selects a clicked folder, opens it, and marks it like the DE tree', async () => {
    const w = await mountPicker()
    await w.find('[data-folder-id="10"] [data-folder-name]').trigger('click')
    await flushPromises()
    expect(w.emitted('update:modelValue').at(-1)).toEqual([10])
    expect(w.emitted('update:path').at(-1)).toEqual(['Data Extensions > Test'])
    const row = w.find('[data-folder-id="10"]')
    expect(row.classes()).toEqual(expect.arrayContaining(['bg-primary/10', 'text-primary', 'font-semibold']))
    expect(row.text()).toContain('selected')
    expect(names(w)).toEqual(['Data Extensions', 'Test', 'ck', 'Sales'])
  })

  it('has no expand arrow on a folder without subfolders once read', async () => {
    const w = await mountPicker({ modelValue: 30 })
    expect(w.find('[data-folder-id="30"] [data-folder-toggle]').exists()).toBe(true) // not read yet
    await w.find('[data-folder-id="31"] [data-folder-name]').trigger('click')
    await flushPromises()
    expect(w.find('[data-folder-id="31"] [data-folder-toggle]').exists()).toBe(false)
    expect(w.find('[data-folder-id="20"] [data-folder-toggle]').exists()).toBe(true)
  })
})

describe('DEFolderPicker with a folder listed under itself', () => {
  it('shows it once instead of looping', async () => {
    const { loadDEChildFolders } = await import('../../../utils/saveAsActivity.js')
    loadDEChildFolders.mockImplementation(async () => [{ id: 7, name: 'Loop' }])
    const w = await mountPicker()
    await w.find('[data-folder-id="7"] [data-folder-name]').trigger('click')
    await flushPromises()
    expect(names(w)).toEqual(['Data Extensions', 'Loop'])
  })
})
