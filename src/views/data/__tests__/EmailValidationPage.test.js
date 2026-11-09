import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { ref, reactive } from 'vue'

// Email validation has three tabs; "Email addresses" takes one address or many
// (user, 2026-11-06; was One address and List of addresses). Runs are background jobs
// (feedback #1092), with a summary (#1091); a new DE copies the source (#1090).
const checked = []
const route = reactive({ query: {} })
let answer = (email) => ({ email, valid: true, reason: '', failedValidation: '', response: '{}' })
let holdRun = null // a promise the fake validateMany waits on before answering
vi.mock('vue-router', () => ({ useRoute: () => route }))
vi.mock('@/composables/useStack.js', () => ({ useStack: () => ({ stack: ref('s1') }) }))
vi.mock('@/composables/useConfirm.js', () => ({ askConfirm: async () => true }))
vi.mock('@/utils/messaging.js', () => ({ sendToBackground: vi.fn(async () => null) }))
vi.mock('@/components/data/DEPickPanel.vue', () => ({
  default: {
    emits: ['pick'],
    template: `<button data-pick-de @click="$emit('pick', { de: { id: 'de1', name: 'Members', customerKey: 'MK' }, detail: { totalRowCount: 3, categoryID: 9, isSendable: true, sendableCustomObjectField: 'SubscriberKey' } })">pick</button>`,
  },
}))
vi.mock('@/components/data/DEFolderPicker.vue', () => ({ default: { template: '<div />' } }))
const deFields = [
  { name: 'SubscriberKey', type: 'Text', length: 50, isPrimaryKey: true, isNullable: false, ordinal: 0 },
  { name: 'Email', type: 'EmailAddress', isNullable: false, ordinal: 1 },
  { name: 'City', type: 'Text', length: 100, isNullable: true, ordinal: 2 },
]
vi.mock('@/utils/deApi.js', () => ({
  fetchDEFieldList: vi.fn(async () => deFields),
  fetchDEDetail: vi.fn(async () => ({})),
  deRowCountOf: (d) => d.totalRowCount,
}))
vi.mock('@/utils/deRows.js', () => ({
  loadRemainingRows: vi.fn(async ({ onRows }) => {
    onRows([
      { SubscriberKey: 'k1', Email: 'ana@example.com', City: 'Oslo' },
      { SubscriberKey: 'k2', Email: 'bad@nomx.test', City: '' },
      { SubscriberKey: 'k3', Email: 'sam@example.org', City: 'Rome' },
    ])
  }),
}))
const written = []
const created = []
vi.mock('@/utils/emailValidation.js', async (orig) => ({
  ...(await orig()),
  validateMany: vi.fn(async (_s, emails, { onResult, shouldStop }) => {
    checked.push(emails)
    if (holdRun) await holdRun
    emails.forEach((email, i) => { if (!shouldStop()) onResult(answer(email), i) })
  }),
  deNameTaken: vi.fn(async () => false),
  freeDEName: vi.fn(async (_s, n) => n),
  createCopyDE: vi.fn(async (_s, settings, fields) => { created.push({ settings, fields }); return { id: 'new1', key: 'NK', name: settings.name } }),
  createResultWriter: vi.fn(() => {
    let sent = 0
    return { add: (row) => { written.push(row); sent++; return Promise.resolve() }, flush: async () => sent, get sent() { return sent } }
  }),
}))

const { _resetJobs, jobs } = await import('@/composables/useJobs.js')
const { default: Page } = await import('../EmailValidationPage.vue')

async function mountPage() {
  const w = mount(Page, { global: { stubs: { RouterLink: { props: ['to'], template: '<a :href="String(to)"><slot /></a>' } } } })
  await flushPromises()
  return w
}
const runButton = (w) => w.findAll('button').find((b) => b.text().trim() === 'Run email validation')

describe('Email validation page', () => {
  beforeEach(() => {
    checked.length = 0
    written.length = 0
    created.length = 0
    route.query = {}
    holdRun = null
    answer = (email) => ({ email, valid: true, reason: '', failedValidation: '', response: '{}' })
    _resetJobs()
  })

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

  it('keeps running after the page is left and shows the run again when reopened (feedback #1092)', async () => {
    let release
    holdRun = new Promise((r) => { release = r })
    const w = await mountPage()
    await w.find('textarea[aria-label="Email addresses"]').setValue('ana@example.com, sam@example.org')
    await w.find('form[data-addresses]').trigger('submit')
    await flushPromises()
    expect(w.find('[data-stay-note]').text()).toMatch(/keeps running while you use other Toolkit pages.*Closing or reloading this tab stops it/s)
    w.unmount()
    expect(jobs[0].status).toBe('running')
    // The title kept in Activity history has a count, not the addresses.
    expect(jobs[0].title).toBe('Email validation: 2 addresses')
    release()
    await jobs[0].done
    const again = await mountPage()
    expect(again.text()).toContain('sam@example.org')
    expect(again.find('[data-validation-summary]').exists()).toBe(true)
  })

  it('reopens a given job from ?job= and says when its results are gone', async () => {
    const w = await mountPage()
    await w.find('textarea[aria-label="Email addresses"]').setValue('ana@example.com')
    await w.find('form[data-addresses]').trigger('submit')
    await flushPromises()
    w.unmount()
    route.query = { job: 'nope' }
    const missing = await mountPage()
    expect(missing.find('[data-missing-job]').exists()).toBe(true)
    route.query = { job: jobs[0].id }
    const found = await mountPage()
    expect(found.find('[data-missing-job]').exists()).toBe(false)
    expect(found.text()).toContain('ana@example.com')
  })

  it('shows a summary by category and filters the table from it (feedback #1091)', async () => {
    answer = (email) => (email.startsWith('bad')
      ? { email, valid: false, reason: 'Mail server', failedValidation: 'MXValidator', response: '{}' }
      : { email, valid: true, reason: '', failedValidation: '', response: '{}' })
    const w = await mountPage()
    await w.find('textarea[aria-label="Email addresses"]').setValue('ana@example.com, bad1@x.test, bad2@x.test')
    await w.find('form[data-addresses]').trigger('submit')
    await flushPromises()
    const sum = w.find('[data-validation-summary]')
    expect(sum.find('[data-summary-group="valid"]').text()).toContain('1')
    expect(sum.find('[data-summary-group="invalid"]').text()).toContain('2')
    expect(sum.find('[data-summary-group="invalid:MXValidator"]').text()).toMatch(/Mail server.*2/)
    expect(w.findAll('[data-result-row]')).toHaveLength(3)
    await sum.find('[data-summary-group="invalid:MXValidator"]').trigger('click')
    expect(w.findAll('[data-result-row]')).toHaveLength(2)
    expect(w.find('[data-filtered-count]').text()).toContain('2 of 3')
    await sum.find('[data-summary-group="invalid:MXValidator"]').trigger('click')
    expect(w.findAll('[data-result-row]')).toHaveLength(3)
  })

  it('a new data extension copies the source fields and every row, with the results (feedback #1090)', async () => {
    const w = await mountPage()
    await w.findAll('[role="tab"]')[1].trigger('click')
    await w.find('[data-pick-de]').trigger('click')
    await flushPromises()
    await w.find('input[type="radio"][value="new"]').setValue(true)
    expect(w.find('[data-copy-plan]').text()).toContain('all 3 fields of Members')
    await runButton(w).trigger('click')
    await flushPromises()
    await jobs[0].done
    await flushPromises()
    expect(created).toHaveLength(1)
    expect(created[0].fields.map((f) => f.name)).toEqual(['SubscriberKey', 'Email', 'City', 'isValidEmail', 'invalidReason', 'APIresponse'])
    expect(created[0].settings).toMatchObject({ name: 'Members_EmailValidation', folderId: 9, isSendable: true, sendField: 'SubscriberKey' })
    expect(written).toHaveLength(3)
    expect(written[0]).toMatchObject({ SubscriberKey: 'k1', Email: 'ana@example.com', City: 'Oslo', isValidEmail: 'true' })
    expect(written[1]).not.toHaveProperty('City')
    expect(w.find('[data-de-done]').text()).toContain('Sent 3 rows to Members_EmailValidation (new)')
    expect(jobs[0].summary).toBe('3 valid, 0 not valid; 3 rows sent to Members_EmailValidation (new)')
  })
})
