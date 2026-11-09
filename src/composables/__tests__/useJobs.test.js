import { describe, it, expect, vi, beforeEach } from 'vitest'

// The app-level job runner (feedback #1092).
const store = {}
const sent = []
vi.mock('@/utils/messaging.js', () => ({ sendToBackground: vi.fn(async (m) => { sent.push(m); return null }) }))

globalThis.chrome = {
  storage: {
    local: {
      get: vi.fn(async (k) => ({ [k]: store[k] })),
      set: vi.fn(async (o) => { Object.assign(store, o) }),
    },
    onChanged: { addListener: vi.fn() },
  },
}

const { startJob, stopJob, jobs, runningJobs, unseenJobs, findJob, latestJob, markJobsSeen, loadJobHistory, clearJobHistory, jobHistory, _resetJobs, KEEP_DATA } = await import('../useJobs.js')
const { messages } = await import('../useToast.js')
const { JOB_HISTORY_KEY } = await import('@/utils/jobs.js')

const flush = () => new Promise((r) => setTimeout(r, 0))

describe('useJobs', () => {
  beforeEach(() => {
    _resetJobs()
    for (const k of Object.keys(store)) delete store[k]
    sent.length = 0
    messages.value = []
    window.location.hash = '#/home'
  })

  it('runs a job outside any page, stores its entry and announces the end with a link back', async () => {
    const job = startJob({
      kind: 'email-validation', title: 'Email validation: 2 addresses', path: '/email-validation', data: { results: [] },
      run: async (j) => {
        j.progress.total = 2
        j.data.results.push({ email: 'ana@example.com', valid: true })
        j.progress.done = 1
        return '1 valid, ana@example.com'
      },
    })
    expect(job.status).toBe('running')
    expect(runningJobs.value).toHaveLength(1)
    expect(job.route).toBe(`/email-validation?job=${job.id}`)
    await job.done
    await flush()
    expect(job.status).toBe('done')
    expect(job.finishedAt).toBeGreaterThan(0)
    expect(findJob(job.id)).toBe(job)
    expect(latestJob('email-validation')).toBe(job)
    // Stored history: no rows, no addresses.
    const stored = store[JOB_HISTORY_KEY]
    expect(stored).toHaveLength(1)
    expect(stored[0]).toMatchObject({ id: job.id, status: 'done', progress: { done: 1, total: 2 } })
    expect(JSON.stringify(stored)).not.toMatch(/@/)
    // Not on its page: a message with a link, a notice in the bell, a Chrome notification request.
    expect(messages.value.at(-1).action).toEqual({ label: 'Open results', to: job.route })
    expect(unseenJobs.value).toEqual([job])
    expect(sent).toEqual([{ type: 'JOB_NOTIFY', title: 'Email validation: 2 addresses finished', message: '1 valid, [email address]', path: job.route }])
    markJobsSeen()
    expect(unseenJobs.value).toEqual([])
  })

  it('on its own page: no message, counts as seen', async () => {
    window.location.hash = '#/email-validation'
    const job = startJob({ kind: 'k', title: 'T', path: '/email-validation', run: async () => 'ok' })
    await job.done
    await flush()
    expect(messages.value).toEqual([])
    expect(job.seen).toBe(true)
    expect(sent).toEqual([])
  })

  it('a failure keeps the error; Stop ends as stopped', async () => {
    const bad = startJob({ kind: 'k', title: 'Bad', path: '/x', run: async () => { throw new Error('Session expired') } })
    await bad.done
    expect(bad.status).toBe('failed')
    expect(bad.error).toBe('Session expired')
    expect(messages.value.at(-1).kind).toBe('error')

    let release
    const slow = startJob({ kind: 'k', title: 'Slow', path: '/x', run: (j) => new Promise((r) => { release = () => r(j.stopRequested ? 'stopped early' : 'all') }) })
    stopJob(slow)
    await flush()
    release()
    await slow.done
    expect(slow.status).toBe('stopped')
    expect(slow.summary).toBe('stopped early')
  })

  it('keeps the data of the last few finished jobs only', async () => {
    for (let i = 0; i < KEEP_DATA + 2; i++) {
      const j = startJob({ kind: 'k', title: `J${i}`, path: '/x', data: { results: [i] }, run: async () => '' })
      await j.done
    }
    expect(jobs.filter((j) => j.data).length).toBe(KEEP_DATA)
    expect(jobs.at(-1).data).toBe(null)
    expect(jobs.at(-1).dataDropped).toBe(true)
  })

  it('loads and clears the stored history', async () => {
    store[JOB_HISTORY_KEY] = [{ id: 'old', startedAt: 1, status: 'done' }]
    await loadJobHistory()
    expect(jobHistory.value).toHaveLength(1)
    await clearJobHistory()
    expect(store[JOB_HISTORY_KEY]).toEqual([])
    expect(jobHistory.value).toEqual([])
  })
})
