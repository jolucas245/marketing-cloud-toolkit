import { describe, it, expect } from 'vitest'
import {
  PARTS, NO_DATA_NOTE, CELL_LIMIT, cell, deRecord, fieldRecord, queryRecord, activityRecord, automationRecord, journeyRecord, eventRecord,
  cloudPageRecord, folderRecords, buildSheets, buildJson, buildDoc, allErrors, metadataFileBase,
} from '../metadataExport.js'
import { toMarkdown } from '../exportDoc.js'

const de = deRecord(
  { id: 'de-1', name: 'Sample_Orders', customerKey: 'KEY-1', categoryId: 5, sourceType: null, modifiedDate: '2026-01-02T00:00:00Z' },
  { fields: [{ name: 'OrderId', type: 'Text', length: 50, isPrimaryKey: true, isNullable: false, ordinal: 0 }, { name: 'Total', type: 'Decimal', length: 18, scale: 2, isNullable: true, ordinal: 1 }], folderPath: 'Data Extensions > Test' },
)
const sharedDe = deRecord({ id: 'de-2', name: 'Shared_Thing', customerKey: 'KEY-2', sourceType: 'shared' }, { error: 'Fields: denied' })

const exp = {
  meta: { stack: 's1', buId: 123, buName: 'Test Unit', exportedAt: '2026-02-03T04:05:06.000Z' },
  parts: {
    des: { items: [de, sharedDe], total: 2, capped: false, errors: [] },
    queries: { items: [queryRecord({ queryDefinitionId: 'q1', name: 'Q one', key: 'QK', targetName: 'Sample_Orders', targetKey: 'KEY-1', targetUpdateTypeId: 0, targetUpdateTypeName: 'Overwrite', queryText: 'SELECT 1 AS a' })], total: 1, errors: [] },
    activities: { items: [activityRecord('scripts', { ssjsActivityId: 's1', name: 'Script one', script: 'Platform.Load("core","1");' }), activityRecord('imports', { importDefinitionId: 'i1', name: 'Import one', targetDataExtension: { name: 'Sample_Orders' }, updateTypeId: 3, fileSpec: 'orders.csv' })], total: 2, errors: [{ item: 'Filters', message: 'refused' }] },
    automations: { items: [automationRecord({ id: 'a1', name: 'Auto one' }, { id: 'a1', name: 'Auto one', status: 'Scheduled', schedule: { scheduleStatus: 'active', icalRecur: 'FREQ=DAILY;INTERVAL=1', timezoneName: 'UTC' }, steps: [{ step: 1, name: 'First', activities: [{ name: 'Q one', objectTypeId: 300, activityObjectId: 'q1' }] }, { step: 2, activities: [] }] })], total: 1, errors: [] },
    journeys: { items: [journeyRecord({ id: 'j1', key: 'jk', name: 'Journey one', version: 2, status: 'Published', triggers: [{ type: 'EmailAudience', name: 'Entry', metaData: { eventDefinitionKey: 'EV-1' } }], activities: [{ key: 'A1', name: 'Wait', type: 'WAIT', configurationArguments: { waitDuration: 1, waitUnit: 'DAYS' } }, { key: 'A2', name: 'Mail', type: 'EMAILV2' }] })], total: 1, errors: [] },
    events: { items: [eventRecord({ id: 'e1', eventDefinitionKey: 'EV-1', name: 'Event one', type: 'EmailAudience', dataExtensionName: 'Sample_Orders', interactionCount: 1 })], total: 1, errors: [] },
    cloudpages: { items: [cloudPageRecord({ id: 9, name: 'Page one', customerKey: 'pk', status: 'Published', url: 'https://example.com/p' }, 'Root')], total: 1, errors: [] },
    folders: { items: folderRecords('Data extensions', [{ id: 1, name: 'Data Extensions', parentId: 0 }, { id: 5, name: 'Test', parentId: 1 }]), total: 2, errors: [] },
  },
}

describe('metadata export records (#1036)', () => {
  it('lists the eight parts', () => {
    expect(PARTS.map((p) => p.id)).toEqual(['des', 'queries', 'activities', 'automations', 'journeys', 'events', 'cloudpages', 'folders'])
  })

  it('keeps field settings', () => {
    expect(de.fields[0]).toMatchObject({ name: 'OrderId', primaryKey: true, required: true, length: 50 })
    expect(de.fields[1]).toMatchObject({ scale: 2, required: false })
    expect(fieldRecord({ name: 'x' }).required).toBe(null)
    expect(sharedDe.source).toBe('Shared')
    expect(sharedDe.fields).toBe(null)
  })

  it('reads automation schedules, steps and journey entry sources', () => {
    const a = exp.parts.automations.items[0]
    expect(a.schedule).toMatchObject({ status: 'active', recurrence: 'Every day', timezone: 'UTC' })
    expect(a.steps[0].activities[0]).toMatchObject({ type: 'SQL Query', activityObjectId: 'q1' })
    expect(automationRecord({ id: 'x', name: 'n' }, null).error).toMatch(/could not be read/)
    const j = exp.parts.journeys.items[0]
    expect(j.entrySource.eventDefinitionKey).toBe('EV-1')
    expect(j.activities.map((x) => x.summary)).toEqual(['1 day', ''])
    expect(journeyRecord({ id: 'j', _error: true }).error).toBeTruthy()
  })

  it('builds folder paths and survives loops', () => {
    expect(exp.parts.folders.items.map((f) => f.path)).toEqual(['Data Extensions', 'Data Extensions > Test'])
    const loop = folderRecords('X', [{ id: 1, name: 'A', parentId: 2 }, { id: 2, name: 'B', parentId: 1 }])
    expect(loop.map((f) => f.path).sort()).toEqual(['A > B', 'B > A'])
  })

  it('summarises activities by type', () => {
    expect(exp.parts.activities.items[1]).toMatchObject({ type: 'Import File', summary: 'Target: Sample_Orders; Update type: Add and Update; File: orders.csv' })
    expect(exp.parts.activities.items[0].code).toContain('Platform.Load')
  })
})

describe('metadata export outputs (#1036)', () => {
  it('builds one sheet per part plus fields, steps, journey activities and problems', () => {
    const sheets = buildSheets(exp)
    expect(sheets.map((s) => s.name)).toEqual(['Summary', 'Data extensions', 'DE fields', 'Query activities', 'Other activities', 'Automations', 'Automation steps', 'Journeys', 'Journey activities', 'Entry events', 'CloudPages', 'Folders', 'Problems'])
    const fields = sheets.find((s) => s.name === 'DE fields')
    expect(fields.rows).toEqual([
      ['Sample_Orders', 'KEY-1', 'OrderId', 'Text', '50', '', 'Yes', 'Yes', '', '0'],
      ['Sample_Orders', 'KEY-1', 'Total', 'Decimal', '18', '2', 'No', 'No', '', '1'],
    ])
    expect(sheets.find((s) => s.name === 'Summary').rows).toContainEqual(['Data rows', NO_DATA_NOTE])
    expect(sheets.find((s) => s.name === 'Automation steps').rows).toHaveLength(2) // step 2 has no activity, still listed
    expect(sheets.find((s) => s.name === 'Journeys').rows[0][7]).toBe('Sample_Orders') // entry DE from the events part
    expect(sheets.find((s) => s.name === 'Problems').rows).toEqual([['Data extensions with fields', 'Shared_Thing', 'Fields: denied'], ['Other activities', 'Filters', 'refused']])
  })

  it('leaves out parts that were not read', () => {
    const sheets = buildSheets({ meta: {}, parts: { events: exp.parts.events } })
    expect(sheets.map((s) => s.name)).toEqual(['Summary', 'Entry events'])
    expect(Object.keys(buildJson({ meta: {}, parts: { events: exp.parts.events } }).parts)).toEqual(['entryEvents'])
  })

  it('cuts cells Excel cannot hold', () => {
    const long = 'x'.repeat(CELL_LIMIT + 10)
    expect(cell(long).length).toBeLessThan(CELL_LIMIT + 100)
    expect(cell(long)).toMatch(/JSON download/)
    expect(cell(null)).toBe('')
    expect(cell(5)).toBe('5')
  })

  it('puts everything in the JSON with stack, business unit and time', () => {
    const j = buildJson(exp)
    expect(j).toMatchObject({ stack: 's1', businessUnit: { id: 123, name: 'Test Unit' }, exportedAt: '2026-02-03T04:05:06.000Z', note: NO_DATA_NOTE })
    expect(Object.keys(j.parts)).toEqual(['dataExtensions', 'queryActivities', 'otherActivities', 'automations', 'journeys', 'entryEvents', 'cloudPages', 'folders'])
    expect(j.parts.queryActivities.items[0].sql).toBe('SELECT 1 AS a')
    expect(j.parts.dataExtensions.items[0].fields).toHaveLength(2)
    expect(JSON.stringify(j)).not.toMatch(/rows":\[\{/)
  })

  it('builds a Markdown document with SQL and code', () => {
    const md = toMarkdown(buildDoc(exp), new Date(2026, 0, 1))
    expect(md).toMatch(/^# Marketing Cloud metadata: Test Unit/)
    expect(md).toContain(NO_DATA_NOTE)
    expect(md).toContain('```sql\nSELECT 1 AS a\n```')
    expect(md).toContain('## Automations')
    expect(md).toContain('### Journey one (version 2)')
    expect(allErrors(exp)).toHaveLength(2)
  })

  it('names files marketing-cloud-metadata-<bu>-<date>', () => {
    expect(metadataFileBase('Test Unit', new Date(2026, 1, 3))).toBe('marketing-cloud-metadata-Test_Unit-2026-02-03')
    expect(metadataFileBase('', new Date(2026, 1, 3))).toBe('marketing-cloud-metadata-2026-02-03')
  })
})
