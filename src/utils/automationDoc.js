// The export document for one automation (from SFMC Automation Viewer's
// downloadAutomation.js): overview, schedule, error notifications, then every step's
// activities with their details.
import { activityBlocks, activityTypeLabel, describeActivity } from './activityTypes.js'
import { automationOverviewRows, scheduleSummary } from './automationSummary.js'
import { formatDateTime } from './format.js'
import { fetchAutomation, fetchActivityDetails } from './automationApi.js'
import { runInBatches } from './batchRunner.js'
import { automationSvg } from './automationSvg.js'

// Overview and schedule rows: Automation Studio's Summary (utils/automationSummary.js).
export { automationOverviewRows }
export function scheduleRows(d) {
  const { rows, note, description } = scheduleSummary(d)
  return [...rows, ...(description ? [['Summary', description]] : []), ...(note ? [['Note', note]] : [])]
}

/**
 * @param {object} details   the automation
 * @param {object|null} notifications
 * @param {(stepIdx, actIdx) => object|null} descFor  the described activity, if loaded
 */
export function automationDoc(details, notifications, descFor) {
  const blocks = [
    { type: 'h', level: 2, text: 'Overview' },
    { type: 'kv', rows: automationOverviewRows(details) },
  ]
  if (details.schedule) blocks.push({ type: 'h', level: 2, text: 'Schedule' }, { type: 'kv', rows: scheduleRows(details) })
  const workers = notifications?.workers || []
  if (workers.length) {
    blocks.push({ type: 'h', level: 2, text: 'Error notifications' },
      { type: 'table', columns: ['Type', 'Recipient', 'Channel'], rows: workers.map((w) => [w.notificationType || '', w.definition || '', w.channelType || '']) })
  }
  // The canvas (feedback #1035): drawn in the HTML and PDF downloads, a note elsewhere.
  if ((details.steps || []).length) {
    blocks.push({ type: 'h', level: 2, text: 'Steps' }, { type: 'svg', svg: automationSvg(details), note: 'Automation diagram: in the HTML and PDF downloads.' })
  }
  ;(details.steps || []).forEach((step, si) => {
    blocks.push({ type: 'h', level: 2, text: `Step ${si + 1}${step.name ? `: ${step.name}` : ''}` })
    ;(step.activities || []).forEach((a, ai) => {
      const desc = descFor(si, ai)
      if (desc) blocks.push(...activityBlocks(desc, `${si + 1}.${ai + 1}`))
      else blocks.push({ type: 'h', level: 3, text: `${si + 1}.${ai + 1}: ${a.name || ''}` }, { type: 'p', text: `${activityTypeLabel(a.objectTypeId)}. Details could not be loaded.` })
    })
    if (!step.activities?.length) blocks.push({ type: 'p', text: 'No activities.' })
  })
  return { title: details.name || 'Automation', blocks }
}

/**
 * One document for several automations (feedback #40): a summary table, then each
 * automation's full export with its headings one level down. Loads 2 automations
 * at a time (and 4 activities at a time within each); one that cannot be read
 * gets a note instead. onProgress(done, total).
 */
export async function automationsDoc(stack, list, { onProgress, shouldStop } = {}) {
  const docs = new Array(list.length)
  await runInBatches(list, 2, async (a, i) => {
    try {
      const { details, notifications } = await fetchAutomation(stack, a.id)
      const items = []
      ;(details.steps || []).forEach((s, si) => (s.activities || []).forEach((x, ai) => items.push({ x, k: `${si}.${ai}` })))
      const acts = {}
      await runInBatches(items, 4, async ({ x, k }) => {
        try { acts[k] = describeActivity(x.objectTypeId, await fetchActivityDetails(stack, x), stack) } catch { acts[k] = null }
      })
      docs[i] = automationDoc(details, notifications, (si, ai) => acts[`${si}.${ai}`] || null)
    } catch (e) {
      docs[i] = { title: a.name || 'Automation', blocks: [{ type: 'p', text: `Could not load this automation: ${e.message}` }] }
    }
  }, { onProgress, shouldStop })
  const blocks = [{
    type: 'table', columns: ['Name', 'Status', 'Last run', 'Last run at', 'Modified'],
    rows: list.map((a) => [a.name || '', String(a.status ?? ''), String(a.lastRunStatus ?? ''), formatDateTime(a.lastRunTime), formatDateTime(a.modifiedDate)]),
  }]
  docs.forEach((d) => {
    if (!d) return
    blocks.push({ type: 'h', level: 2, text: d.title })
    for (const b of d.blocks) blocks.push(b.type === 'h' ? { ...b, level: Math.min((b.level || 2) + 1, 6) } : b)
  })
  return { title: list.length === 1 ? list[0].name || 'Automation' : `${list.length} automations`, blocks }
}
