import { describe, it, expect } from 'vitest'
import { topPreviewSql } from '../previewSql.js'

describe('Preview with TOP 10 (feedback #1028)', () => {
  it('adds TOP after SELECT and DISTINCT', () => {
    expect(topPreviewSql('SELECT a FROM x')).toBe('SELECT TOP 10 a FROM x')
    expect(topPreviewSql('select distinct a from x;')).toBe('select distinct TOP 10 a from x')
  })
  it('replaces an existing TOP, PERCENT included', () => {
    expect(topPreviewSql('SELECT TOP 500 a FROM x')).toBe('SELECT TOP 10 a FROM x')
    expect(topPreviewSql('SELECT TOP (5) PERCENT a FROM x')).toBe('SELECT TOP 10 a FROM x')
  })
  it('skips comments before the SELECT and leaves subqueries alone', () => {
    expect(topPreviewSql('-- select me\nSELECT a FROM (SELECT b FROM y) z')).toBe('-- select me\nSELECT TOP 10 a FROM (SELECT b FROM y) z')
  })
  it('wraps set operations', () => {
    expect(topPreviewSql('SELECT a FROM x UNION SELECT a FROM y')).toBe('SELECT TOP 10 *\nFROM (\nSELECT a FROM x UNION SELECT a FROM y\n) AS toolkit_preview')
  })
  it('gives nothing without a SELECT', () => {
    expect(topPreviewSql('')).toBe('')
    expect(topPreviewSql('UPDATE x SET a = 1')).toBe('')
  })
})

describe('set operations at the top level only', async () => {
  const { hasSetOperation } = await import('../previewSql.js')
  it('ignores UNION in brackets, strings, names and comments', () => {
    expect(hasSetOperation("SELECT a FROM (SELECT a FROM x UNION SELECT a FROM y) z")).toBe(false)
    expect(hasSetOperation("SELECT 'union' AS a, [Union Field] FROM x -- union\n")).toBe(false)
    expect(hasSetOperation('SELECT a FROM x union all SELECT a FROM y')).toBe(true)
    expect(hasSetOperation('SELECT reunion FROM x')).toBe(false)
  })
})
