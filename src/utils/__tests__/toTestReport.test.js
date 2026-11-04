import { describe, it, expect } from 'vitest'
import { testResultsReport } from '../toTestReport.js'

const groups = [
  { version: '2.0.20', items: [{ id: 'a', title: 'Alpha', ref: '#1' }, { id: 'b', title: 'Beta' }] },
  { version: '2.0.19', items: [{ id: 'c', title: 'Gamma' }, { id: 'd', title: 'Delta' }] },
]

describe('testResultsReport', () => {
  it('counts every result and lists items not done', () => {
    const r = testResultsReport(groups, { a: { result: 'pass' }, b: { result: 'fail', note: 'broke\non save' }, c: { result: 'skip' } }, 'abc1234')
    expect(r.counts).toEqual({ pass: 1, fail: 1, skip: 1, open: 1, total: 4 })
    expect(r.message).toBe('[To Test results] abc1234: 1 pass, 1 fail, 1 skip, 1 not done (of 4)')
    expect(r.details).toContain('- PASS: Alpha (#1) [a]')
    expect(r.details).toContain('- FAIL: Beta [b]\n  Note: broke on save')
    expect(r.details).toContain('- NOT DONE: Delta [d]')
    expect(r.details).toContain('Version 2.0.19')
  })
  it('works with no results', () => {
    const r = testResultsReport(groups, {}, '')
    expect(r.counts.open).toBe(4)
    expect(r.message).toContain('unknown build')
  })
})
