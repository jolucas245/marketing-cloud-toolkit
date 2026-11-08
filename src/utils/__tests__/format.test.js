import { describe, it, expect } from 'vitest'
import { formatDateTime, formatDate, isPlaceholderDate, plural } from '../format.js'
import { describeRecurrence } from '../ical.js'

describe('SFMC placeholder dates (live test, 2026-11-07)', () => {
  it('shows nothing for 0001-01-01 and 1900-01-01', () => {
    expect(formatDateTime('0001-01-01T00:00:00')).toBe('')
    expect(formatDate('0001-01-01T00:00:00')).toBe('')
    expect(formatDateTime('1900-01-01T00:00:00')).toBe('')
    expect(isPlaceholderDate(new Date('0001-01-01T00:00:00'))).toBe(true)
  })
  it('still formats real dates and keeps text it cannot read', () => {
    expect(formatDateTime('2026-11-04T02:00:00Z')).toMatch(/2026/)
    expect(formatDate('2026-11-04')).toMatch(/2026/)
    expect(formatDateTime('soon')).toBe('soon')
    expect(formatDateTime('')).toBe('')
  })
})

describe('describeRecurrence UNTIL (live test, 2026-11-07)', () => {
  it('leaves out SFMC\'s no-end date 2079-06-06', () => {
    expect(describeRecurrence('FREQ=HOURLY;INTERVAL=1;UNTIL=20790606T030000')).toBe('Every hour')
  })
  it('shows a real end date as a date', () => {
    expect(describeRecurrence('FREQ=DAILY;UNTIL=20270115T000000')).toMatch(/^Every day, until .*2027/)
  })
})

describe('plural', () => {
  it('uses the singular for exactly one', () => {
    expect(plural(1, 'run')).toBe('1 run')
    expect(plural(0, 'run')).toBe('0 runs')
    expect(plural(1200, 'automation')).toMatch(/^1.200 automations$|^1,200 automations$/)
  })
})
