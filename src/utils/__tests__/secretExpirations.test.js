import { describe, it, expect } from 'vitest'
import { secretAlerts, daysUntil, expiryText, alertKey } from '../secretExpirations.js'

const now = Date.parse('2026-11-12T12:00:00Z')
const list = [
  { packageId: 'a', name: 'Expired', expires: '2026-11-10T12:00:00Z' },
  { packageId: 'b', name: 'In 5 days', expires: '2026-11-17T17:46:52Z' },
  { packageId: 'c', name: 'In 7 days', expires: '2026-11-19T12:00:00Z' },
  { packageId: 'd', name: 'In 8 days', expires: '2026-11-20T13:00:00Z' },
  { packageId: 'e', name: 'No date', expires: '' },
]

describe('package secret alerts (user, 2026-11-05)', () => {
  it('alerts only about secrets expiring within a week, or expired, soonest first', () => {
    const r = secretAlerts(list, now)
    expect(r.map((s) => s.name)).toEqual(['Expired', 'In 5 days', 'In 7 days'])
    expect(r[0].expired).toBe(true)
    expect(r[1]).toMatchObject({ expired: false, days: 5 })
    expect(secretAlerts([], now)).toEqual([])
    expect(secretAlerts(null, now)).toEqual([])
  })

  it('words the expiry', () => {
    expect(expiryText(list[0], now)).toBe('expired 2 days ago')
    expect(expiryText(list[1], now)).toBe('expires in 5 days')
    expect(expiryText({ expires: '2026-11-12T20:00:00Z' }, now)).toBe('expires within a day')
    expect(expiryText({ expires: '2026-11-12T08:00:00Z' }, now)).toBe('expired today')
    expect(expiryText({ expires: 'x' }, now)).toBe('expiry unknown')
    expect(daysUntil('nope', now)).toBe(null)
  })

  it('keys an alert by stack, package and expiry, so a renewed secret alerts again', () => {
    expect(alertKey('s12', list[1])).toBe('s12:b:2026-11-17T17:46:52Z')
    expect(alertKey('s12', { ...list[1], expires: '2027-11-17T17:46:52Z' })).not.toBe(alertKey('s12', list[1]))
  })
})
