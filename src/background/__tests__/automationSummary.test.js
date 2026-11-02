import { describe, it, expect, vi } from 'vitest'
import { automationSummary } from '../automationSummary.js'
import { messageAllowed } from '../senders.js'

describe('automationSummary', () => {
  it('reads the automation and describes each activity', async () => {
    const fetcher = vi.fn(async ({ url }) => {
      if (/automations\/auto1$/.test(url)) return { name: 'Nightly', status: 2, key: 'k1', steps: [
        { name: 'Load', activities: [{ name: 'Q1', objectTypeId: 300, activityObjectId: 'q1' }] },
        { name: '', activities: [{ name: 'Wait', objectTypeId: 467, activityObjectId: 'w1' }, { name: 'S1', objectTypeId: 423, activityObjectId: 's1' }] },
      ] }
      if (/queries\/q1$/.test(url)) return { name: 'Q1', queryText: 'SELECT 1 AS x', targetName: 'Target DE', targetUpdateTypeName: 'Overwrite' }
      if (/scripts\/s1$/.test(url)) throw new Error('SFMC API error 404')
      throw new Error('unexpected ' + url)
    })
    const s = await automationSummary('s10', 'auto1', fetcher)
    expect(s.name).toBe('Nightly')
    expect(s.steps.map((x) => x.activities.map((a) => a.title))).toEqual([['Q1'], ['Wait', 'S1']])
    const q = s.steps[0].activities[0]
    expect(q.code.text).toBe('SELECT 1 AS x')
    expect(q.rows.some(([, v]) => /Target DE/.test(v))).toBe(true)
    expect(s.steps[1].activities[1].error).toMatch(/404/)
    expect(fetcher).toHaveBeenCalledTimes(3)
  })
  it('refuses anything but a stack and an automation id', async () => {
    await expect(automationSummary('evil.com', 'a')).rejects.toThrow('Not an automation')
    await expect(automationSummary('s10', '../x')).rejects.toThrow('Not an automation')
  })
  it('lets content scripts ask only with a valid stack and id', () => {
    const sender = { id: 'ext', url: 'https://mc.s10.exacttarget.com/cloud/', tab: { id: 1 } }
    const ok = (m) => messageAllowed(m, sender, 'chrome-extension://ext/')
    expect(ok({ type: 'AUTOMATION_SUMMARY', stack: 's10', id: 'abc-123' })).toBe(true)
    expect(ok({ type: 'AUTOMATION_SUMMARY', stack: 's10', id: '../../x' })).toBe(false)
    expect(ok({ type: 'AUTOMATION_SUMMARY', stack: 'x', id: 'abc' })).toBe(false)
  })
})
