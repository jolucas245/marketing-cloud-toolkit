import { describe, it, expect } from 'vitest'
import {
  maskEmails, historyEntry, upsertHistory, displayStatus, durationText, progressText, finishText, mergeHistory, jobRoute,
  MAX_HISTORY, STALE_MS,
} from '../jobs.js'

// Background jobs (feedback #1092): what the stored history keeps.
describe('job history entries', () => {
  it('masks anything shaped like an email address', () => {
    expect(maskEmails('Writing failed for ana@example.com and <sam@x.org>')).toBe('Writing failed for [email address] and <[email address]>')
  })
  it('keeps only small metadata, masked and cut short', () => {
    const job = {
      id: 'j1', kind: 'email-validation', title: 'Email validation: 3 addresses', route: '/email-validation?job=j1', status: 'failed',
      startedAt: 1000, finishedAt: 5000, progress: { done: 2, total: 3, stage: 'checking' },
      summary: '', error: `Refused lee@example.net ${'x'.repeat(400)}`, data: { results: [{ email: 'ana@example.com' }] },
    }
    const e = historyEntry(job, 6000)
    expect(Object.keys(e).sort()).toEqual(['error', 'finishedAt', 'heartbeat', 'id', 'kind', 'progress', 'route', 'startedAt', 'status', 'summary', 'title'])
    expect(e.progress).toEqual({ done: 2, total: 3 })
    expect(e.heartbeat).toBe(6000)
    expect(e.error).toMatch(/^Refused \[email address\] x+…$/)
    expect(e.error.length).toBe(300)
    expect(JSON.stringify(e)).not.toMatch(/@/)
  })
  it('replaces by id, sorts newest first and keeps the last 50', () => {
    let list = []
    for (let i = 0; i < MAX_HISTORY + 5; i++) list = upsertHistory(list, { id: `j${i}`, startedAt: i })
    expect(list).toHaveLength(MAX_HISTORY)
    expect(list[0].id).toBe(`j${MAX_HISTORY + 4}`)
    list = upsertHistory(list, { id: 'j54', startedAt: 54, status: 'done' })
    expect(list.filter((e) => e.id === 'j54')).toEqual([{ id: 'j54', startedAt: 54, status: 'done' }])
  })
  it('builds the route back with the job id', () => {
    expect(jobRoute('/email-validation', 'a b')).toBe('/email-validation?job=a%20b')
    expect(jobRoute('/x?tab=1', 'j')).toBe('/x?tab=1&job=j')
  })
})

describe('how an entry reads', () => {
  it('shows a running entry with no recent heartbeat as stopped by a closed tab', () => {
    const e = { id: 'j', status: 'running', heartbeat: 0 }
    expect(displayStatus(e, { now: STALE_MS + 1 })).toBe('interrupted')
    expect(displayStatus(e, { now: STALE_MS - 1 })).toBe('running')
    expect(displayStatus(e, { now: STALE_MS + 1, liveIds: new Set(['j']) })).toBe('running')
    expect(displayStatus({ status: 'done' })).toBe('done')
  })
  it('gives durations, progress and finish texts', () => {
    expect(durationText(0, 0)).toBe('')
    expect(durationText(1000, 46000)).toBe('45 s')
    expect(durationText(1000, 126000)).toBe('2 min 5 s')
    expect(durationText(1, 1 + 3_720_000)).toBe('1 h 2 min')
    expect(progressText({ done: 1200, total: 5000 })).toBe('1,200 of 5,000')
    expect(progressText({ done: 0, total: 0 })).toBe('')
    expect(finishText({ title: 'Email validation: X', status: 'done', summary: '2 valid' })).toEqual({ title: 'Email validation: X finished', message: '2 valid' })
    expect(finishText({ title: 'T', status: 'failed', error: 'bad a@b.c' }).message).toBe('bad [email address]')
    expect(finishText({ title: 'T', status: 'stopped' }).title).toBe('T stopped')
  })
  it('merges live jobs over stored entries', () => {
    const stored = [{ id: 'a', startedAt: 1, status: 'running', title: 'old' }, { id: 'b', startedAt: 2, status: 'done', title: 'B' }]
    const live = [{ id: 'a', startedAt: 1, status: 'done', title: 'A', progress: { done: 1, total: 1 } }]
    const m = mergeHistory(live, stored, 10)
    expect(m.map((e) => [e.id, e.status, e.live])).toEqual([['b', 'done', false], ['a', 'done', true]])
  })
})
