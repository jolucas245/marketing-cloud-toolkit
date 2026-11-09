import { describe, it, expect } from 'vitest'
import {
  runNames, isNameClash, markerField, markerRow, resultRows, resultColumns, waitForRun,
  RunFailedError, RUN_FAILED_MESSAGE, RUN_MARKER_FIELD, formatRunTime,
} from '../queryRun.js'
import { explainRunError } from '../runErrors.js'

// Bugs from the live test, 2026-11-07 (Run Query in the s10 sandbox).

describe('runNames: unique per run', () => {
  it('keeps the SFMCQS_<kind>_<date>_<seconds> format, with a token shared by the DE and the activity', () => {
    const { deName, actName } = runNames(new Date(2026, 10, 7, 21, 5, 3), () => 0.5)
    expect(deName).toMatch(/^SFMCQS_sql_20261107_\d{10}_[0-9a-z]{6}$/)
    expect(actName).toBe(deName.replace('SFMCQS_sql_', 'SFMCQS_act_'))
    expect(deName).not.toContain('.')
  })

  it('gives different names to runs started in the same second', () => {
    const now = new Date(2026, 10, 7, 21, 5, 3)
    const names = new Set(Array.from({ length: 50 }, () => runNames(now).deName))
    expect(names.size).toBe(50)
  })
})

describe('isNameClash', () => {
  it('is true for SFMC 409 and "already exists"', () => {
    expect(isNameClash({ status: 409, message: 'x' })).toBe(true)
    expect(isNameClash(new Error('SFMC API error 409: {"message":"A CustomObject with that name already exists"}'))).toBe(true)
  })
  it('is false for other errors', () => {
    expect(isNameClash({ status: 403, message: 'Forbidden' })).toBe(false)
    expect(isNameClash(new Error('No reply from the extension service worker.'))).toBe(false)
    expect(isNameClash(null)).toBe(false)
  })
})

describe('run marker', () => {
  const fields = [
    { name: 'OrderID', type: 1, isPrimaryKey: true, isNullable: false },
    { name: 'Email', type: 4, isPrimaryKey: false, isNullable: false },
    { name: 'FirstName', type: 0, isPrimaryKey: false, isNullable: true },
  ]

  it('adds a nullable Text marker field after the query columns', () => {
    const f = markerField(fields)
    expect(f).toMatchObject({ name: RUN_MARKER_FIELD, ordinal: 3, type: 0, length: 20, isPrimaryKey: false, isNullable: true })
  })

  it('adds none when a query column already has the name', () => {
    expect(markerField([{ name: 'sfmcqs_runmarker' }])).toBeNull()
  })

  it('fills primary key and required fields of the marker row, nothing else', () => {
    expect(markerRow([...fields, markerField(fields)])).toEqual({ [RUN_MARKER_FIELD]: 'pending', OrderID: 0, Email: 'run.marker@example.com' })
  })
})

describe('resultRows / resultColumns: the target DE field names', () => {
  // SFMC's rowset as seen live: lower-case names, primary keys under `keys`.
  const items = [
    { keys: { orderid: '1' }, values: { firstname: 'Ann', sfmcqs_runmarker: '' } },
    { keys: { orderid: '2' }, values: { firstname: 'Bo', sfmcqs_runmarker: '' } },
  ]

  it('keys rows by the field names the run created, without the marker column', () => {
    const { rows, markerSeen } = resultRows(items, ['OrderID', 'FirstName'])
    expect(rows).toEqual([{ OrderID: '1', FirstName: 'Ann' }, { OrderID: '2', FirstName: 'Bo' }])
    expect(markerSeen).toBe(false)
  })

  it('leaves out the marker row', () => {
    const { rows, markerSeen } = resultRows([{ keys: { orderid: '0' }, values: { firstname: '', sfmcqs_runmarker: 'pending' } }, ...items], ['OrderID', 'FirstName'])
    expect(rows).toHaveLength(2)
    expect(markerSeen).toBe(true)
  })

  it('keeps the rowset names when the field names are not known (runs before the fix)', () => {
    expect(resultRows(items, undefined).rows[0]).toEqual({ orderid: '1', firstname: 'Ann' })
  })

  it('columns are the field names in order, also with no rows', () => {
    expect(resultColumns(['OrderID', 'FirstName', RUN_MARKER_FIELD], [])).toEqual(['OrderID', 'FirstName'])
    expect(resultColumns([], [{ a: 1, b: 2 }])).toEqual(['a', 'b'])
    expect(resultColumns([], [])).toEqual([])
  })
})

// A scripted SFMC: `statuses` are the isRunning answers in order (the last repeats),
// `reads` the rowset answers in order (the last repeats).
function scripted({ statuses, reads, marker = true, ...opts }) {
  let t = 0
  let s = 0
  let r = 0
  const calls = { isRunning: 0, readRows: 0 }
  const run = waitForRun({
    marker,
    now: () => t,
    sleep: async (ms) => { t += ms },
    isRunning: async () => { calls.isRunning++; return { isRunning: statuses[Math.min(s++, statuses.length - 1)] } },
    readRows: async () => { calls.readRows++; return reads[Math.min(r++, reads.length - 1)] },
    ...opts,
  })
  return { run, calls, elapsed: () => t }
}
const MARKER = { keys: {}, values: { [RUN_MARKER_FIELD.toLowerCase()]: 'pending' } }
const ROW = { keys: {}, values: { n: '1', sfmcqs_runmarker: '' } }

describe('waitForRun', () => {
  it('returns the rows once the run is over', async () => {
    const { run, calls } = scripted({ statuses: [true, true, false], reads: [{ count: 1, items: [ROW] }] })
    await expect(run).resolves.toEqual({ items: [ROW], totalCount: 1 })
    expect(calls.readRows).toBe(1) // no rows are read while SFMC runs the query
  })

  it('an empty result: the run removed the marker and wrote nothing', async () => {
    const { run } = scripted({ statuses: [true, false], reads: [{ count: 0, items: [] }] })
    await expect(run).resolves.toEqual({ items: [], totalCount: 0 })
  })

  it('a failed run (SELECT 1/0, live test 2026-11-07): the marker is still there, checked twice', async () => {
    const { run, calls } = scripted({ statuses: [true, false], reads: [{ count: 1, items: [MARKER] }] })
    await expect(run).rejects.toBeInstanceOf(RunFailedError)
    expect(calls.readRows).toBe(2)
  })

  it('the failure message gets the "Why did the run fail?" explanation with the SQL hints', () => {
    const e = explainRunError(RUN_FAILED_MESSAGE, 'SELECT TOP 10 JobID, 1/0 AS Ratio FROM _Job')
    expect(e.sqlHints.join(' ')).toMatch(/NULLIF/)
  })

  it('does not call a run failed while it has not been seen running, until the grace time', async () => {
    const { run, elapsed } = scripted({ statuses: [false], reads: [{ count: 1, items: [MARKER] }], startGraceMs: 60000 })
    await expect(run).rejects.toBeInstanceOf(RunFailedError)
    expect(elapsed()).toBeGreaterThanOrEqual(60000)
  })

  it('a queued run longer than a minute still gets its rows (it was cut off at 60 s with 0 rows)', async () => {
    // Not reported running for 100 s (the old code gave up after 60 s), then runs.
    const statuses = [...Array(20).fill(false), true, true, false]
    const reads = [...Array(20).fill({ count: 1, items: [MARKER] }), { count: 1, items: [ROW] }]
    const { run, elapsed } = scripted({ statuses, reads })
    await expect(run).resolves.toMatchObject({ totalCount: 1 })
    expect(elapsed()).toBeGreaterThan(100000)
  })

  it('waits past 10 minutes, up to the 35-minute cap (SFMC stops a query after 30)', async () => {
    const ok = scripted({ statuses: [...Array(12 * 20).fill(true), false], reads: [{ count: 1, items: [ROW] }] })
    await expect(ok.run).resolves.toMatchObject({ totalCount: 1 })
    expect(ok.elapsed()).toBeGreaterThan(10 * 60000)
    const stuck = scripted({ statuses: [true], reads: [] })
    await expect(stuck.run).rejects.toThrow(/after 35 minutes/)
    expect(stuck.elapsed()).toBeLessThan(36 * 60000)
  })

  it('a rowset read that fails decides nothing', async () => {
    const { run } = scripted({ statuses: [false], reads: [null, { count: 1, items: [ROW] }] })
    await expect(run).resolves.toMatchObject({ totalCount: 1 })
  })

  it('without a marker (older DE, or SFMC refused the marker row) no rows after the run means empty', async () => {
    const { run } = scripted({ marker: false, statuses: [true, false], reads: [{ count: 0, items: [] }] })
    await expect(run).resolves.toEqual({ items: [], totalCount: 0 })
  })

  it('drops the marker row from rows and count if it shows with rows', async () => {
    const { run } = scripted({ statuses: [false], reads: [{ count: 2, items: [MARKER, ROW] }] })
    await expect(run).resolves.toEqual({ items: [ROW], totalCount: 1 })
  })

  it('stops when the panel closes', async () => {
    const { run } = scripted({ statuses: [true], reads: [], aborted: () => true })
    await expect(run).rejects.toThrow('Poll aborted')
  })
})

describe('formatRunTime', () => {
  it('says "under a second" below one second (was "in 0s")', () => {
    expect(formatRunTime(0)).toBe('under a second')
    expect(formatRunTime(999)).toBe('under a second')
  })
  it('gives seconds, then minutes and seconds', () => {
    expect(formatRunTime(1000)).toBe('1s')
    expect(formatRunTime(66000)).toBe('1m 6s')
  })
})
