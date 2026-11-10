import { describe, it, expect } from 'vitest'
import { parseAnswer, parseInline } from '../aiMarkdown.js'

describe('aiMarkdown (#1096)', () => {
  it('reads bold, italic and code inline', () => {
    expect(parseInline('a **What it does:** b `x` *y*')).toEqual([
      { text: 'a ' }, { text: 'What it does:', bold: true }, { text: ' b ' }, { text: 'x', code: true }, { text: ' ' }, { text: 'y', italic: true },
    ])
  })
  it('keeps underscores inside names', () => {
    expect(parseInline('DE My_Table_Name here')).toEqual([{ text: 'DE My_Table_Name here' }])
  })
  it('reads the answer from the feedback screenshot', () => {
    const b = parseAnswer('Runs hourly. Here is a rundown:\n\n* **What it does:** gathers data.\n* **When it runs:** Hourly.\n\n1. one\n2. two\n\n## Risks\n```sql\nSELECT 1\n```')
    expect(b.map((x) => x.type)).toEqual(['p', 'ul', 'ol', 'h', 'code'])
    expect(b[1].items).toHaveLength(2)
    expect(b[1].items[0].parts[0]).toEqual({ text: 'What it does:', bold: true })
    expect(b[3].level).toBe(2)
    expect(b[4].text).toBe('SELECT 1')
  })
  it('joins wrapped paragraph lines and keeps plain text', () => {
    expect(parseAnswer('one\ntwo')).toEqual([{ type: 'p', parts: [{ text: 'one two' }] }])
    expect(parseAnswer('')).toEqual([])
  })
})
