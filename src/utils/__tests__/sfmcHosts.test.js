import { describe, it, expect } from 'vitest'
import { coreHost, coreOrigin, stackFromCoreHost } from '../sfmcHosts.js'

describe('sfmcHosts', () => {
  it('leaves the stack label out of the core hosts of s1 only', () => {
    expect(coreHost('s1')).toBe('mc.exacttarget.com')
    expect(coreHost('s1', 'members')).toBe('members.exacttarget.com')
    expect(coreHost('s13')).toBe('mc.s13.exacttarget.com')
    expect(coreHost('s13', 'members')).toBe('members.s13.exacttarget.com')
    expect(coreHost('401')).toBe('mc.401.exacttarget.com')
    expect(coreOrigin('s1')).toBe('https://mc.exacttarget.com')
    expect(coreOrigin('s7')).toBe('https://mc.s7.exacttarget.com')
  })

  it('reads the stack back from a core host', () => {
    expect(stackFromCoreHost('mc.exacttarget.com')).toBe('s1')
    expect(stackFromCoreHost('members.exacttarget.com')).toBe('s1')
    expect(stackFromCoreHost('mc.S13.exacttarget.com')).toBe('s13')
    expect(stackFromCoreHost('members.s7.exacttarget.com')).toBe('s7')
  })

  it('does not take other hosts for core hosts', () => {
    expect(stackFromCoreHost('exacttarget.com')).toBeNull()
    expect(stackFromCoreHost('brandcdn.exacttarget.com')).toBeNull()
    expect(stackFromCoreHost('mc.s1.marketingcloudapps.com')).toBeNull()
    expect(stackFromCoreHost('mc.exacttarget.com.evil.test')).toBeNull()
    expect(stackFromCoreHost('')).toBeNull()
    expect(stackFromCoreHost(null)).toBeNull()
  })
})
