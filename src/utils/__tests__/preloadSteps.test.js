import { describe, it, expect } from 'vitest'
import { PRELOAD_STEPS, emptyStepState, countText, durationText, preloadSummary, stepIsFresh, scopeKey, plural } from '../preloadSteps.js'

const step = (id) => PRELOAD_STEPS.find((s) => s.id === id)
const states = (map) => Object.fromEntries(PRELOAD_STEPS.map((s) => [s.id, { ...emptyStepState(), ...(map[s.id] || {}) }]))

describe('preloadSteps (feedback #1037)', () => {
  it('lists unique parts, each with a label, noun and the pages that use it', () => {
    const ids = PRELOAD_STEPS.map((s) => s.id)
    expect(new Set(ids).size).toBe(ids.length)
    for (const s of PRELOAD_STEPS) {
      expect(s.label).toBeTruthy()
      expect(s.noun).toHaveLength(2)
      expect(s.usedBy).toBeTruthy()
      expect(['overview', 'usage', 'sharedDEs', 'deDetails']).toContain(s.kind)
    }
    // Send Email activities need the automations, so those load first.
    expect(ids.indexOf('automations')).toBeLessThan(ids.indexOf('emailsends'))
  })

  it('writes counts in words', () => {
    expect(plural(1, ['data extension', 'data extensions'])).toBe('1 data extension')
    expect(countText(step('deDetails'), { state: 'done', count: 326, total: 326 })).toBe('326 data extensions')
    expect(countText(step('queries'), { state: 'done', count: 1, total: 1 })).toBe('1 query activity')
    expect(countText(step('automations'), { state: 'done', count: 2000, total: 2345, capped: true })).toBe('2,000 automations (first 2,000 of 2,345)')
    expect(countText(step('assets'), { state: 'running', done: 100, total: 1200 })).toBe('100 of 1,200')
    expect(countText(step('assets'), { state: 'running', done: 0, total: 0 })).toBe('')
    expect(countText(step('assets'), { state: 'failed', count: null })).toBe('')
    expect(countText(step('assets'), emptyStepState())).toBe('')
  })

  it('writes times', () => {
    expect(durationText(850)).toBe('850 ms')
    expect(durationText(1234)).toBe('1.2 s')
    expect(durationText(125000)).toBe('2 min 5 s')
    expect(durationText(120000)).toBe('2 min')
    expect(durationText(null)).toBe('')
  })

  it('sums up as "Loaded N of M"', () => {
    const total = PRELOAD_STEPS.length
    expect(preloadSummary(states({}))).toMatchObject({ loaded: 0, failed: 0, finished: 0, total, percent: 0, text: `Loaded 0 of ${total}` })
    const s = preloadSummary(states({ automationOverview: { state: 'done' }, journeyOverview: { state: 'failed' }, queries: { state: 'stopped' } }))
    expect(s).toMatchObject({ loaded: 1, failed: 1, stopped: 1, finished: 2, percent: Math.round(200 / total) })
    expect(s.text).toBe(`Loaded 1 of ${total}, 1 failed, stopped`)
    expect(preloadSummary(undefined).text).toBe(`Loaded 0 of ${total}`)
  })

  it('keeps a part loaded in the last 10 minutes', () => {
    expect(stepIsFresh({ state: 'done', finishedAt: 1000 }, 1000 + 9 * 60000)).toBe(true)
    expect(stepIsFresh({ state: 'done', finishedAt: 1000 }, 1000 + 11 * 60000)).toBe(false)
    expect(stepIsFresh({ state: 'failed', finishedAt: 1000 }, 1001)).toBe(false)
  })

  it('keys the state by stack and business unit', () => {
    expect(scopeKey('s10', 123)).toBe('s10:123')
    expect(scopeKey('s10', null)).toBe('s10:')
    expect(scopeKey(null, 1)).toBe('')
  })
})
