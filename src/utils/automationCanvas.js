// The automation canvas (feedback #1035), laid out like Automation Studio's own canvas:
// a starting source card on the left (Schedule, File Drop or none), then one tall lane per
// step, headed "Step N", with the step's activities stacked in it, and arrows between them.
// Pure data and geometry: AutomationCanvas.vue and automationSvg.js both draw this model,
// so the download matches the page. Built only from the automation record already loaded.
import { describeRecurrence } from './ical.js'
import { activityTypeLabel } from './activityTypes.js'
import { activityIconKind } from './activityIcons.js'
import { formatDateTime } from './format.js'

export const CANVAS_PAD = 24
export const SOURCE_WIDTH = 200
export const LANE_WIDTH = 224
export const LANE_GAP = 56
export const HEADER_HEIGHT = 52
export const CARD_HEIGHT = 72
export const CARD_GAP = 10
export const LANE_PAD = 12
export const SOURCE_HEADER = 44
export const SOURCE_LINE = 18

const text = (v) => (v == null ? '' : String(v).trim())

// Fields a file drop automation may carry (names differ between SFMC responses); only
// the ones present are shown.
const FILE_FIELDS = [
  [['fileNamingPattern', 'fileNamePattern', 'filenamePattern', 'pattern'], 'File name'],
  [['folderLocationText', 'folderName', 'folderLocation', 'fileLocation', 'location'], 'Folder'],
]

// Automation Studio's FILENAME_PATTERN_PREFIXES and its Equals option.
const PATTERN_TYPES = { 1: 'Contains', 2: 'Begins with', 3: 'Ends with', 4: 'Equals' }

/** The starting source: { kind: 'schedule' | 'fileDrop' | 'none', title, lines }. */
export function automationSource(details) {
  const d = details || {}
  const s = d.schedule
  if (s && (s.icalRecur || s.scheduledTime || s.startDate)) {
    const lines = []
    const recur = describeRecurrence(s.icalRecur) || text(s.icalRecur)
    if (recur) lines.push(recur)
    if (formatDateTime(s.scheduledTime)) lines.push(`Next run ${formatDateTime(s.scheduledTime)}`)
    if (s.timezoneName) lines.push(text(s.timezoneName))
    if (s.scheduleStatus) lines.push(`Schedule ${text(s.scheduleStatus).toLowerCase()}`)
    return { kind: 'schedule', title: 'Schedule', lines }
  }
  // The legacy definition (Automation Studio's Summary) has the file drop settings: older
  // file drops at its top level, newer ones under automationTrigger (live check, 2026-11-10).
  const L = d.legacy || {}
  const legacyTrigger = L.automationTrigger || (L.filenamePattern != null || L.queueFiles != null ? L : null)
  const trigger = d.fileTrigger || d.fileDrop || d.trigger || legacyTrigger || null
  if (trigger || /trigger|file/i.test(text(d.type))) {
    const lines = []
    // A field from the REST trigger, else from the legacy one.
    const pick = (...names) => [trigger, legacyTrigger].flatMap((t) => names.map((n) => t?.[n])).find((v) => v != null && v !== '')
    const pattern = text(pick('fileNamePattern', 'filenamePattern', 'fileNamingPattern'))
    const op = PATTERN_TYPES[Number(pick('fileNamePatternType', 'filenamePatternType'))]
    if (pattern && op) lines.push(`Filename pattern: ${op} ${pattern}`)
    for (const [names, label] of FILE_FIELDS) {
      if (label === 'File name' && op && pattern) continue
      const v = [trigger, legacyTrigger].flatMap((t) => names.map((n) => t?.[n])).find((x) => typeof x === 'string' && x.trim())
      if (v) lines.push(`${label}: ${v.trim()}`)
    }
    const queue = pick('queueFiles')
    if (typeof queue === 'boolean') lines.push(`Queue files: ${queue ? 'On' : 'Off'}`)
    const active = pick('isTriggerActive', 'triggerActive')
    if (typeof active === 'boolean') lines.push(`Trigger: ${active ? 'Active' : 'Inactive'}`)
    if (!lines.length) lines.push('Runs when a file arrives')
    return { kind: 'fileDrop', title: 'File Drop', lines }
  }
  return { kind: 'none', title: 'Starting source', lines: ['No schedule. Runs when started.'] }
}

/**
 * The canvas model.
 * @param {object} details  the automation (steps with activities)
 * @param {{ runningStep?: number }} opts  1-based step that is running now, if any
 */
export function automationCanvasModel(details, { runningStep = 0 } = {}) {
  const steps = details?.steps || []
  const source = automationSource(details)
  const top = CANVAS_PAD
  const laneHeights = steps.map((step) => {
    const n = Math.max(1, (step.activities || []).length)
    return HEADER_HEIGHT + LANE_PAD + n * CARD_HEIGHT + (n - 1) * CARD_GAP + LANE_PAD
  })
  const sourceHeight = SOURCE_HEADER + Math.max(1, source.lines.length) * SOURCE_LINE + 12
  const laneHeight = Math.max(sourceHeight, ...laneHeights, HEADER_HEIGHT + LANE_PAD * 2 + CARD_HEIGHT)
  const src = { ...source, x: CANVAS_PAD, y: top, w: SOURCE_WIDTH, h: sourceHeight }
  const columns = steps.map((step, si) => {
    const x = CANVAS_PAD + SOURCE_WIDTH + LANE_GAP + si * (LANE_WIDTH + LANE_GAP)
    const cards = (step.activities || []).map((a, ai) => ({
      key: `${si}.${ai}`,
      label: `${si + 1}.${ai + 1}`,
      typeId: a.objectTypeId ?? null,
      typeLabel: activityTypeLabel(a.objectTypeId),
      iconKind: activityIconKind(a.objectTypeId),
      name: text(a.name) || activityTypeLabel(a.objectTypeId),
      x: x + LANE_PAD,
      y: top + HEADER_HEIGHT + LANE_PAD + ai * (CARD_HEIGHT + CARD_GAP),
      w: LANE_WIDTH - LANE_PAD * 2,
      h: CARD_HEIGHT,
    }))
    return {
      index: si,
      label: `Step ${si + 1}`,
      name: text(step.name),
      running: runningStep === si + 1,
      x, y: top, w: LANE_WIDTH, h: laneHeight,
      cards,
    }
  })
  // Arrows run between the headers: source → step 1 → step 2 ...
  const arrowY = top + HEADER_HEIGHT / 2
  const connectors = []
  let fromX = src.x + src.w
  for (const c of columns) {
    connectors.push({ x1: fromX, y1: arrowY, x2: c.x, y2: arrowY })
    fromX = c.x + c.w
  }
  const width = (columns.length ? fromX : src.x + src.w) + CANVAS_PAD
  const height = top + laneHeight + CANVAS_PAD
  return { source: src, columns, connectors, width, height }
}

/** Scale that fits the canvas into a box (never above 1, never below 0.3). */
export function fitScale(model, boxWidth, boxHeight = Infinity) {
  if (!model?.width || !boxWidth) return 1
  const s = Math.min(boxWidth / model.width, boxHeight / model.height, 1)
  return Math.max(0.3, Math.round(s * 100) / 100)
}
