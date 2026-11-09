import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'

// Background job notices (feedback #1092): the header pill while a job runs, the bell's
// list of ended jobs, the message bar link and the Activity history page.
const store = {}
globalThis.chrome = {
  storage: {
    local: {
      get: vi.fn((k, cb) => { const r = typeof k === 'string' ? { [k]: store[k] } : {}; if (cb) cb(r); return Promise.resolve(r) }),
      set: vi.fn(async (o) => { Object.assign(store, o) }),
    },
    onChanged: { addListener: vi.fn(), removeListener: vi.fn() },
  },
}
vi.mock('@/utils/messaging.js', () => ({ sendToBackground: vi.fn(async () => null) }))
vi.mock('vue-router', () => ({ useRoute: () => ({ path: '/home' }) }))
vi.mock('@/composables/useConfirm.js', () => ({ askConfirm: async () => true }))

const { startJob, stopJob, jobs, _resetJobs } = await import('@/composables/useJobs.js')
const { showToast, messages } = await import('@/composables/useToast.js')
const { JOB_HISTORY_KEY } = await import('@/utils/jobs.js')
const stubs = { RouterLink: { props: ['to'], template: '<a :href="String(to)" @click="$emit(\'click\')"><slot /></a>' } }

const hold = () => {
  let release
  const p = new Promise((r) => { release = r })
  return { p, release }
}

describe('job notices', () => {
  beforeEach(() => {
    _resetJobs()
    for (const k of Object.keys(store)) delete store[k]
    messages.value = []
    window.location.hash = '#/home'
  })

  it('the header pill shows a running job and links to its page', async () => {
    const { default: JobsPill } = await import('../JobsPill.vue')
    const w = mount(JobsPill, { global: { stubs } })
    expect(w.find('[data-jobs-pill]').exists()).toBe(false)
    const h = hold()
    const job = startJob({ kind: 'k', title: 'Email validation: Members', path: '/email-validation', run: async (j) => { j.progress.total = 4; j.progress.done = 1; await h.p } })
    await flushPromises()
    const pill = w.find('[data-jobs-pill]')
    expect(pill.text()).toContain('Email validation: Members')
    expect(pill.text()).toContain('25%')
    expect(pill.attributes('href')).toBe(job.route)
    h.release()
    await job.done
    await flushPromises()
    expect(w.find('[data-jobs-pill]').exists()).toBe(false)
  })

  it('the bell lists ended jobs as unread until opened, with a link to Activity history', async () => {
    const { default: NoticesMenu } = await import('../NoticesMenu.vue')
    const job = startJob({ kind: 'k', title: 'Email validation: 3 addresses', path: '/email-validation', run: async () => '3 valid' })
    await job.done
    const w = mount(NoticesMenu, { global: { stubs } })
    await flushPromises()
    expect(w.find('[data-notices-bell]').text()).toBe('1')
    await w.find('[data-notices-bell]').trigger('click')
    const notice = w.find('[data-job-notice]')
    expect(notice.text()).toContain('Finished')
    expect(notice.text()).toContain('3 valid')
    expect(notice.attributes('href')).toBe(job.route)
    expect(w.find('[data-activity-link]').attributes('href')).toBe('/activity')
    await w.find('[data-notices-bell]').trigger('click')
    expect(w.find('[data-notices-bell]').text()).toBe('')
  })

  it('the message bar shows a link when a message has an action', async () => {
    const { default: MessageBar } = await import('../MessageBar.vue')
    showToast('Email validation finished.', 5000, { action: { label: 'Open results', to: '/email-validation?job=x' } })
    const w = mount(MessageBar, { global: { stubs } })
    const link = w.find('[data-message-action]')
    expect(link.text()).toBe('Open results')
    expect(link.attributes('href')).toBe('/email-validation?job=x')
  })

  it('Activity history lists live and stored jobs, with Stop and links back', async () => {
    store[JOB_HISTORY_KEY] = [{ id: 'old1', kind: 'email-validation', title: 'Email validation: Old DE', route: '/email-validation?job=old1', status: 'running', startedAt: 1, heartbeat: 1, progress: { done: 5, total: 10 }, summary: '', error: '' }]
    const h = hold()
    const live = startJob({ kind: 'email-validation', title: 'Email validation: 2 addresses', path: '/email-validation', run: async (j) => { j.progress.total = 2; await h.p; return j.stopRequested ? 'stopped' : '2 valid' } })
    await flushPromises()
    const { default: Page } = await import('@/views/info/ActivityHistoryPage.vue')
    const w = mount(Page, { global: { stubs } })
    await flushPromises()
    const rows = w.findAll('[data-history-row]')
    expect(rows.map((r) => r.attributes('data-history-row'))).toEqual([live.id, 'old1'])
    // The stored running entry has had no heartbeat for a long time: its tab was closed.
    expect(rows[1].find('[data-history-status]').text()).toBe('Stopped (tab closed)')
    expect(rows[1].text()).toContain('Results not in this tab')
    expect(rows[0].find('[data-history-status]').text()).toContain('Running')
    expect(rows[0].find('[data-history-open]').attributes('href')).toBe(live.route)
    await rows[0].findAll('button').find((b) => b.text().includes('Stop')).trigger('click')
    expect(live.stopRequested).toBe(true)
    h.release()
    await live.done
    await flushPromises()
    expect(w.find(`[data-history-row="${live.id}"] [data-history-status]`).text()).toBe('Stopped')
    expect(w.text()).toContain('Closing or reloading the tab stops them.')
    // Nothing stored holds an address.
    expect(JSON.stringify(store[JOB_HISTORY_KEY])).not.toMatch(/@/)
    stopJob(live)
    expect(jobs).toHaveLength(1)
  })
})
