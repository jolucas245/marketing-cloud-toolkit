import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { ref } from 'vue'

// Email validation has three tabs; "Email addresses" takes one address or many
// (user, 2026-11-06; was One address and List of addresses).
const checked = []
vi.mock('vue-router', () => ({ onBeforeRouteLeave: () => {} }))
vi.mock('@/composables/useStack.js', () => ({ useStack: () => ({ stack: ref('s1') }) }))
vi.mock('@/composables/useConfirm.js', () => ({ askConfirm: async () => true }))
vi.mock('@/components/data/DEPickPanel.vue', () => ({ default: { template: '<div data-de-pick-panel />' } }))
vi.mock('@/components/data/DEFolderPicker.vue', () => ({ default: { template: '<div />' } }))
vi.mock('@/utils/emailValidation.js', async (orig) => ({
  ...(await orig()),
  validateMany: vi.fn(async (_s, emails, { onResult }) => {
    checked.push(emails)
    emails.forEach((email, i) => onResult({ email, valid: true, reason: '', response: '{}' }, i))
  }),
}))

async function mountPage() {
  const { default: Page } = await import('../EmailValidationPage.vue')
  const w = mount(Page)
  await flushPromises()
  return w
}
const runButton = (w) => w.findAll('button').find((b) => b.text().trim() === 'Run email validation')

describe('Email validation page', () => {
  beforeEach(() => { checked.length = 0 })

  it('has three tabs: Email addresses first, then Data extension and Contacts', async () => {
    const w = await mountPage()
    expect(w.findAll('[role="tab"]').map((t) => t.text())).toEqual(['Email addresses', 'Data extension', 'Contacts'])
    expect(w.find('[role="tab"][aria-selected="true"]').text()).toBe('Email addresses')
  })

  it('runs one address from the same box as a list', async () => {
    const w = await mountPage()
    expect(runButton(w).attributes('disabled')).toBeDefined()
    await w.find('textarea[aria-label="Email addresses"]').setValue('ana@example.com')
    expect(w.find('[data-address-count]').text()).toBe('1 address')
    await w.find('form[data-addresses]').trigger('submit')
    await flushPromises()
    expect(checked).toEqual([['ana@example.com']])
    expect(w.text()).toContain('ana@example.com')
  })

  it('runs several addresses, and Ctrl+Enter in the box runs them too', async () => {
    const w = await mountPage()
    const box = w.find('textarea[aria-label="Email addresses"]')
    await box.setValue('ana@example.com, sam@example.org\nlee@example.net')
    expect(w.find('[data-address-count]').text()).toBe('3 addresses')
    await box.trigger('keydown', { key: 'Enter', ctrlKey: true })
    await flushPromises()
    expect(checked).toEqual([['ana@example.com', 'sam@example.org', 'lee@example.net']])
  })
})
