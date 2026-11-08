import { describe, it, expect } from 'vitest'
import { FEATURE_GROUPS } from '../features.js'
import { LINT_RULES } from '../../utils/sqlLint.js'

const items = FEATURE_GROUPS.flatMap((g) => g.items || [])
const text = (i) => `${i.how || ''} ${i.detail || ''}`

// The Features page said "About 40 rules" and "The wand button" (live test, 2026-11-07).
describe('Features page text', () => {
  it('gives the number of SQL check rules there are', () => {
    const lint = items.find((i) => /rules catch what SFMC rejects/.test(i.detail || ''))
    expect(lint.detail.startsWith(`${LINT_RULES.length} rules `)).toBe(true)
  })
  it('points Fix all at the Edit menu', () => {
    const fix = items.find((i) => i.title === 'Fix all')
    expect(fix.how).toBe('Edit > Fix all in a panel')
    expect(items.some((i) => /wand/i.test(text(i)))).toBe(false)
  })
})
