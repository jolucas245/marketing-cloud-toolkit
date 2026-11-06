import { describe, it, expect } from 'vitest'
import { isProxy, nextTick } from 'vue'
import { useStoredSetting } from '../useStoredSetting.js'

// Chrome stores a reactive (Proxy) array as an object ({ 0: ..., 1: ... }), so the
// helper must hand chrome.storage the plain value (found with Customize Home, 2026-11-06).
describe('useStoredSetting', () => {
  it('stores the plain value, not the reactive proxy', async () => {
    const sets = []
    globalThis.chrome = { storage: { local: { get: (k, cb) => cb({}), set: (o) => sets.push(o) }, onChanged: { addListener: () => {} } } }
    const { value } = useStoredSetting('k', null)
    value.value = { order: ['a', 'b'], hidden: ['x'] }
    await nextTick()
    expect(sets).toHaveLength(1)
    expect(isProxy(sets[0].k)).toBe(false)
    expect(Array.isArray(sets[0].k.order)).toBe(true)
    expect(sets[0].k).toEqual({ order: ['a', 'b'], hidden: ['x'] })
  })
})
