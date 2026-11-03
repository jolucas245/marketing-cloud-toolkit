import { describe, it, expect } from 'vitest'
import { aiAvailability, createAiSession, buildAiPrompt, readAiAnswer, MAX_FIELDS } from '../aiAssist.js'

describe('AI Assist (feedback #1028)', () => {
  it('reads availability from the current and the older Prompt API', async () => {
    expect(await aiAvailability({})).toBe('unsupported')
    expect(await aiAvailability({ LanguageModel: { availability: async () => 'downloadable' } })).toBe('downloadable')
    expect(await aiAvailability({ ai: { languageModel: { capabilities: async () => ({ available: 'readily' }) } } })).toBe('available')
    expect(await aiAvailability({ LanguageModel: { availability: async () => { throw new Error('x') } } })).toBe('unavailable')
  })
  it('creates a session with the system prompt', async () => {
    let got
    await createAiSession('SYS', { g: { LanguageModel: { create: async (o) => { got = o; return {} } } } })
    expect(got.initialPrompts).toEqual([{ role: 'system', content: 'SYS' }])
  })
  it('builds the fix prompt from the SQL, problems and tables only', () => {
    const p = buildAiPrompt({ mode: 'fix', sql: 'SELECT x FROM Y', problems: ['Invalid column name x', ''], tables: [{ name: 'Y', kind: 'data extension', fields: [{ name: 'a', type: 'Text' }] }] })
    expect(p).toContain('- Invalid column name x')
    expect(p).toContain('```sql\nSELECT x FROM Y\n```')
    expect(p).toContain('- Y (data extension): a (Text)')
  })
  it('cuts long field lists', () => {
    const fields = Array.from({ length: MAX_FIELDS + 5 }, (_, i) => ({ name: `f${i}` }))
    expect(buildAiPrompt({ mode: 'write', request: 'all', tables: [{ name: 'T', fields }] })).toContain('and 5 more')
  })
  it('reads the SQL and the note from an answer', () => {
    expect(readAiAnswer('Here:\n```sql\nSELECT 1 AS a\n```\nIt returns one.')).toEqual({ sql: 'SELECT 1 AS a', note: 'Here:\n\nIt returns one.' })
    expect(readAiAnswer('Try SELECT a FROM b')).toEqual({ sql: 'SELECT a FROM b', note: 'Try' })
    expect(readAiAnswer('No idea')).toEqual({ sql: '', note: 'No idea' })
  })
})
