import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { defineComponent, h } from 'vue'

let detail = {}
const rowsRead = []
vi.mock('@/utils/deApi.js', () => ({
  fetchDEDetail: vi.fn(async () => detail),
  fetchDEFieldList: vi.fn(async () => [{ name: 'SubscriberKey' }]),
}))
vi.mock('@/utils/deRows.js', () => ({
  ROWS_PAGE: 50,
  filterRows: (rows) => rows,
  fetchRowsAt: vi.fn(async (stack, key) => { rowsRead.push(key); return { rows: [{ SubscriberKey: 'a' }] } }),
}))
// The folder tree is replaced by a button that selects one DE.
vi.mock('@/components/builder/DEBrowser.vue', () => ({
  default: defineComponent({ emits: ['select-de'], setup: (_, { emit }) => () => h('button', { 'data-pick': '', onClick: () => emit('select-de', { id: '7', name: 'Prefs', key: 'PREFS' }) }, 'Prefs') }),
}))

async function pickPrefs(props) {
  const { default: Picker } = await import('../DEPickerDialog.vue')
  const w = mount(Picker, { props: { stack: 's12', withRow: true, ...props } })
  await w.find('[data-pick]').trigger('click')
  await flushPromises()
  return w
}

describe('DE picker, sendable only (feedback #1075)', () => {
  beforeEach(() => { rowsRead.length = 0 })

  it('refuses a DE that SFMC says is not sendable, before reading rows', async () => {
    detail = { isSendable: false }
    const w = await pickPrefs({ requireSendable: true })
    expect(w.text()).toContain('Prefs is not sendable')
    expect(rowsRead).toEqual([])
  })

  it('reads rows of a sendable DE, or when sendable is unknown', async () => {
    detail = { isSendable: true }
    await pickPrefs({ requireSendable: true })
    detail = {}
    await pickPrefs({ requireSendable: true })
    expect(rowsRead).toEqual(['PREFS', 'PREFS'])
  })

  it('does not check without requireSendable', async () => {
    detail = { isSendable: false }
    const w = await pickPrefs({})
    expect(w.text()).not.toContain('not sendable')
    expect(rowsRead).toEqual(['PREFS'])
  })
})

describe('DE picker for Email validation: sendable only (user, 2026-11-06)', () => {
  it('refuses a DE that is not sendable with the caller\'s message, and passes the filter to the tree', async () => {
    detail = { isSendable: false }
    const { default: Picker } = await import('../DEPickerDialog.vue')
    const w = mount(Picker, { props: { stack: 's12', sendableOnly: true, notSendableMessage: 'Email validation works only on sendable data extensions.' } })
    await w.find('[data-pick]').trigger('click')
    await flushPromises()
    expect(w.text()).toContain('Prefs is not sendable. Email validation works only on sendable data extensions.')
    expect(w.emitted('pick')).toBeUndefined()
  })
})
