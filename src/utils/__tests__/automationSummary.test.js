import { describe, it, expect } from 'vitest'
import { wallClock, restWallClock, timeZoneLabel, automationOverviewRows, scheduleSummary } from '../automationSummary.js'
import { activityGlyph } from '../activityIcons.js'
import { AS_GLYPHS, AS_GLYPH_BY_TYPE } from '../../data/automationStudioIcons.js'

// From the live check on s10 (2026-11-10): "Appointment Reminders" in Automation Studio
// shows Starting 05/22/2022 12:00 AM, (GMT-04:00) Atlantic Time (Canada), Paused.
const rest = {
  id: '8b09114e-20cd-4849-b7b4-bf8328a0e4e7', name: 'Appointment Reminders', description: '', key: '75c6', type: 'scheduled', status: 'PausedSchedule',
  schedule: { startDate: '2022-05-22T06:00:00Z', endDate: '2079-06-06T06:00:00Z', scheduledTime: '0001-01-01T08:00:00Z', icalRecur: 'FREQ=HOURLY;UNTIL=20790606T030000;INTERVAL=1', timezoneName: 'Atlantic Standard Time', scheduleStatus: 'paused', timezoneId: 70 },
  steps: [{ activities: [{ objectTypeId: 300 }] }, { activities: [{ objectTypeId: 467 }] }],
}
const legacy = {
  createdDate: '2022-05-20T23:31:02.737Z', createdBy: { name: 'Pat Doe' }, lastSaveDate: '2024-12-12T17:13:06.597Z', lastSavedBy: { name: 'Sam Roe' },
  folderPath: 'my automations', automationType: 'scheduled',
  scheduleObject: { description: 'Will run every hour, effective 5/22/2022 at 12:00 AM through Monday, June 5, 2079', startDate: '2022-05-22T00:00:00', timeZoneId: 70, scheduleStatus: 'paused' },
}
const same = (iso) => new Date(Date.UTC(...iso)).toLocaleString(undefined, { timeZone: 'UTC', year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })

describe('Automation Studio summary (2026-11-10)', () => {
  it('shows the schedule start as its wall clock, from either record', () => {
    expect(wallClock('2022-05-22T00:00:00')).toBe(same([2022, 4, 22, 0, 0]))
    expect(restWallClock('2022-05-22T06:00:00Z')).toBe(same([2022, 4, 22, 0, 0]))
    expect(wallClock('0001-01-01T00:00:00')).toBe('')
  })

  it("uses Automation Studio's time zone names", () => {
    expect(timeZoneLabel({ timezoneId: 70, timezoneName: 'Atlantic Standard Time' })).toBe('(GMT-04:00) Atlantic Time (Canada)')
    expect(timeZoneLabel({ timezoneId: 99999, timezoneName: 'Somewhere' })).toBe('Somewhere')
  })

  it('lists the schedule like the starting source panel', () => {
    const s = scheduleSummary({ ...rest, legacy })
    const rows = Object.fromEntries(s.rows)
    expect(rows.Status).toBe('Paused')
    expect(rows.Repeat).toMatch(/hour/i)
    expect(rows.Starting).toBe(same([2022, 4, 22, 0, 0]))
    expect(rows.Ending).toBe('Never')
    expect(rows['Time zone']).toBe('(GMT-04:00) Atlantic Time (Canada)')
    expect(rows['Next run']).toBe('—')
    expect(s.note).toMatch(/suspended/)
    expect(s.description).toMatch(/every hour/)
    // Without the legacy record the REST start gives the same wall clock.
    expect(Object.fromEntries(scheduleSummary(rest).rows).Starting).toBe(same([2022, 4, 22, 0, 0]))
  })

  it('lists the Summary fields in Automation Studio order', () => {
    const rows = automationOverviewRows({ ...rest, legacy })
    expect(rows.map(([k]) => k)).toEqual(['Name', 'Folder', 'External key', 'Starting source', 'Workflow', 'Status', 'Created by', 'Created', 'Last saved by', 'Last saved', 'ID'])
    const r = Object.fromEntries(rows)
    expect(r.Workflow).toBe('2 activities in 2 steps')
    expect(r['Created by']).toBe('Pat Doe')
    expect(r['Last saved by']).toBe('Sam Roe')
    expect(r.Folder).toBe('my automations')
    expect(r['Starting source']).toBe('Schedule')
  })
})

describe("Automation Studio's icons (2026-11-10)", () => {
  it('maps every type in its table to a glyph that exists', () => {
    for (const g of Object.values(AS_GLYPH_BY_TYPE)) expect(AS_GLYPHS[g]).toMatch(/^data:image\/svg\+xml/)
    expect(activityGlyph(300, AS_GLYPH_BY_TYPE)).toBe('SQLQuery-white')
    expect(activityGlyph('423', AS_GLYPH_BY_TYPE)).toBe('SSJS-white')
    expect(activityGlyph('SQL Query', AS_GLYPH_BY_TYPE)).toBe('SQLQuery-white')
    expect(activityGlyph('Data Extract', AS_GLYPH_BY_TYPE)).toBe('dataExtract-white')
    expect(activityGlyph(12345, AS_GLYPH_BY_TYPE)).toBe('undefined-activity')
    expect(activityGlyph(null, AS_GLYPH_BY_TYPE)).toBe('undefined-activity')
  })
})
