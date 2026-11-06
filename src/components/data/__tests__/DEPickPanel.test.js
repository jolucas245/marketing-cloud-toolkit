import { describe, it, expect, vi } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { defineComponent, h } from 'vue'

// Email validation picks its DE from a tree on the page and shows its details (user, 2026-11-06).
let detail = {}
vi.mock('@/utils/deApi.js', () => ({
  fetchDEDetail: vi.fn(async () => detail),
  fetchDEFieldList: vi.fn(async () => [
    { name: 'SubscriberKey', type: 'Text', length: 254, isPrimaryKey: true, isNullable: false },
    { name: 'Email', type: 'EmailAddress', length: 254, isNullable: true },
  ]),
  fetchDEFolderPath: vi.fn(async () => 'Data Extensions > News'),
  fieldTypeLabel: (f) => `${f.type} (${f.length})`,
  deContactBuilderUrl: () => 'https://mc.example/de',
}))
let browserProps = null
vi.mock('@/components/builder/DEBrowser.vue', () => ({
  default: defineComponent({
    props: { stack: String, selectedIds: Array, hideDataViews: Boolean, sendableOnly: Boolean, selectedLabel: String },
    emits: ['select-de'],
    setup: (p, { emit }) => () => { browserProps = p; return h('button', { 'data-pick': '', onClick: () => emit('select-de', { id: '7', name: 'News', key: '' }) }, 'News') },
  }),
}))

async function pick(props = {}) {
  const { default: Panel } = await import('../DEPickPanel.vue')
  const w = mount(Panel, { props: { stack: 's12', sendableOnly: true, notSendableMessage: 'Pick a sendable one.', ...props } })
  await w.find('[data-pick]').trigger('click')
  await flushPromises()
  return w
}

describe('DE pick panel', () => {
  it('shows the tree of sendable DEs only, with the picked one marked selected', async () => {
    detail = { isSendable: true, customerKey: 'K', totalRowCount: 3 }
    await pick()
    expect(browserProps).toMatchObject({ hideDataViews: true, sendableOnly: true, selectedLabel: 'selected', selectedIds: ['7'] })
  })

  it('shows rows, sendable field, properties and fields, and picks the DE', async () => {
    detail = { isSendable: true, customerKey: 'NEWS', totalRowCount: 52340, categoryId: 5, sendableCustomObjectField: 'SubscriberKey', sendableSubscriberField: '_SubscriberKey' }
    const w = await pick()
    expect(w.find('[data-prop="rows"]').text()).toBe((52340).toLocaleString())
    expect(w.find('[data-prop="sendable"]').text()).toBe('Yes')
    expect(w.find('[data-prop="relationship"]').text()).toBe('SubscriberKey relates to Subscriber Key')
    expect(w.find('[data-prop="key"]').text()).toBe('NEWS')
    expect(w.find('[data-prop="folder"]').text()).toBe('Data Extensions > News')
    const rows = w.findAll('[data-de-fields] tbody tr').map((tr) => tr.findAll('td').map((td) => td.text()))
    expect(rows).toEqual([['SubscriberKey', 'Text (254)', 'Yes', 'Yes'], ['Email', 'EmailAddress (254)', '', '']])
    // The key missing from the tree node comes from the record.
    expect(w.emitted('pick')[0][0]).toEqual({ de: { id: '7', name: 'News', key: 'NEWS', customerKey: 'NEWS' }, detail })
  })

  it('refuses a DE whose record says it is not sendable', async () => {
    detail = { isSendable: false, customerKey: 'NEWS', totalRowCount: 3 }
    const w = await pick()
    expect(w.find('[data-de-error]').text()).toBe('News is not sendable. Pick a sendable one.')
    expect(w.emitted('pick')).toBeUndefined()
  })

  it('does nothing while disabled (a run in progress)', async () => {
    detail = { isSendable: true, customerKey: 'NEWS' }
    const w = await pick({ disabled: true })
    expect(w.emitted('pick')).toBeUndefined()
    expect(w.text()).toContain('Pick a data extension on the left')
  })
})
