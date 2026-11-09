import { describe, it, expect } from 'vitest'
import { healthChips } from '../automationHealth.js'

describe('healthChips (live test, 2026-11-07)', () => {
  it('labels the live shape and leaves out id and hasChanged', () => {
    const chips = healthChips({ id: 'x', successCount: 1, successPercentage: '100%', errorCount: 0, errorPercentage: '0%', averageTime: '92', count: '1', hasChanged: false })
    expect(chips).toEqual([
      { label: 'Runs', value: '1' },
      { label: 'Succeeded', value: '1 (100%)' },
      { label: 'Failed', value: '0 (0%)', tone: '' },
      { label: 'Average run', value: '1 min 32 s' },
    ])
  })
  it('accepts the response still wrapped in data, without averageTime', () => {
    const chips = healthChips({ data: { successCount: 0, successPercentage: '0%', errorCount: 4, errorPercentage: '100%', count: '4' } })
    expect(chips.map((c) => c.label)).toEqual(['Runs', 'Succeeded', 'Failed'])
    expect(chips[2]).toEqual({ label: 'Failed', value: '4 (100%)', tone: 'bad' })
  })
  it('returns nothing for empty answers', () => {
    expect(healthChips(null)).toEqual([])
    expect(healthChips('x')).toEqual([])
  })
})
