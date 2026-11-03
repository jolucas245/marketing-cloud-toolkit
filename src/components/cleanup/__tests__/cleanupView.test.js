import { describe, it, expect } from 'vitest'
import { ageDays, relativeAge, reasons } from '../cleanupView.js'

const NOW = Date.parse('2026-06-15T12:00:00Z')
const DAY = 86400000

describe('clean-up view helpers', () => {
  it('counts whole days from the created date, else the modified date', () => {
    expect(ageDays({ createdDate: new Date(NOW - 8 * DAY - 1000).toISOString() }, NOW)).toBe(8)
    expect(ageDays({ modifiedDate: new Date(NOW - 2 * DAY).toISOString() }, NOW)).toBe(2)
    expect(ageDays({}, NOW)).toBeNull()
    expect(ageDays({ createdDate: 'not a date' }, NOW)).toBeNull()
  })

  it('words the age', () => {
    expect(relativeAge(0)).toBe('today')
    expect(relativeAge(1)).toBe('yesterday')
    expect(relativeAge(6)).toBe('6 days ago')
    expect(relativeAge(45)).toBe('over a month ago')
    expect(relativeAge(170)).toBe('over 5 months ago')
    expect(relativeAge(800)).toBe('over 2 years ago')
    expect(relativeAge(null)).toBe('')
  })

  it('says whether an activity target is listed and which activity writes a DE', () => {
    const acts = [{ name: 'SFMCQS_act_1', targetName: 'SFMCQS_sql_1' }, { name: 'SFMCQS_act_2', targetName: 'Other' }, { name: 'SFMCQS_act_3' }]
    const des = [{ name: 'SFMCQS_sql_1' }, { name: 'SFMCQS_sql_2' }]
    const r = reasons(acts, des)
    expect(r.activity(acts[0])).toEqual({ target: 'SFMCQS_sql_1', targetListed: true })
    expect(r.activity(acts[1])).toEqual({ target: 'Other', targetListed: false })
    expect(r.activity(acts[2])).toEqual({ target: '', targetListed: false })
    expect(r.de(des[0])).toEqual({ writer: 'SFMCQS_act_1' })
    expect(r.de(des[1])).toEqual({ writer: '' })
  })
})
