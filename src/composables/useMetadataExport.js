// Download metadata (feedback #1036): reads the ticked parts of the current business
// unit's setup with the existing loaders, keeps the results in module memory (so a
// second download format, or a visit to another page, does not read SFMC again) and
// builds the downloads with utils/metadataExport.js. Parts are read one after another;
// inside a part, per-item reads go 10 at a time (batchRunner). A part that fails is
// marked failed with its message and the next part still runs. Never reads DE rows.
import { reactive, ref } from 'vue'
import { fetchCurrentBU, listDERootFolders, listDEChildFolders, listQAFolders, listAutomationFolders } from '@/utils/sfmcApi.js'
import { searchLocalDEs, searchSharedSyncDEs, fetchDEFieldList, fetchDEFolderPath, fetchDERowCount } from '@/utils/deApi.js'
import { searchAutomations, loadMoreAutomations, fetchAutomationStatus } from '@/utils/automationApi.js'
import { searchCloudPages, fetchCloudPageFolderPath } from '@/utils/cloudPagesApi.js'
import { SOURCES, StoppedError } from '@/utils/usage/sources.js'
import { runInBatches } from '@/utils/batchRunner.js'
import {
  PARTS, ACTIVITY_KINDS, deRecord, queryRecord, activityRecord, automationRecord, journeyRecord, eventRecord, cloudPageRecord, folderRecords,
  buildSheets, buildJson, buildDoc, metadataFileBase,
} from '@/utils/metadataExport.js'
import { downloadWorkbook, toMarkdown } from '@/utils/exportDoc.js'
import { saveTextFile } from '@/utils/download.js'

const BATCH = 10
const MAX_DE_PAGES = 400 // 20,000 data extensions (50 a page)
const MAX_PAGES = 100 // other lists: 5,000
const MAX_FOLDERS = 5000

const msg = (e) => e?.message || String(e)

// ── Loaders ───────────────────────────────────────────────
// ctx = { stack, progress(done, total, label), stop(), options }
// Each returns { items, total, capped, errors: [{ item, message }] }.

function stopCheck(ctx) { if (ctx.stop()) throw new StoppedError() }

async function loadDEs(ctx) {
  const { stack, progress, stop, options } = ctx
  const errors = []
  const local = []
  let total = 0
  for (let page = 1; page <= MAX_DE_PAGES; page++) {
    stopCheck(ctx)
    const r = await searchLocalDEs(stack, '', page)
    total = r.total
    local.push(...r.items)
    progress(local.length, total, 'Listing')
    if (!r.fetched || local.length >= total) break
  }
  const capped = local.length < total
  progress(local.length, total, 'Listing Shared and Synchronized')
  const shared = await searchSharedSyncDEs(stack, '').catch((e) => { errors.push({ item: 'Shared and Synchronized data extensions', message: msg(e) }); return [] })
  const ids = new Set(shared.map((d) => d.id))
  const all = [...shared, ...local.filter((d) => !ids.has(d.id))]
  stopCheck(ctx)

  // Folder paths: one walk per folder (deApi caches folders).
  const cats = [...new Set(all.map((d) => d.categoryId).filter((c) => c != null && c !== ''))]
  const paths = new Map()
  await runInBatches(cats, BATCH, async (c) => { paths.set(String(c), await fetchDEFolderPath(stack, c).catch(() => '')) },
    { shouldStop: stop, onProgress: (d, t) => progress(d, t, 'Folder paths') })
  stopCheck(ctx)

  const items = new Array(all.length)
  await runInBatches(all, BATCH, async (de, i) => {
    let fields = null
    let rowCount = null
    const problems = []
    try { fields = await fetchDEFieldList(stack, de.id) } catch (e) { problems.push(`Fields: ${msg(e)}`) }
    if (options.rowCounts) {
      try { rowCount = await fetchDERowCount(stack, de.id) } catch (e) { problems.push(`Row count: ${msg(e)}`) }
    }
    items[i] = deRecord(de, { fields, rowCount, folderPath: paths.get(String(de.categoryId)) || '', error: problems.join(' ') })
  }, { shouldStop: stop, onProgress: (d, t) => progress(d, t, options.rowCounts ? 'Fields and row counts' : 'Fields') })
  stopCheck(ctx)
  return { items: items.filter(Boolean), total: total + shared.length, capped, errors }
}

// The Where used loaders (utils/usage/sources.js) read every activity of a type, with
// the SQL / script / file details filled in where the list leaves them out.
const sourceCtx = (ctx, label) => ({ stack: ctx.stack, stop: ctx.stop, progress: (d, t, sub) => ctx.progress(d, t, sub ? `${label}: ${sub}` : label) })

async function loadQueries(ctx) {
  const r = await SOURCES.queries.load(sourceCtx(ctx, 'Query activities'))
  return { items: r.items.map(queryRecord), total: r.total, capped: r.capped, errors: [] }
}

const KIND_LABELS = { imports: 'Imports', dataextracts: 'Data extracts', filetransfers: 'File transfers', scripts: 'Scripts', filters: 'Filters' }

async function loadActivities(ctx) {
  const items = []
  const errors = []
  let total = 0
  let capped = false
  let failed = 0
  for (const k of ACTIVITY_KINDS) {
    stopCheck(ctx)
    try {
      const r = await SOURCES[k.id].load(sourceCtx(ctx, KIND_LABELS[k.id]))
      items.push(...r.items.map((a) => activityRecord(k.id, a)))
      total += r.total
      capped = capped || r.capped
    } catch (e) {
      if (e?.stopped) throw e
      failed++
      errors.push({ item: KIND_LABELS[k.id], message: msg(e) })
    }
  }
  if (failed === ACTIVITY_KINDS.length) throw new Error(errors.map((e) => `${e.item}: ${e.message}`).join(' '))
  return { items, total, capped, errors }
}

async function loadAutomations(ctx) {
  const { stack, progress, stop } = ctx
  let list = []
  let total = 0
  for (let page = 0; page < MAX_PAGES; page++) {
    stopCheck(ctx)
    const r = page ? await loadMoreAutomations(stack, '', list) : await searchAutomations(stack, '', 0)
    total = r.total
    list = list.concat(r.entries)
    progress(list.length, total, 'Listing')
    if (!r.entries.length || list.length >= total) break
  }
  const items = new Array(list.length)
  await runInBatches(list, BATCH, async (a, i) => {
    try { items[i] = automationRecord(a, await fetchAutomationStatus(stack, a.id)) } catch (e) { items[i] = automationRecord(a, null, `Steps and schedule: ${msg(e)}`) }
  }, { shouldStop: stop, onProgress: (d, t) => progress(d, t, 'Steps and schedules') })
  stopCheck(ctx)
  return { items: items.filter(Boolean), total, capped: list.length < total, errors: [] }
}

async function loadJourneys(ctx) {
  const r = await SOURCES.journeys.load(sourceCtx(ctx, 'Journeys'))
  return { items: r.items.map(journeyRecord), total: r.total, capped: r.capped, errors: [] }
}

async function loadEvents(ctx) {
  const r = await SOURCES.events.load(sourceCtx(ctx, 'Entry events'))
  return { items: r.items.map(eventRecord), total: r.total, capped: r.capped, errors: [] }
}

async function loadCloudPages(ctx) {
  const { stack, progress, stop } = ctx
  let pages = []
  let total = 0
  for (let page = 1; page <= MAX_PAGES; page++) {
    stopCheck(ctx)
    const r = await searchCloudPages(stack, '', page)
    total = r.total
    pages = pages.concat(r.items)
    progress(pages.length, total, 'Listing')
    if (!r.items.length || pages.length >= total) break
  }
  const cats = [...new Set(pages.map((p) => p.categoryId).filter((c) => c != null))]
  const paths = new Map()
  await runInBatches(cats, BATCH, async (c) => { paths.set(String(c), await fetchCloudPageFolderPath(stack, c).catch(() => '')) },
    { shouldStop: stop, onProgress: (d, t) => progress(d, t, 'Folder paths') })
  stopCheck(ctx)
  return { items: pages.map((p) => cloudPageRecord(p, paths.get(String(p.categoryId)))), total, capped: pages.length < total, errors: [] }
}

async function loadFolders(ctx) {
  const { stack, progress, stop } = ctx
  const items = []
  const errors = []
  let capped = false
  // Data extension folders: the roots, then each level's children, 10 at a time.
  try {
    progress(0, 0, 'Data extension folders')
    const de = [...((await listDERootFolders(stack))?.entry || [])]
    let level = de.slice()
    while (level.length && de.length < MAX_FOLDERS) {
      stopCheck(ctx)
      const next = []
      await runInBatches(level, BATCH, async (f) => {
        const kids = (await listDEChildFolders(stack, f.id))?.entry || []
        next.push(...kids)
      }, { shouldStop: stop })
      stopCheck(ctx)
      const known = new Set(de.map((f) => String(f.id)))
      level = next.filter((f) => !known.has(String(f.id)))
      de.push(...level)
      progress(de.length, 0, 'Data extension folders')
    }
    if (de.length >= MAX_FOLDERS) capped = true
    items.push(...folderRecords('Data extensions', de.map((f) => ({ id: f.id, name: f.name, parentId: f.parentId }))))
  } catch (e) {
    if (e?.stopped) throw e
    errors.push({ item: 'Data extension folders', message: msg(e) })
  }
  for (const [area, load] of [['Query activities', listQAFolders], ['Automations', listAutomationFolders]]) {
    stopCheck(ctx)
    try {
      progress(items.length, 0, `${area} folders`)
      const list = (await load(stack))?.items || []
      items.push(...folderRecords(area, list.map((f) => ({ id: f.categoryId ?? f.id, name: f.name, parentId: f.parentId }))))
    } catch (e) {
      errors.push({ item: `${area} folders`, message: msg(e) })
    }
  }
  if (!items.length && errors.length) throw new Error(errors.map((e) => `${e.item}: ${e.message}`).join(' '))
  return { items, total: items.length, capped, errors }
}

const LOADERS = { des: loadDEs, queries: loadQueries, activities: loadActivities, automations: loadAutomations, journeys: loadJourneys, events: loadEvents, cloudpages: loadCloudPages, folders: loadFolders }

// ── State (module level: one export per app tab) ─────────
const selected = reactive(Object.fromEntries(PARTS.map((p) => [p.id, true])))
const rowCounts = ref(false)
const status = reactive(Object.fromEntries(PARTS.map((p) => [p.id, { state: 'idle', done: 0, total: 0, label: '', message: '' }])))
const results = reactive({}) // part id -> loaded result
const meta = ref(null) // { stack, buId, buName, exportedAt }
const running = ref(false)
let stopRequested = false

function resetStatus(id, state) {
  Object.assign(status[id], { state, done: 0, total: 0, label: '', message: '' })
}

async function runPart(stack, id) {
  const s = status[id]
  resetStatus(id, 'loading')
  delete results[id]
  const ctx = {
    stack,
    stop: () => stopRequested,
    options: { rowCounts: rowCounts.value },
    progress: (done, total, label) => { s.done = done; s.total = total || 0; s.label = label || '' },
  }
  try {
    results[id] = await LOADERS[id](ctx)
    s.state = 'done'
    s.done = results[id].items.length
    s.total = results[id].items.length
    s.label = ''
  } catch (e) {
    if (e?.stopped || stopRequested) { s.state = 'stopped'; s.message = 'Stopped.' } else { s.state = 'failed'; s.message = msg(e) }
  }
}

async function readMeta(stack) {
  const bu = await fetchCurrentBU(stack).catch(() => null)
  meta.value = { stack, buId: bu?.accountId ?? null, buName: bu?.name || '', exportedAt: new Date().toISOString() }
}

async function start(stack) {
  if (running.value || !stack) return
  running.value = true
  stopRequested = false
  for (const p of PARTS) {
    delete results[p.id]
    resetStatus(p.id, selected[p.id] ? 'waiting' : 'idle')
  }
  try {
    await readMeta(stack)
    for (const p of PARTS) {
      if (!selected[p.id]) continue
      if (stopRequested) { resetStatus(p.id, 'stopped'); status[p.id].message = 'Stopped.'; continue }
      await runPart(stack, p.id)
    }
  } finally {
    running.value = false
  }
}

async function retry(stack, id) {
  if (running.value || !stack) return
  running.value = true
  stopRequested = false
  try {
    if (!meta.value || meta.value.stack !== stack) await readMeta(stack)
    await runPart(stack, id)
  } finally {
    running.value = false
  }
}

function stop() { if (running.value) stopRequested = true }

function exportData() {
  const parts = {}
  for (const p of PARTS) if (results[p.id]) parts[p.id] = results[p.id]
  return { meta: meta.value || {}, parts }
}

const hasResults = () => PARTS.some((p) => results[p.id])
const baseName = () => metadataFileBase(meta.value?.buName || meta.value?.stack || '', meta.value?.exportedAt ? new Date(meta.value.exportedAt) : new Date())

async function downloadExcel() { await downloadWorkbook(buildSheets(exportData()), `${baseName()}.xlsx`) }
async function downloadJson() { await saveTextFile(JSON.stringify(buildJson(exportData()), null, 2), `${baseName()}.json`, 'application/json', 'JSON file') }
async function downloadMarkdown() { await saveTextFile(toMarkdown(buildDoc(exportData())), `${baseName()}.md`, 'text/markdown', 'Markdown file') }

export function useMetadataExport() {
  return { selected, rowCounts, status, results, meta, running, start, retry, stop, hasResults, downloadExcel, downloadJson, downloadMarkdown }
}
