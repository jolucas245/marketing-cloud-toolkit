import { describe, it, expect } from 'vitest'
import {
  maskPersonal, fitText, isChromeBrowser, aiPresent, docText, buildAiTaskPrompt, buildAiPrompt,
  buildFieldsPrompt, readFieldSuggestions, MAX_PROMPT_CHARS,
} from '../aiAssist.js'

describe('maskPersonal (feedback #1029)', () => {
  it('replaces email addresses anywhere', () => {
    expect(maskPersonal("WHERE Email = 'jane.doe+x@example.co.uk' OR x = 1")).toBe("WHERE Email = '[email]' OR x = 1")
    expect(maskPersonal('Recipient: ops@acme.com')).toBe('Recipient: [email]')
  })
  it('replaces phone numbers and record IDs inside quoted values, keeps dates', () => {
    expect(maskPersonal("Mobile = '(604) 555-0199'")).toBe("Mobile = '[phone]'")
    expect(maskPersonal("ContactId = '0035e00000AbCdE1FG'")).toBe("ContactId = '[record id]'")
    expect(maskPersonal("d > '2026-11-03 10:00:00'")).toBe("d > '2026-11-03 10:00:00'")
    expect(maskPersonal("Status = 'Active'")).toBe("Status = 'Active'")
  })
  it('replaces international phone numbers in text', () => {
    expect(maskPersonal('Send to +1 604 555 0199 daily')).toBe('Send to [phone] daily')
  })
  it('leaves SQL structure alone', () => {
    const sql = 'SELECT TOP 10 s.SubscriberKey FROM _Sent s JOIN _Open o ON o.JobID = s.JobID WHERE s.EventDate > DATEADD(day, -30, GETDATE())'
    expect(maskPersonal(sql)).toBe(sql)
  })
})

describe('fitText', () => {
  it('cuts long text with a note', () => {
    const t = fitText('x'.repeat(50), 10)
    expect(t.startsWith('x'.repeat(10))).toBe(true)
    expect(t).toMatch(/40 more characters left out/)
    expect(fitText('short', 10)).toBe('short')
  })
})

describe('isChromeBrowser / aiPresent', () => {
  it('needs the Google Chrome brand when brands are given', () => {
    expect(isChromeBrowser({ userAgentData: { brands: [{ brand: 'Google Chrome' }, { brand: 'Chromium' }] } })).toBe(true)
    expect(isChromeBrowser({ userAgentData: { brands: [{ brand: 'Microsoft Edge' }, { brand: 'Chromium' }] } })).toBe(false)
    expect(isChromeBrowser({ userAgent: 'Mozilla/5.0 Chrome/140.0 Safari/537.36' })).toBe(true)
    expect(isChromeBrowser({ userAgent: 'Mozilla/5.0 Chrome/140.0 Safari/537.36 Edg/140.0' })).toBe(false)
  })
  it('sees the Prompt API', () => {
    expect(aiPresent({})).toBe(false)
    expect(aiPresent({ LanguageModel: {} })).toBe(true)
  })
})

describe('text tasks', () => {
  it('turns an export document into text without pictures, code cut', () => {
    const t = docText({ title: 'Daily', blocks: [
      { type: 'h', level: 2, text: 'Overview' }, { type: 'kv', rows: [['Status', 'Running']] },
      { type: 'svg', svg: '<svg/>' }, { type: 'table', columns: ['A', 'B'], rows: [['1', '2']] },
      { type: 'code', text: 'y'.repeat(3000) },
    ] })
    expect(t).toContain('# Daily')
    expect(t).toContain('Status: Running')
    expect(t).toContain('1 | 2')
    expect(t).not.toContain('<svg')
    expect(t).toMatch(/1,500 more characters left out/)
  })
  it('masks and limits task prompts', () => {
    const p = buildAiTaskPrompt('automation', { text: `Notify a@b.com\n${'z'.repeat(MAX_PROMPT_CHARS)}` })
    expect(p).toContain('[email]')
    expect(p).not.toContain('a@b.com')
    expect(p.length).toBeLessThan(MAX_PROMPT_CHARS + 100)
    expect(buildAiTaskPrompt('explainQuery', { sql: 'SELECT 1 AS x', name: 'Q' })).toContain('```sql\nSELECT 1 AS x\n```')
    expect(() => buildAiTaskPrompt('nope', {})).toThrow()
  })
  it('masks the write and fix prompts', () => {
    const p = buildAiPrompt({ mode: 'fix', sql: "SELECT * FROM X WHERE e = 'x@y.com'", problems: [] })
    expect(p).toContain("'[email]'")
  })
})

describe('Create DE suggestions', () => {
  it('sends field names and guessed types only', () => {
    const p = buildFieldsPrompt([{ name: 'Email', type: 'EmailAddress' }, { name: 'Notes', type: 'Text', length: 255 }], 'sign-ups')
    expect(p).toContain('for: sign-ups')
    expect(p).toContain('- Email (guessed from the data: EmailAddress)')
    expect(p).toContain('- Notes (guessed from the data: Text, 255)')
  })
  it('reads the answer lines', () => {
    const s = readFieldSuggestions('Name | Type | Length | Decimals | Primary key\nSubscriberKey | Text | 254 | | yes\n- Amount | decimal | 18 | 2 | no\nJunk line\nX | Banana | 1 | | no')
    expect(s).toEqual([
      { name: 'SubscriberKey', type: 'Text', length: 254, scale: null, isPrimaryKey: true },
      { name: 'Amount', type: 'Decimal', length: 18, scale: 2, isPrimaryKey: false },
    ])
  })
})
