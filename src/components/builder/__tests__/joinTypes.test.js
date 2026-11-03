import { describe, it, expect } from 'vitest'
import { joinChoices, describeJoin } from '../joinTypes.js'

describe('join type descriptions', () => {
  it('lists the four join types with the table names in the description', () => {
    const c = joinChoices('A', 'B')
    expect(c.map((j) => j.label)).toEqual(['Inner', 'Left', 'Right', 'Full'])
    expect(c.find((j) => j.value === 'LEFT JOIN').desc).toBe('All A rows, matching B')
    expect(c.find((j) => j.value === 'RIGHT JOIN').desc).toBe('All B rows, matching A')
  })
  it('treats a missing type as INNER JOIN', () => {
    expect(describeJoin(undefined, 'A', 'B')).toBe('Only rows in both')
    expect(describeJoin('FULL OUTER JOIN', 'A', 'B')).toBe('All rows from both')
  })
})
