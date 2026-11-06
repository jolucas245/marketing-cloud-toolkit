import { describe, it, expect } from 'vitest'
import { normalizeDENode } from '../deCatalog.js'

// Email validation lists only sendable data extensions (user, 2026-11-06).
describe('normalizeDENode keeps whether a DE is sendable', () => {
  it('true, false, or null when SFMC does not say', () => {
    expect(normalizeDENode({ id: 1, name: 'A', isSendable: true }, 'local').isSendable).toBe(true)
    expect(normalizeDENode({ id: 2, name: 'B', isSendable: false }, 'local').isSendable).toBe(false)
    expect(normalizeDENode({ id: 3, name: 'C' }, 'local').isSendable).toBe(null)
  })
})
