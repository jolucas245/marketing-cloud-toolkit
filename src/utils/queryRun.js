// Run Query's Query Activity run: names of the objects it creates, the run marker that
// tells a failed run from an empty result, waiting for the run, and the result rows.
//
// Why a marker (live test, 2026-11-07): SFMC's only status for a Query Activity started
// on its own is actions/isrunning (true while it runs, then false). It never says
// whether the run failed or why: `SELECT TOP 10 JobID, 1/0 AS Ratio FROM _Job` ended
// with isRunning false and an empty target data extension, exactly like a query that
// found nothing. What differs is the target: the activity overwrites it, and a failed
// run leaves it untouched. So before the start, one marker row goes into the target
// (extra column SFMCQS_RunMarker); a run that completes removes it (also with 0 rows),
// a failed run leaves it. Both checked live on s10.

export const RUN_MARKER_FIELD = 'SFMCQS_RunMarker'
const MARKER_VALUE = 'pending'

/**
 * Names of a run's data extension and Query Activity, unique per run: two panels
 * started in the same second used to get the same name, and SFMC refused the second
 * data extension with 409 "A CustomObject with that name already exists" (live test,
 * 2026-11-07). Both share one token, so the pair is easy to match in SFMC.
 * The automation that runs the activity (SFMCQS_run_) shares the token too.
 * Format: SFMCQS_sql_YYYYMMDD_<unix seconds>_<token> (no dots allowed by SFMC).
 */
export function runNames(now = new Date(), random = Math.random) {
  const ymd = now.getFullYear().toString()
    + String(now.getMonth() + 1).padStart(2, '0')
    + String(now.getDate()).padStart(2, '0')
  const secs = Math.floor(now.getTime() / 1000)
  let token = ''
  while (token.length < 6) token += Math.floor(random() * 36).toString(36)
  const stamp = `${ymd}_${secs}_${token}`
  return { deName: `SFMCQS_sql_${stamp}`, actName: `SFMCQS_act_${stamp}`, autoName: `SFMCQS_run_${stamp}` }
}

/** SFMC refused a name that is already taken (409, "... already exists"). */
export function isNameClash(err) {
  return err?.status === 409 || /already exists|duplicate (name|key)/i.test(String(err?.message || ''))
}

/**
 * The marker field to add to a target DE's fields, or null when a query column already
 * has that name.
 */
export function markerField(fields) {
  if (fields.some((f) => String(f.name).toLowerCase() === RUN_MARKER_FIELD.toLowerCase())) return null
  return {
    name: RUN_MARKER_FIELD, ordinal: fields.length, type: 0, length: 20, scale: 0,
    isPrimaryKey: false, isTemplateField: false, isHidden: false, isReadOnly: false,
    isOverridable: false, isInheritable: false, updatable: true, retrievable: true,
    isActive: true, mustOverride: false, isNullable: true,
  }
}

// Values for fields the marker row must fill (primary keys, required fields).
const PLACEHOLDER = { 0: '-', 1: 0, 2: '1900-01-01', 3: false, 4: 'run.marker@example.com', 5: '0000000000', 6: 0 }

/** The marker row for a target DE with these fields (marker field included). */
export function markerRow(fields) {
  const row = { [RUN_MARKER_FIELD]: MARKER_VALUE }
  for (const f of fields) {
    if (f.name === RUN_MARKER_FIELD || !(f.isPrimaryKey || f.isNullable === false)) continue
    row[f.name] = PLACEHOLDER[f.type] ?? '-'
  }
  return row
}

const lower = (s) => String(s).toLowerCase()
const isMarkerItem = (item) => {
  const all = { ...(item?.keys || {}), ...(item?.values || {}) }
  return Object.entries(all).some(([k, v]) => lower(k) === lower(RUN_MARKER_FIELD) && v != null && v !== '')
}

/**
 * Rowset items as rows keyed by the target DE's field names. SFMC's rowset gives field
 * names in lower case (orderid, firstname: live test, 2026-11-07); `fieldNames` are the
 * names the run created the DE with. The marker column and a marker row are left out.
 * Returns { rows, markerSeen }.
 */
export function resultRows(items, fieldNames = []) {
  const byLower = new Map(fieldNames.map((n) => [lower(n), n]))
  const rows = []
  let markerSeen = false
  for (const item of items || []) {
    if (isMarkerItem(item)) { markerSeen = true; continue }
    const row = {}
    for (const [k, v] of Object.entries({ ...(item?.keys || {}), ...(item?.values || {}) })) {
      if (lower(k) === lower(RUN_MARKER_FIELD)) continue
      row[byLower.get(lower(k)) ?? k] = v
    }
    rows.push(row)
  }
  return { rows, markerSeen }
}

/** Result columns: the DE's field names in order (marker left out), else the rows' keys. */
export function resultColumns(fieldNames, rows) {
  const names = (fieldNames || []).filter((n) => lower(n) !== lower(RUN_MARKER_FIELD))
  if (names.length) return names
  return rows?.length ? Object.keys(rows[0]) : []
}

export class RunFailedError extends Error {}

/**
 * The reason SFMC gives for a failed automation run: each failed step's translatedMsg
 * (live test, 2026-11-08: "Query failed during execution. Error: Conversion failed when
 * converting the nvarchar value 'Leo' to data type int."), without SFMC's lead-in.
 */
export function automationRunError(run) {
  const texts = []
  for (const p of run?.processes || []) {
    for (const w of p.workerCounts || []) {
      const e = w?.error
      const t = (e && (e.translatedMsg || e.message || e.errorMessage)) || (typeof e === 'string' ? e : '')
      if (t) texts.push(String(t))
    }
  }
  if (!texts.length && run?.statusMessage) texts.push(String(run.statusMessage))
  return [...new Set(texts)].map((t) => t.replace(/^Query failed during execution\.\s*(Error:\s*)?/i, '').trim()).filter(Boolean).join(' ')
}

const RUN_DONE = /^complete/i
const RUN_FAILED = /error|fail|stopped|cancel|skipped/i

/**
 * Waits for an automation's Run Once and returns its run record when it completed.
 * `latestRun()` is the automation's newest run record (null until SFMC shows it).
 * Throws RunFailedError with SFMC's reason when the run failed. Waits up to `maxMs`:
 * SFMC stops a query after 30 minutes, plus time in the queue.
 */
export async function waitForAutomationRun({
  latestRun, sleep, now = () => Date.now(), aborted = () => false, onTick = () => {},
  firstWaitMs = 2000, intervalMs = 3000, maxMs = 35 * 60000,
}) {
  const start = now()
  await sleep(firstWaitMs)
  for (;;) {
    if (aborted()) throw new Error('Poll aborted')
    onTick()
    const run = await latestRun()
    const status = String(run?.status || '')
    if (RUN_DONE.test(status)) return run
    if (RUN_FAILED.test(status)) {
      const reason = automationRunError(run)
      // "Automation failed due to system error." is all SFMC says for a division by zero
      // (live test, 2026-11-08); the automation is the Toolkit's own, not the user's.
      const vague = !reason || /^automation failed due to system error\.?$/i.test(reason)
      throw new RunFailedError(vague ? 'The query failed in SFMC, and SFMC gave no reason beyond "system error".' : `The query failed in SFMC: ${reason}`)
    }
    if (now() - start >= maxMs) {
      throw new Error(`SFMC was still running the query after ${Math.round(maxMs / 60000)} minutes (query activities time out after 30 minutes).`)
    }
    await sleep(intervalMs)
  }
}

export const RUN_FAILED_MESSAGE = 'The query failed in SFMC: the run ended without writing to the target data extension.'
  + ' SFMC does not say why when a Query Activity runs on its own: look for values that fail only at run time (division by zero, text that is not a date or number, numbers too large).'

/**
 * Waits for a started Query Activity and returns its first page:
 * { items, totalCount } (rowset items, marker row left out of both).
 *
 * - isRunning true: still running (SFMC reports queued runs as running too, live test,
 *   2026-11-07). No rows are read meanwhile.
 * - isRunning false, rows: done.
 * - isRunning false, no rows, marker gone: done, the query found nothing.
 * - isRunning false, marker still there: failed, once that is seen twice in a row after
 *   the run was seen running (or after `startGraceMs` when it never was: a run that
 *   failed between two polls). Throws RunFailedError.
 * - Without a marker (a DE from before the marker, or SFMC refused the marker row):
 *   no rows after the run is over means an empty result, as before.
 * Waits up to `maxMs`: SFMC stops a query after 30 minutes, plus time in the queue.
 */
export async function waitForRun({
  isRunning, readRows, sleep, now = () => Date.now(), aborted = () => false, onTick = () => {},
  marker = false, firstWaitMs = 5000, intervalMs = 5000, startGraceMs = 180000, maxMs = 35 * 60000,
}) {
  const start = now()
  let seenRunning = false
  let markerStreak = 0
  await sleep(firstWaitMs)
  for (;;) {
    if (aborted()) throw new Error('Poll aborted')
    onTick()
    const status = await isRunning()
    if (status?.isRunning === true) {
      seenRunning = true
      markerStreak = 0
    } else {
      // null: the rows could not be read this time; nothing is decided until the next poll.
      const data = await readRows()
      if (data) {
        const items = data.items || []
        const kept = items.filter((item) => !isMarkerItem(item))
        const markerSeen = kept.length < items.length
        const totalCount = Math.max(0, (data.count ?? items.length) - (markerSeen ? 1 : 0))
        const late = seenRunning || now() - start >= startGraceMs
        if (kept.length) return { items: kept, totalCount }
        if (!marker) { if (late) return { items: [], totalCount: 0 } }
        else if (!markerSeen) return { items: [], totalCount: 0 }
        else if (late && ++markerStreak >= 2) throw new RunFailedError(RUN_FAILED_MESSAGE)
      }
    }
    if (now() - start >= maxMs) {
      throw new Error(`SFMC was still running the query after ${Math.round(maxMs / 60000)} minutes (query activities time out after 30 minutes). Open the activity in Automation Studio to follow it.`)
    }
    await sleep(intervalMs)
  }
}

/** "under a second", "12s", "2m 5s". */
export function formatRunTime(ms) {
  if (!(ms >= 1000)) return 'under a second'
  const total = Math.floor(ms / 1000)
  const m = Math.floor(total / 60)
  return `${m > 0 ? `${m}m ` : ''}${total % 60}s`
}
