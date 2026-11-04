import { describe, it, expect } from 'vitest'
import { buildSqlSystem, viewsFor, topicsFor, viewLines, aiSqlProblems, promptForCopy, MAX_SYSTEM_CHARS } from '../aiSqlGuide.js'
import RULES from '@/data/aiSqlRules.json'

const rules = {
  core: ['Only SELECT.', 'Name every column.'],
  topics: {
    dates: { when: ['days', 'yesterday'], rules: ['Data view dates are Central Standard Time.'] },
    dedupe: { when: ['duplicate', 'one row per'], rules: ['Use ROW_NUMBER() OVER (PARTITION BY key ...) and keep row 1.'] },
  },
  examples: [
    { topics: ['dates'], request: 'opens in the last 7 days', sql: 'SELECT o.SubscriberKey FROM _Open o WHERE o.EventDate > DATEADD(DAY, -7, GETDATE())' },
    { topics: ['dedupe'], request: 'one row per key', sql: 'SELECT x.Key FROM (SELECT Key, ROW_NUMBER() OVER (PARTITION BY Key ORDER BY Key) AS rn FROM T) x WHERE x.rn = 1' },
  ],
}

describe('AI SQL guide (feedback #1044)', () => {
  it('picks data views from plain words and from names', () => {
    expect(viewsFor('subscribers who opened but never clicked')).toEqual(expect.arrayContaining(['_Open', '_Click', '_Subscribers']))
    expect(viewsFor('SELECT * FROM _Bounce')).toContain('_Bounce')
    expect(viewsFor('a list of products')).toEqual([])
  })

  it('picks topics by keyword only', () => {
    expect(topicsFor('opens in the last 30 days', rules)).toEqual(['dates'])
    expect(topicsFor('remove duplicate rows', rules)).toEqual(['dedupe'])
  })

  it('gives data view fields and their joins, skipping tables the user already listed', () => {
    const { fields, joins } = viewLines(['_Open', '_Click'])
    expect(fields.join('\n')).toMatch(/_Open: .*SubscriberKey/)
    expect(joins[0]).toMatch(/_Open\.JobID = _Click\.JobID AND .*SubscriberID/)
    expect(viewLines(['_Open'], ['_Open']).fields).toEqual([])
  })

  it('builds instructions with only what the request needs', () => {
    const { text, topics, views } = buildSqlSystem({ request: 'subscribers who opened in the last 7 days' }, rules)
    expect(topics).toEqual(['dates'])
    expect(views).toEqual(expect.arrayContaining(['_Open', '_Subscribers']))
    expect(text).toContain('Central Standard Time')
    expect(text).not.toContain('ROW_NUMBER')
    expect(text).toContain('Example. Request: opens in the last 7 days')
    expect(text).toMatch(/```sql code block/)
  })

  it('stays under the size limit by dropping examples, then topics', () => {
    const big = { ...rules, topics: { dates: { when: ['days'], rules: ['x'.repeat(MAX_SYSTEM_CHARS)] } } }
    const { text, topics } = buildSqlSystem({ request: 'last 7 days' }, big)
    expect(text.length).toBeLessThanOrEqual(MAX_SYSTEM_CHARS)
    expect(topics).toEqual([])
  })

  it('reports SQL check problems as text, and copies the whole prompt', () => {
    expect(aiSqlProblems('SELECT Email FROM MyDE ORDER BY Email').some((p) => /^QS\d+:/.test(p))).toBe(true)
    expect(aiSqlProblems('SELECT o.SubscriberKey FROM _Open o WHERE o.EventDate >= DATEADD(DAY, -7, GETDATE())')).toEqual([])
    expect(promptForCopy('SYS', 'ASK')).toBe('SYS\n\n---\n\nASK')
  })

  it('ships rules that fit and parse', () => {
    expect(RULES.core.length).toBeGreaterThan(3)
    expect(Object.keys(RULES.topics).length).toBeGreaterThan(3)
    for (const t of Object.values(RULES.topics)) { expect(t.when.length).toBeGreaterThan(0); expect(t.rules.length).toBeGreaterThan(0) }
    // Every topic at once still fits.
    const all = buildSqlSystem({ request: Object.values(RULES.topics).flatMap((t) => t.when).join(' ') })
    expect(all.text.length).toBeLessThanOrEqual(MAX_SYSTEM_CHARS)
  })
})
