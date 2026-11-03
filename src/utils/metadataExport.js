// Download metadata (feedback #1036): one export of the current business unit's
// Marketing Cloud setup. This file is pure: it turns what the loaders read
// (utils/metadataLoaders.js) into small records, then into Excel sheets, one JSON
// object and one document (utils/exportDoc.js model, for Markdown).
// Data extension rows are never read or exported: only names, settings, fields,
// SQL and code.
import { safeFileName } from './exportDoc.js'
import { describeRecurrence } from './ical.js'
import { activityTypeLabel, UPDATE_TYPES, IMPORT_DESTINATIONS } from './activityTypes.js'
import { nodeTypeLabel, nodeDisplayType, nodeSummary } from './journeys.js'

export const NO_DATA_NOTE = 'Metadata only. No data extension rows are included.'

// The parts a user can tick, in the order they are read and exported.
export const PARTS = [
  { id: 'des', label: 'Data extensions with fields', hint: 'Name, key, folder path, settings and every field.' },
  { id: 'queries', label: 'Query activities', hint: 'SQL, target data extension and update type.' },
  { id: 'activities', label: 'Other activities', hint: 'Imports, data extracts, file transfers, scripts (with code) and filters.' },
  { id: 'automations', label: 'Automations', hint: 'Steps, activities and schedule.' },
  { id: 'journeys', label: 'Journeys', hint: 'Latest version of each, with its activities and entry source.' },
  { id: 'events', label: 'Journey entry events', hint: 'Event definitions and their data extensions.' },
  { id: 'cloudpages', label: 'CloudPages', hint: 'Name, status, folder and URL.' },
  { id: 'folders', label: 'Folders', hint: 'Data extension, query activity and automation folders.' },
]
export const partLabel = (id) => PARTS.find((p) => p.id === id)?.label || id

// Excel refuses cells over 32,767 characters.
export const CELL_LIMIT = 32000
export function cell(v) {
  if (v == null) return ''
  const s = typeof v === 'string' ? v : typeof v === 'object' ? JSON.stringify(v) : String(v)
  return s.length > CELL_LIMIT ? `${s.slice(0, CELL_LIMIT)}\n(cut here: the full text is in the JSON download)` : s
}
const yesNo = (v) => (v == null || v === '' ? '' : v === true || v === 'true' ? 'Yes' : v === false || v === 'false' ? 'No' : String(v))

// ── Records ───────────────────────────────────────────────
const SOURCE_LABELS = { shared: 'Shared', sync: 'Synchronized' }

/** A data extension (from deApi's toDE) with its fields and what else was read. */
export function deRecord(de, { fields = null, folderPath = '', rowCount = null, error = '' } = {}) {
  return {
    id: de.id ?? '',
    name: de.name || '',
    customerKey: de.customerKey || '',
    description: de.description || '',
    source: SOURCE_LABELS[de.sourceType] || 'Local',
    categoryId: de.categoryId ?? null,
    folderPath: folderPath || '',
    createdDate: de.createdDate || null,
    modifiedDate: de.modifiedDate || null,
    rowCount: rowCount ?? null,
    fields: Array.isArray(fields) ? fields.map(fieldRecord) : null,
    error: error || '',
  }
}

export function fieldRecord(f) {
  return {
    name: f.name || '',
    type: f.type || f.fieldType || '',
    length: f.length ?? f.maxLength ?? null,
    scale: f.scale ?? null,
    primaryKey: !!f.isPrimaryKey,
    required: f.isNullable == null ? (f.isRequired == null ? null : !!f.isRequired) : !f.isNullable,
    defaultValue: f.defaultValue ?? null,
    ordinal: f.ordinal ?? null,
  }
}

export function queryRecord(q) {
  return {
    id: q.queryDefinitionId || '',
    name: q.name || '',
    key: q.key || q.customerKey || '',
    description: q.description || '',
    targetName: q.targetName || '',
    targetKey: q.targetKey || '',
    updateType: q.targetUpdateTypeName || UPDATE_TYPES[q.targetUpdateTypeId] || '',
    categoryId: q.categoryId ?? null,
    sql: q.queryText || '',
    modifiedDate: q.modifiedDate || null,
  }
}

// Other activities: which list they come from, their type and a one-line summary.
export const ACTIVITY_KINDS = [
  { id: 'imports', objectTypeId: 43, idField: 'importDefinitionId' },
  { id: 'dataextracts', objectTypeId: 73, idField: 'dataExtractDefinitionId' },
  { id: 'filetransfers', objectTypeId: 53, idField: 'id' },
  { id: 'scripts', objectTypeId: 423, idField: 'ssjsActivityId' },
  { id: 'filters', objectTypeId: 303, idField: 'filterActivityId' },
]

function activitySummary(kind, a) {
  const parts = []
  const add = (label, v) => { if (v != null && v !== '') parts.push(`${label}: ${typeof v === 'object' ? (v.name ?? JSON.stringify(v)) : v}`) }
  if (kind === 'imports') {
    add('Target', a.targetDataExtension?.name ?? a.targetDataExtension ?? a.destinationObjectName)
    add('Destination', IMPORT_DESTINATIONS[a.destinationObjectTypeId])
    add('Update type', UPDATE_TYPES[a.updateTypeId])
    add('File', a.fileSpec || a.fileNamingPattern)
  } else if (kind === 'dataextracts') {
    add('File', a.fileSpec)
    add('Extract type', a.dataExtractTypeId)
  } else if (kind === 'filetransfers') {
    add('File', a.fileSpec)
    if (a.isUpload != null) parts.push(a.isUpload ? 'Upload' : 'Download')
    add('Location ID', a.fileTransferLocationId)
  } else if (kind === 'filters') {
    add('Source', a.sourceObjectName || a.sourceObjectId)
    add('Result', a.resultDEName || a.destinationObjectName || a.resultDEKey)
  }
  return parts.join('; ')
}

export function activityRecord(kind, a) {
  const k = ACTIVITY_KINDS.find((x) => x.id === kind)
  return {
    type: activityTypeLabel(k?.objectTypeId),
    kind,
    id: (k && a[k.idField]) || a.id || '',
    name: a.name || '',
    key: a.key || a.customerKey || '',
    description: a.description || '',
    summary: activitySummary(kind, a),
    code: kind === 'scripts' ? (a.script || '') : '',
    modifiedDate: a.modifiedDate || null,
  }
}

/** An automation from the list, with its full record (steps and schedule) when read. */
export function automationRecord(entry, detail, error = '') {
  const d = detail || {}
  const s = d.schedule || null
  return {
    id: d.id || entry.id || '',
    name: d.name || entry.name || '',
    key: d.key || entry.key || entry.customerKey || '',
    description: d.description || entry.description || '',
    status: d.status || entry.status || entry.statusName || '',
    lastRunTime: d.lastRunTime || entry.lastRunTime || null,
    modifiedDate: d.modifiedDate || entry.modifiedDate || entry.lastSavedDate || null,
    schedule: s ? {
      status: s.scheduleStatus || '',
      recurrence: describeRecurrence(s.icalRecur) || s.icalRecur || '',
      timezone: s.timezoneName || '',
      start: s.startDate || null,
      next: s.scheduledTime || null,
      end: s.endDate || null,
    } : null,
    steps: detail ? (d.steps || []).map((st, i) => ({
      step: st.step ?? i + 1,
      name: st.name || '',
      activities: (st.activities || []).map((a) => ({ name: a.name || '', type: activityTypeLabel(a.objectTypeId), objectTypeId: a.objectTypeId ?? null, activityObjectId: a.activityObjectId || '' })),
    })) : null,
    error: error || (detail ? '' : 'Steps and schedule could not be read.'),
  }
}

/** A journey with its definition (from sources.js: list item merged with fetchJourney). */
export function journeyRecord(j) {
  const t = j.triggers?.[0] || null
  return {
    id: j.id || '',
    key: j.key || '',
    name: j.name || '',
    version: j.version ?? null,
    status: j.status || '',
    entrySource: t ? {
      type: nodeTypeLabel(t.type),
      name: t.name || '',
      eventDefinitionKey: t.metaData?.eventDefinitionKey || t.configurationArguments?.eventDefinitionKey || '',
    } : null,
    activities: Array.isArray(j.activities) ? j.activities.map((a) => ({
      key: a.key || '',
      name: a.name || '',
      type: nodeTypeLabel(nodeDisplayType(a)),
      summary: nodeSummary(a),
    })) : null,
    modifiedDate: j.modifiedDate || null,
    error: j._error ? 'Activities could not be read.' : '',
  }
}

export function eventRecord(e) {
  return {
    id: e.id || '',
    key: e.eventDefinitionKey || '',
    name: e.name || '',
    type: e.type || '',
    dataExtensionName: e.dataExtensionName || '',
    dataExtensionId: e.dataExtensionId || '',
    mode: e.mode || '',
    journeysUsing: e.interactionCount ?? null,
    modifiedDate: e.modifiedDate || null,
  }
}

/** A CloudPage (from cloudPagesApi's toCloudPage). */
export function cloudPageRecord(p, folderPath = '') {
  return {
    id: p.id ?? '',
    name: p.name || '',
    key: p.customerKey || '',
    status: p.status || '',
    assetType: p.assetType || '',
    folderPath: folderPath || p.categoryName || '',
    url: p.url || '',
    publishDate: p.publishDate || null,
    modifiedDate: p.modifiedDate || null,
  }
}

/**
 * Folders of one area with their full path ("A > B > C"). `list` holds
 * { id, name, parentId }; a parent missing from the list ends the path.
 */
export function folderRecords(area, list) {
  const byId = new Map(list.map((f) => [String(f.id), f]))
  const pathOf = (f) => {
    const names = []
    const seen = new Set()
    for (let x = f; x && !seen.has(String(x.id)) && names.length < 30; x = byId.get(String(x.parentId))) {
      seen.add(String(x.id))
      names.unshift(x.name || `Folder ${x.id}`)
    }
    return names.join(' > ')
  }
  return list.map((f) => ({ area, id: f.id ?? '', name: f.name || '', parentId: f.parentId ?? null, path: pathOf(f) }))
    .sort((a, b) => a.path.localeCompare(b.path))
}

// ── Outputs ───────────────────────────────────────────────
// `exp` = { meta: { stack, buId, buName, exportedAt }, parts: { <id>: { items, errors, capped, total } } }
// Only parts that were read are in `parts`.

const ok = (exp, id) => exp.parts?.[id] && Array.isArray(exp.parts[id].items)

/** Every problem across parts: [{ part, item, message }]. */
export function allErrors(exp) {
  const out = []
  for (const p of PARTS) {
    const r = exp.parts?.[p.id]
    if (!r) continue
    for (const e of r.errors || []) out.push({ part: p.label, item: e.item || '', message: e.message || '' })
    for (const it of r.items || []) if (it.error) out.push({ part: p.label, item: it.name || String(it.id || ''), message: it.error })
  }
  return out
}

function summaryRows(exp) {
  const m = exp.meta || {}
  const rows = [
    ['Stack', m.stack || ''], ['Business unit', m.buName || ''], ['Business unit ID', m.buId ?? ''],
    ['Exported at', m.exportedAt || ''], ['Data rows', NO_DATA_NOTE],
  ]
  for (const p of PARTS) {
    const r = exp.parts?.[p.id]
    if (!r) continue
    let v = `${(r.items || []).length.toLocaleString('en-US')}`
    if (r.capped) v += ` (stopped at the reading limit; SFMC reported ${Number(r.total || 0).toLocaleString('en-US')})`
    if (r.errors?.length) v += `, ${r.errors.length} problem${r.errors.length === 1 ? '' : 's'}`
    rows.push([p.label, v])
  }
  return rows
}

/** Excel sheets: [{ name, columns, rows }]. */
export function buildSheets(exp) {
  const sheets = [{ name: 'Summary', columns: ['Item', 'Value'], rows: summaryRows(exp).map((r) => r.map(cell)) }]
  const add = (name, columns, rows) => sheets.push({ name, columns, rows: rows.map((r) => r.map(cell)) })
  const P = exp.parts || {}
  if (ok(exp, 'des')) {
    add('Data extensions', ['Name', 'Customer key', 'Source', 'Folder', 'Description', 'Fields', 'Row count', 'Created', 'Modified', 'ID'],
      P.des.items.map((d) => [d.name, d.customerKey, d.source, d.folderPath, d.description, d.fields ? d.fields.length : '', d.rowCount ?? '', d.createdDate, d.modifiedDate, d.id]))
    add('DE fields', ['Data extension', 'DE customer key', 'Field', 'Type', 'Length', 'Scale', 'Primary key', 'Required', 'Default value', 'Ordinal'],
      P.des.items.flatMap((d) => (d.fields || []).map((f) => [d.name, d.customerKey, f.name, f.type, f.length ?? '', f.scale ?? '', yesNo(f.primaryKey), yesNo(f.required), f.defaultValue ?? '', f.ordinal ?? ''])))
  }
  if (ok(exp, 'queries')) {
    add('Query activities', ['Name', 'Key', 'Target data extension', 'Target key', 'Update type', 'Description', 'Modified', 'ID', 'SQL'],
      P.queries.items.map((q) => [q.name, q.key, q.targetName, q.targetKey, q.updateType, q.description, q.modifiedDate, q.id, q.sql]))
  }
  if (ok(exp, 'activities')) {
    add('Other activities', ['Type', 'Name', 'Key', 'Description', 'Details', 'Modified', 'ID', 'Code'],
      P.activities.items.map((a) => [a.type, a.name, a.key, a.description, a.summary, a.modifiedDate, a.id, a.code]))
  }
  if (ok(exp, 'automations')) {
    add('Automations', ['Name', 'Key', 'Status', 'Schedule', 'Recurrence', 'Time zone', 'Next run', 'Steps', 'Activities', 'Last run', 'Modified', 'ID'],
      P.automations.items.map((a) => [a.name, a.key, a.status, a.schedule?.status ?? '', a.schedule?.recurrence ?? '', a.schedule?.timezone ?? '', a.schedule?.next ?? '',
        a.steps ? a.steps.length : '', a.steps ? a.steps.reduce((n, s) => n + s.activities.length, 0) : '', a.lastRunTime, a.modifiedDate, a.id]))
    add('Automation steps', ['Automation', 'Step', 'Step name', 'Activity', 'Activity type', 'Activity ID'],
      P.automations.items.flatMap((a) => (a.steps || []).flatMap((s) => (s.activities.length ? s.activities : [null]).map((x) =>
        [a.name, s.step, s.name, x?.name ?? '', x?.type ?? '', x?.activityObjectId ?? '']))))
  }
  if (ok(exp, 'journeys')) {
    const deOfEvent = new Map((P.events?.items || []).map((e) => [e.key, e.dataExtensionName]))
    add('Journeys', ['Name', 'Key', 'Version', 'Status', 'Entry type', 'Entry name', 'Entry event key', 'Entry data extension', 'Activities', 'Modified', 'ID'],
      P.journeys.items.map((j) => [j.name, j.key, j.version ?? '', j.status, j.entrySource?.type ?? '', j.entrySource?.name ?? '', j.entrySource?.eventDefinitionKey ?? '',
        deOfEvent.get(j.entrySource?.eventDefinitionKey) ?? '', j.activities ? j.activities.length : '', j.modifiedDate, j.id]))
    add('Journey activities', ['Journey', 'Version', 'Activity', 'Type', 'Summary', 'Activity key'],
      P.journeys.items.flatMap((j) => (j.activities || []).map((a) => [j.name, j.version ?? '', a.name, a.type, a.summary, a.key])))
  }
  if (ok(exp, 'events')) {
    add('Entry events', ['Name', 'Event definition key', 'Type', 'Data extension', 'Mode', 'Journeys using it', 'Modified', 'ID'],
      P.events.items.map((e) => [e.name, e.key, e.type, e.dataExtensionName, e.mode, e.journeysUsing ?? '', e.modifiedDate, e.id]))
  }
  if (ok(exp, 'cloudpages')) {
    add('CloudPages', ['Name', 'Key', 'Status', 'Type', 'Folder', 'URL', 'Published', 'Modified', 'ID'],
      P.cloudpages.items.map((p) => [p.name, p.key, p.status, p.assetType, p.folderPath, p.url, p.publishDate, p.modifiedDate, p.id]))
  }
  if (ok(exp, 'folders')) {
    add('Folders', ['Area', 'Path', 'Name', 'ID', 'Parent ID'], P.folders.items.map((f) => [f.area, f.path, f.name, f.id, f.parentId ?? '']))
  }
  const errors = allErrors(exp)
  if (errors.length) add('Problems', ['Part', 'Item', 'Message'], errors.map((e) => [e.part, e.item, e.message]))
  return sheets
}

const JSON_KEYS = { des: 'dataExtensions', queries: 'queryActivities', activities: 'otherActivities', automations: 'automations', journeys: 'journeys', events: 'entryEvents', cloudpages: 'cloudPages', folders: 'folders' }

/** Everything, as one object for the JSON download. */
export function buildJson(exp) {
  const m = exp.meta || {}
  const parts = {}
  for (const p of PARTS) {
    const r = exp.parts?.[p.id]
    if (!r) continue
    parts[JSON_KEYS[p.id]] = { count: (r.items || []).length, total: r.total ?? null, capped: !!r.capped, errors: r.errors || [], items: r.items || [] }
  }
  return {
    app: 'Marketing Cloud Toolkit',
    note: NO_DATA_NOTE,
    exportedAt: m.exportedAt || null,
    stack: m.stack || null,
    businessUnit: { id: m.buId ?? null, name: m.buName || null },
    parts,
  }
}

/** The document for Markdown (exportDoc.js model). */
export function buildDoc(exp) {
  const m = exp.meta || {}
  const P = exp.parts || {}
  const blocks = [
    { type: 'p', text: NO_DATA_NOTE },
    { type: 'kv', rows: summaryRows(exp) },
  ]
  const h = (text, level = 2) => blocks.push({ type: 'h', level, text })
  if (ok(exp, 'des')) {
    h('Data extensions')
    blocks.push({ type: 'table', columns: ['Name', 'Customer key', 'Source', 'Folder', 'Fields', 'Row count'],
      rows: P.des.items.map((d) => [d.name, d.customerKey, d.source, d.folderPath, d.fields ? d.fields.length : '', d.rowCount ?? '']) })
    for (const d of P.des.items) {
      if (!d.fields?.length) continue
      h(d.name, 3)
      blocks.push({ type: 'table', columns: ['Field', 'Type', 'Length', 'Scale', 'Primary key', 'Required', 'Default value'],
        rows: d.fields.map((f) => [f.name, f.type, f.length ?? '', f.scale ?? '', yesNo(f.primaryKey), yesNo(f.required), f.defaultValue ?? '']) })
    }
  }
  if (ok(exp, 'queries')) {
    h('Query activities')
    for (const q of P.queries.items) {
      h(q.name, 3)
      blocks.push({ type: 'kv', rows: [['Key', q.key], ['Target data extension', q.targetName], ['Target key', q.targetKey], ['Update type', q.updateType], ['Description', q.description], ['Modified', q.modifiedDate || '']] })
      if (q.sql) blocks.push({ type: 'code', lang: 'sql', text: q.sql })
    }
  }
  if (ok(exp, 'activities')) {
    h('Other activities')
    blocks.push({ type: 'table', columns: ['Type', 'Name', 'Key', 'Details'], rows: P.activities.items.map((a) => [a.type, a.name, a.key, a.summary]) })
    for (const a of P.activities.items.filter((x) => x.code)) {
      h(`Script: ${a.name}`, 3)
      blocks.push({ type: 'code', lang: 'javascript', text: a.code })
    }
  }
  if (ok(exp, 'automations')) {
    h('Automations')
    blocks.push({ type: 'table', columns: ['Name', 'Status', 'Schedule', 'Recurrence', 'Time zone', 'Steps'],
      rows: P.automations.items.map((a) => [a.name, a.status, a.schedule?.status ?? '', a.schedule?.recurrence ?? '', a.schedule?.timezone ?? '', a.steps ? a.steps.length : '']) })
    for (const a of P.automations.items) {
      if (!a.steps?.length) continue
      h(a.name, 3)
      blocks.push({ type: 'table', columns: ['Step', 'Step name', 'Activity', 'Type'],
        rows: a.steps.flatMap((s) => (s.activities.length ? s.activities : [null]).map((x) => [s.step, s.name, x?.name ?? '', x?.type ?? ''])) })
    }
  }
  if (ok(exp, 'journeys')) {
    h('Journeys')
    blocks.push({ type: 'table', columns: ['Name', 'Version', 'Status', 'Entry', 'Entry event key', 'Activities'],
      rows: P.journeys.items.map((j) => [j.name, j.version ?? '', j.status, j.entrySource ? [j.entrySource.type, j.entrySource.name].filter(Boolean).join(': ') : '', j.entrySource?.eventDefinitionKey ?? '', j.activities ? j.activities.length : '']) })
    for (const j of P.journeys.items) {
      if (!j.activities?.length) continue
      h(`${j.name}${j.version != null ? ` (version ${j.version})` : ''}`, 3)
      blocks.push({ type: 'table', columns: ['Activity', 'Type', 'Summary'], rows: j.activities.map((a) => [a.name, a.type, a.summary]) })
    }
  }
  if (ok(exp, 'events')) {
    h('Journey entry events')
    blocks.push({ type: 'table', columns: ['Name', 'Event definition key', 'Type', 'Data extension', 'Journeys using it'],
      rows: P.events.items.map((e) => [e.name, e.key, e.type, e.dataExtensionName, e.journeysUsing ?? '']) })
  }
  if (ok(exp, 'cloudpages')) {
    h('CloudPages')
    blocks.push({ type: 'table', columns: ['Name', 'Status', 'Folder', 'URL'], rows: P.cloudpages.items.map((p) => [p.name, p.status, p.folderPath, p.url]) })
  }
  if (ok(exp, 'folders')) {
    h('Folders')
    blocks.push({ type: 'table', columns: ['Area', 'Path', 'ID'], rows: P.folders.items.map((f) => [f.area, f.path, f.id]) })
  }
  const errors = allErrors(exp)
  if (errors.length) {
    h('Problems')
    blocks.push({ type: 'table', columns: ['Part', 'Item', 'Message'], rows: errors.map((e) => [e.part, e.item, e.message]) })
  }
  return { title: `Marketing Cloud metadata${m.buName ? `: ${m.buName}` : ''}`, blocks }
}

/** marketing-cloud-metadata-<bu>-<YYYY-MM-DD> (no extension). */
export function metadataFileBase(buName, date = new Date()) {
  const p = (n) => String(n).padStart(2, '0')
  const day = `${date.getFullYear()}-${p(date.getMonth() + 1)}-${p(date.getDate())}`
  return ['marketing-cloud-metadata', buName ? safeFileName(buName) : '', day].filter(Boolean).join('-')
}
