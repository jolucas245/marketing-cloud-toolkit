import { describe, it, expect } from 'vitest'
import { isAutoName, suggestQueryName, NEW_QUERY_NAME } from '../queryNames.js'

describe('Run Query panel names (feedback #1053)', () => {
  it('names a query after its tables', () => {
    expect(suggestQueryName('')).toBe(NEW_QUERY_NAME)
    expect(suggestQueryName('SELECT 1')).toBe(NEW_QUERY_NAME)
    expect(suggestQueryName('SELECT * FROM [My DE] d')).toBe('My DE')
    expect(suggestQueryName('SELECT s.x FROM _Sent s JOIN _Job j ON s.JobID = j.JobID')).toBe('_Sent, _Job')
    expect(suggestQueryName(`SELECT jb.EmailName, COUNT(*) AS c FROM _Sent s
      INNER JOIN _Job jb ON s.JobID = jb.JobID
      INNER JOIN _JourneyActivity ja ON 1 = 1
      INNER JOIN _Journey j ON ja.VersionID = j.VersionID GROUP BY jb.EmailName`)).toBe('Counts from _Sent, _Job +2')
  })
  it('knows which names the Toolkit made', () => {
    expect(isAutoName({ name: 'Panel 1 · 11/4/2026, 2:06:35 PM' })).toBe(true)
    expect(isAutoName({ name: '' })).toBe(true)
    expect(isAutoName({ name: 'New query', autoName: true })).toBe(true)
    expect(isAutoName({ name: 'Panel 1 · x', autoName: false })).toBe(false)
    expect(isAutoName({ name: 'Weekly opens' })).toBe(false)
    expect(isAutoName(null)).toBe(false)
  })
})
