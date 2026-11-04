<script setup>
// Create DE (feedback #94): paste or upload a small sample (CSV, TSV, TXT, JSON,
// Parquet, Excel) or start with no file, check the guessed fields (name, type,
// length, primary key, required, default), set the data extension's name, folder
// (the last one used is remembered per stack and BU), sendable, testable and data
// retention, review, then create it in SFMC. The sample rows can be added too.
import ReportErrorButton from '@/components/results/ReportErrorButton.vue'
import ProgressBar from '@/components/ui/ProgressBar.vue'
import { computed, nextTick, ref, watch } from 'vue'
import { Loader2, Upload, Plus, Trash2, ArrowUp, ArrowDown, ArrowLeft, ExternalLink, FileText, AlertTriangle, RotateCcw, CheckCircle2, Folder } from 'lucide-vue-next'
import Button from '@/components/ui/button/Button.vue'
import Input from '@/components/ui/input/Input.vue'
import DEFolderPicker from '@/components/data/DEFolderPicker.vue'
import { useStack, whenStack } from '@/composables/useStack.js'
import { fetchCurrentBU } from '@/utils/sfmcApi.js'
import { openInSfmc } from '@/utils/sfmcLinks.js'
import {
  MAX_SAMPLE_ROWS, MAX_SAMPLE_BYTES, SAMPLE_ACCEPT, parseDelimitedSample, parseJsonSample, readSampleFile, fieldsFromSample,
} from '@/utils/createDE/sample.js'
import {
  FIELD_TYPES, RETENTION_MODES, RETENTION_UNITS, blankField, blankSettings, cellProblem, checkCreateForm, isFormValid,
  createDE, readLastFolder, saveLastFolder, rowsToLoad, lengthErrorField,
} from '@/utils/createDE/createDE.js'
import AiButton from '@/components/ai/AiButton.vue'
import AskAiDialog from '@/components/ai/AskAiDialog.vue'
import { useAi } from '@/composables/useAi.js'
import { AI_FIELDS_SYSTEM, buildFieldsPrompt, readFieldSuggestions } from '@/utils/aiAssist.js'

const { stack } = useStack()

const source = ref('paste') // paste | file | none
const pasted = ref('')
const delimiter = ref('') // '' = detect
const reading = ref(false)
const readError = ref('')
const sample = ref(null) // { columns, rows, truncated, kind, delimiter, sheet }
const fileName = ref('')
const dragging = ref(false)

const fields = ref([]) // { ...field, src: sample column index or null }
const settings = ref(blankSettings())
const step = ref('edit') // edit | confirm | saving | done
const error = ref('')
const loadRows = ref(true)
const result = ref(null)
const buId = ref(null)

const DELIMS = [
  { id: '', label: 'Detect' }, { id: ',', label: 'Comma' }, { id: '\t', label: 'Tab' }, { id: ';', label: 'Semicolon' }, { id: '|', label: 'Pipe' },
]
const typeInfo = Object.fromEntries(FIELD_TYPES.map((t) => [t.id, t]))

// Suggest field types with AI (feedback #1029, experimental): field names and the
// guessed types only, never the sample's values.
const ai = useAi()
const aiFieldsOpen = ref(false)
const fieldsPrompt = (purpose) => buildFieldsPrompt(fields.value.map((f) => ({ name: f.name, type: f.type, length: f.length })), purpose)
function suggestionsFor(text) {
  const byName = new Map(readFieldSuggestions(text).map((x) => [x.name.toLowerCase(), x]))
  return fields.value.map((f) => ({ field: f, s: byName.get(String(f.name).trim().toLowerCase()) || null })).filter((x) => x.s)
}
function applySuggestions(text, keys = false) {
  let n = 0
  for (const { field: f, s } of suggestionsFor(text)) {
    f.type = s.type
    if (typeInfo[s.type]?.fixedLength) f.length = typeInfo[s.type].fixedLength
    else if (typeInfo[s.type]?.length && s.length) f.length = s.length
    if (s.type === 'Decimal' && s.scale != null) f.scale = s.scale
    if (keys) { f.isPrimaryKey = s.isPrimaryKey; if (s.isPrimaryKey) f.isNullable = false }
    n++
  }
  aiFieldsOpen.value = false
  error.value = ''
  return n
}

function useSample(table, name = '') {
  sample.value = table
  fileName.value = name
  fields.value = fieldsFromSample(table).map((f, i) => ({ ...f, src: i }))
  if (!settings.value.name && name) settings.value.name = name.replace(/\.[^.]+$/, '').replace(/[^A-Za-z0-9_ -]+/g, '_').slice(0, 128)
  step.value = 'edit'
}

function readPasted() {
  readError.value = ''
  if (!pasted.value.trim()) { readError.value = 'Paste a few rows with a header row first.'; return }
  try {
    const text = pasted.value.trim()
    const table = /^[[{]/.test(text) ? parseJsonSample(text) : parseDelimitedSample(text, delimiter.value || undefined)
    if (!table.columns.length) throw new Error('No columns found.')
    useSample(table)
  } catch (e) {
    readError.value = `Could not read the text: ${e.message}`
  }
}

async function readFile(file) {
  if (!file) return
  readError.value = ''
  reading.value = true
  try {
    const table = await readSampleFile(file)
    if (!table.columns.length) throw new Error('No columns found.')
    useSample(table, file.name)
  } catch (e) {
    readError.value = `Could not read ${file.name}: ${e.message}`
  } finally {
    reading.value = false
  }
}

function onFileInput(e) { readFile(e.target.files?.[0]); e.target.value = '' }
function onDrop(e) { dragging.value = false; readFile(e.dataTransfer?.files?.[0]) }

function startEmpty() {
  sample.value = null
  fileName.value = ''
  fields.value = [{ ...blankField(1), src: null }]
  step.value = 'edit'
}

function addField() {
  fields.value = [...fields.value, { ...blankField(fields.value.length + 1), src: null }]
}
function removeField(i) {
  fields.value = fields.value.filter((_, j) => j !== i)
}
function moveField(i, by) {
  const j = i + by
  if (j < 0 || j >= fields.value.length) return
  const next = [...fields.value]
  ;[next[i], next[j]] = [next[j], next[i]]
  fields.value = next
}
function onTypeChange(f) {
  if (f.type === 'Text' && !f.length) f.length = 255
  if (f.type === 'Decimal') { if (!(Number(f.length) >= 1 && Number(f.length) <= 38)) f.length = 18; if (f.scale == null || f.scale === '') f.scale = 2 }
  if (!typeInfo[f.type].length) f.length = null
}
function onPrimaryKey(f) { if (f.isPrimaryKey) f.isNullable = false }

const check = computed(() => checkCreateForm(settings.value, fields.value))
const sendFields = computed(() => fields.value.filter((f) => ['Text', 'EmailAddress', 'Number'].includes(f.type)))

// Preview: the first 20 sample rows in field order, each cell checked against its field.
const PREVIEW_ROWS = 20
const preview = computed(() => {
  if (!sample.value) return []
  return sample.value.rows.slice(0, PREVIEW_ROWS).map((r) => fields.value.map((f) => {
    const v = f.src == null ? '' : r[f.src] ?? ''
    return { v, problem: cellProblem(v, f) }
  }))
})
const badCells = computed(() => {
  if (!sample.value) return 0
  let n = 0
  for (const r of sample.value.rows) fields.value.forEach((f) => { if (cellProblem(f.src == null ? '' : r[f.src], f)) n++ })
  return n
})
const loadPlan = computed(() => (sample.value ? rowsToLoad(fields.value, sample.value.rows, fields.value.map((f) => f.src)) : { items: [], skipped: 0 }))

// Remember the folder per stack and BU.
async function restoreFolder() {
  if (!stack.value) return
  const bu = await fetchCurrentBU(stack.value).catch(() => null)
  buId.value = bu?.accountId ?? null
  const last = await readLastFolder(stack.value, buId.value)
  if (last && settings.value.folderId == null) { settings.value.folderId = last.id; settings.value.folderPath = last.path }
}
whenStack(restoreFolder)
watch(stack, () => { settings.value.folderId = null; settings.value.folderPath = ''; restoreFolder() })

function review() {
  error.value = ''
  const c = check.value
  if (!isFormValid(c)) {
    const i = c.fields.findIndex(Boolean)
    error.value = c.form[0] || `Field ${i + 1} (${fields.value[i].name || 'no name'}): ${c.fields[i]}`
    return
  }
  step.value = 'confirm'
}

async function create() {
  step.value = 'saving'
  error.value = ''
  try {
    const withRows = !!sample.value && loadRows.value
    result.value = await createDE(stack.value, settings.value, fields.value, {
      rows: withRows ? sample.value.rows : null,
      columnIndex: fields.value.map((f) => f.src),
    })
    saveLastFolder(stack.value, buId.value, { id: settings.value.folderId, path: settings.value.folderPath })
    step.value = 'done'
  } catch (e) {
    error.value = `SFMC did not create the data extension: ${e.message}`
    step.value = 'confirm'
  }
}

// SFMC sometimes wants a length on a field it will not take one for (feedback #131,
// an EmailAddress primary key): offer to make that field Text (254) and try again.
const textFix = computed(() => {
  const name = lengthErrorField(error.value)
  if (!name) return null
  return fields.value.find((f) => String(f.name).trim().toLowerCase() === name.toLowerCase() && f.type !== 'Text') || null
})
function retryAsText() {
  const f = textFix.value
  if (!f) return
  f.type = 'Text'
  f.length = 254
  create()
}

function startOver() {
  const keep = { folderId: settings.value.folderId, folderPath: settings.value.folderPath }
  settings.value = { ...blankSettings(), ...keep }
  fields.value = []
  sample.value = null
  pasted.value = ''
  fileName.value = ''
  result.value = null
  error.value = ''
  step.value = 'edit'
}

const deUrl = computed(() => result.value?.de?.id && `https://mc.${stack.value}.marketingcloudapps.com/contactsmeta/admin.html#admin/data-extension/${result.value.de.id}/properties/`)
const toolkitLink = computed(() => result.value && `/data-extensions?q=${encodeURIComponent(result.value.de.name)}`)
const retentionLabel = computed(() => {
  const r = settings.value.retention
  if (r.mode === 'off') return 'Off'
  const unit = RETENTION_UNITS.find((u) => u.id === Number(r.unit))?.label || ''
  return `${RETENTION_MODES.find((m) => m.id === r.mode)?.label} after ${r.length} ${unit}${r.resetOnImport ? ', reset on import' : ''}`
})
const maxMB = Math.round(MAX_SAMPLE_BYTES / 1048576)

// Layout (feedback #1031, board "Data Extensions > New DE"): a step list on the left,
// numbered cards, and a sticky bar with the form's state and the Review button.
const SOURCES = [
  { id: 'paste', label: 'Paste rows', desc: 'From a spreadsheet, CSV or JSON' },
  { id: 'file', label: 'Upload a file', desc: 'CSV, TSV, TXT, JSON, Parquet, Excel' },
  { id: 'none', label: 'Add fields by hand', desc: 'No sample' },
]
const scroller = ref(null)
const activeSection = ref('s1')
const keyCount = computed(() => fields.value.filter((f) => f.isPrimaryKey).length)
const fieldProblems = computed(() => check.value.fields.filter(Boolean).length)
const nameMissing = computed(() => !String(settings.value.name ?? '').trim())
const folderMissing = computed(() => settings.value.folderId == null || settings.value.folderId === '')
const settingsNote = computed(() => {
  if (nameMissing.value && folderMissing.value) return 'Name and folder needed'
  if (nameMissing.value) return 'Name needed'
  if (folderMissing.value) return 'Folder needed'
  return check.value.form.length ? 'Needs a look' : 'Ready'
})
// tone: done (teal), warn (amber), idle (grey)
const steps = computed(() => [
  { id: 's1', n: 1, label: 'Sample data', note: sample.value ? `Optional · ${sample.value.columns.length} column(s) read` : 'Optional', tone: sample.value ? 'done' : 'idle' },
  { id: 's2', n: 2, label: 'Fields', note: fieldProblems.value ? `${fieldProblems.value} to fix` : `${fields.value.length} field(s)`, tone: fieldProblems.value ? 'warn' : fields.value.length ? 'done' : 'idle' },
  { id: 's3', n: 3, label: 'Settings', note: settingsNote.value, tone: settingsNote.value === 'Ready' ? 'done' : 'warn' },
  { id: 's4', n: 4, label: 'Review', note: 'Check, then create', tone: step.value === 'done' ? 'done' : 'idle' },
])
const stepCurrent = (s) => (step.value === 'edit' ? activeSection.value === s.id : s.id === 's4')
function stepBadge(s) {
  if (stepCurrent(s)) return 'bg-primary text-primary-foreground'
  if (s.tone === 'done') return 'bg-primary/10 text-primary'
  if (s.tone === 'warn') return 'bg-amber-100 text-amber-800 dark:bg-amber-500/15 dark:text-amber-300'
  return 'bg-muted text-muted-foreground'
}
async function goStep(s) {
  if (s.id === 's4') { review(); return }
  if (step.value !== 'edit') { step.value = 'edit'; await nextTick() }
  activeSection.value = s.id
  scroller.value?.querySelector(`#cde-${s.id}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
}
function onScroll() {
  const box = scroller.value
  if (!box || step.value !== 'edit') return
  const top = box.getBoundingClientRect().top + 120
  let cur = 's1'
  for (const id of ['s1', 's2', 's3']) {
    const el = box.querySelector(`#cde-${id}`)
    if (el && el.getBoundingClientRect().top <= top) cur = id
  }
  if (box.scrollTop + box.clientHeight >= box.scrollHeight - 4) cur = 's3'
  activeSection.value = cur
}
// Feedback #1052: these used to be computed refs inside an array in the template, where
// Vue unwraps them to plain booleans, so a click changed nothing. Toggle by key instead.
const SWITCHES = [
  { key: 'isSendable', label: 'Sendable', desc: 'Can be used as an audience for sends' },
  { key: 'isTestable', label: 'Testable', desc: 'Can be used for test sends' },
]
function toggleSetting(key) {
  settings.value[key] = !settings.value[key]
  if (key === 'isSendable' && settings.value.isSendable && !settings.value.sendField) {
    const pick = sendFields.value.find((f) => f.type === 'EmailAddress') || sendFields.value[0]
    if (pick) settings.value.sendField = pick.name
  }
}
const selectCls = 'h-9 rounded-full border border-border bg-card px-3 text-sm text-foreground'
const cellInput = 'h-9 rounded-lg text-sm'
</script>


<template>
  <div ref="scroller" class="h-full overflow-y-auto bg-background text-sm" @scroll.passive="onScroll">
    <div class="flex items-start">
      <!-- Steps -->
      <nav aria-label="Steps" class="hidden lg:flex sticky top-0 self-start w-60 shrink-0 flex-col gap-1 px-3 py-6">
        <button v-for="s in steps" :key="s.id" type="button" class="flex items-center gap-2.5 rounded-[10px] px-2.5 py-2 text-left hover:bg-accent"
          :class="stepCurrent(s) ? 'bg-primary/5' : ''" :aria-current="stepCurrent(s) ? 'step' : undefined" @click="goStep(s)">
          <span class="flex h-[26px] w-[26px] shrink-0 items-center justify-center rounded-full text-xs font-bold" :class="stepBadge(s)">{{ s.n }}</span>
          <span class="flex min-w-0 flex-col">
            <span class="text-sm font-semibold">{{ s.label }}</span>
            <span class="truncate text-xs text-muted-foreground">{{ s.note }}</span>
          </span>
        </button>
      </nav>

      <div class="flex min-w-0 max-w-[1080px] flex-1 flex-col gap-4 px-4 pt-6 pb-6 sm:px-6 lg:pl-2">
        <div class="flex flex-wrap items-end justify-between gap-3">
          <div class="flex flex-col gap-1">
            <nav aria-label="Breadcrumb" class="flex items-center gap-1.5 text-[13px]">
              <router-link to="/data-extensions" class="inline-flex items-center gap-1 text-primary hover:underline"><ArrowLeft class="h-3.5 w-3.5" /> Data Extensions</router-link>
              <span class="text-muted-foreground">/</span>
              <span class="text-muted-foreground">New DE</span>
            </nav>
            <h1 class="text-2xl font-bold">New data extension</h1>
          </div>
        </div>

        <template v-if="step === 'edit'">
          <!-- 1. Sample -->
          <section id="cde-s1" class="scroll-mt-4 overflow-hidden rounded-[14px] border border-border bg-card">
            <div class="flex items-center gap-2.5 border-b border-border px-[18px] py-3.5">
              <span class="flex h-6 w-6 items-center justify-center rounded-full bg-primary/10 text-xs font-bold text-primary">1</span>
              <h2 class="text-base font-bold">Sample data</h2><span class="text-xs font-medium text-muted-foreground">optional</span>
            </div>
            <div class="flex flex-col gap-3 px-[18px] py-4">
              <div class="grid gap-2.5 [grid-template-columns:repeat(auto-fit,minmax(180px,1fr))]" role="radiogroup" aria-label="Where the fields come from">
                <label v-for="o in SOURCES" :key="o.id" class="flex cursor-pointer flex-col items-start gap-0.5 rounded-xl px-3.5 py-3 focus-within:ring-2 focus-within:ring-ring"
                  :class="source === o.id ? 'border-2 border-primary bg-primary/5' : 'border border-border bg-card hover:bg-accent'">
                  <input v-model="source" type="radio" :value="o.id" class="sr-only" />
                  <span class="text-sm font-semibold">{{ o.label }}</span>
                  <span class="text-xs text-muted-foreground">{{ o.desc }}</span>
                </label>
              </div>

              <div v-if="source === 'paste'" class="flex flex-col gap-2.5">
                <textarea v-model="pasted" rows="5" class="w-full resize-y rounded-[10px] border border-border bg-background p-3 font-mono text-[13px]" placeholder="Paste a header row and a few rows (CSV, tab separated, semicolon or pipe), or a JSON array" aria-label="Sample rows" />
                <div class="flex flex-wrap items-center gap-2.5">
                  <span class="text-[13px] text-muted-foreground">Separator</span>
                  <select v-model="delimiter" :class="selectCls" aria-label="Separator">
                    <option v-for="d in DELIMS" :key="d.label" :value="d.id">{{ d.label }}</option>
                  </select>
                  <Button class="h-9 rounded-full px-3.5 text-sm" @click="readPasted"><FileText class="mr-1.5 h-4 w-4" /> Read sample</Button>
                </div>
              </div>

              <label v-else-if="source === 'file'" class="relative flex cursor-pointer flex-col items-center gap-2 rounded-xl border-2 border-dashed p-7 text-center"
                :class="dragging ? 'border-primary bg-primary/10' : 'border-primary/25 bg-primary/5'"
                @dragover.prevent="dragging = true" @dragleave="dragging = false" @drop.prevent="onDrop">
                <span class="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10 text-primary">
                  <Loader2 v-if="reading" class="h-5 w-5 animate-spin" /><Upload v-else class="h-5 w-5" />
                </span>
                <span class="text-sm font-semibold">Drop a file here, or click to choose one</span>
                <span class="text-xs text-muted-foreground">CSV, TSV, TXT, JSON, Parquet, Excel (.xlsx, .xls: first sheet)</span>
                <input type="file" class="sr-only" :accept="SAMPLE_ACCEPT" aria-label="Sample file" @change="onFileInput" />
              </label>

              <div v-else class="flex flex-wrap items-center gap-3">
                <span class="text-[13px] text-muted-foreground">Skip the sample and add fields one by one.</span>
                <Button variant="outline" class="h-9 rounded-full px-3.5 text-sm" @click="startEmpty"><Plus class="mr-1.5 h-4 w-4" /> Start with one field</Button>
              </div>

              <p v-if="sample" class="inline-flex w-fit items-center gap-1.5 rounded-full bg-emerald-50 px-2.5 py-1 text-[13px] font-semibold text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300">
                <CheckCircle2 class="h-4 w-4" />
                Read {{ sample.rows.length.toLocaleString() }} row(s) and {{ sample.columns.length }} column(s){{ fileName ? ` from ${fileName}` : '' }}{{ sample.sheet ? ` (sheet ${sample.sheet})` : '' }}{{ sample.truncated ? '; the rest of the file was not read' : '' }}.
              </p>
              <p v-if="readError" class="text-[13px] text-red-600 dark:text-red-400" role="alert">{{ readError }}<ReportErrorButton /></p>
              <p class="text-xs text-muted-foreground">Only the first {{ MAX_SAMPLE_ROWS.toLocaleString() }} rows ({{ maxMB }} MB at most) are read. Values stay in this browser unless you choose to add them to the new data extension.</p>
            </div>
          </section>

          <!-- 2. Fields -->
          <section id="cde-s2" class="scroll-mt-4 overflow-hidden rounded-[14px] border border-border bg-card">
            <div class="flex flex-wrap items-center gap-2.5 border-b border-border px-[18px] py-3.5">
              <span class="flex h-6 w-6 items-center justify-center rounded-full bg-primary/10 text-xs font-bold text-primary">2</span>
              <h2 class="text-base font-bold">Fields</h2>
              <span class="rounded-full bg-muted px-2 text-xs font-semibold text-muted-foreground">{{ fields.length }}</span>
              <span class="flex-1" />
              <AiButton v-if="fields.length" label="Suggest types" title="Suggest field types from the field names (experimental, Gemini Nano in Chrome; sample values are not used)" @click="aiFieldsOpen = true" />
              <Button variant="outline" class="h-[34px] rounded-full px-3.5 text-[13px] font-semibold" @click="addField"><Plus class="mr-1 h-4 w-4" /> Add field</Button>
            </div>
            <div class="flex flex-col gap-3 px-[18px] py-4">
              <p v-if="!fields.length" class="text-[13px] text-muted-foreground">No fields yet. Read a sample above, or add fields one by one.</p>
              <div v-else class="overflow-x-auto">
                <table class="w-full min-w-[860px] text-sm">
                  <thead class="text-left text-xs font-medium text-muted-foreground">
                    <tr>
                      <th class="w-14 pb-1.5 font-medium"></th><th class="pb-1.5 pr-2 font-medium">Name</th><th class="w-40 pb-1.5 pr-2 font-medium">Type</th>
                      <th class="w-24 pb-1.5 pr-2 font-medium">Length</th><th class="w-24 pb-1.5 pr-2 font-medium">Decimals</th>
                      <th class="w-20 pb-1.5 text-center font-medium">Primary key</th><th class="w-20 pb-1.5 text-center font-medium">Required</th>
                      <th class="pb-1.5 pr-2 font-medium">Default value</th><th class="w-10 pb-1.5"></th>
                    </tr>
                  </thead>
                  <tbody>
                    <template v-for="(f, i) in fields" :key="i">
                      <tr class="border-t border-border align-top">
                        <td class="whitespace-nowrap py-2">
                          <button type="button" class="inline-flex h-7 w-6 items-center justify-center rounded text-muted-foreground hover:bg-accent disabled:opacity-30" :disabled="i === 0" :aria-label="`Move ${f.name} up`" @click="moveField(i, -1)"><ArrowUp class="h-3.5 w-3.5" /></button>
                          <button type="button" class="inline-flex h-7 w-6 items-center justify-center rounded text-muted-foreground hover:bg-accent disabled:opacity-30" :disabled="i === fields.length - 1" :aria-label="`Move ${f.name} down`" @click="moveField(i, 1)"><ArrowDown class="h-3.5 w-3.5" /></button>
                        </td>
                        <td class="py-2 pr-2">
                          <Input v-model="f.name" :class="[cellInput, 'min-w-40', check.fields[i] ? 'border-red-400 dark:border-red-500' : '']" :aria-label="`Field ${i + 1} name`" />
                          <div v-if="f.sourceName && f.sourceName !== f.name" class="mt-0.5 text-[11px] text-muted-foreground">Column: {{ f.sourceName }}</div>
                        </td>
                        <td class="py-2 pr-2">
                          <select v-model="f.type" class="h-9 w-full rounded-lg border border-border bg-card px-2 text-sm" :aria-label="`Field ${i + 1} type`" @change="onTypeChange(f)">
                            <option v-for="t in FIELD_TYPES" :key="t.id" :value="t.id">{{ t.id }}</option>
                          </select>
                        </td>
                        <td class="py-2 pr-2"><Input v-if="typeInfo[f.type]?.length" v-model.number="f.length" type="number" min="1" :max="f.type === 'Decimal' ? 38 : 4000" :class="[cellInput, 'min-w-20 px-2']" :aria-label="`Field ${i + 1} length`" :placeholder="f.type === 'Text' ? '4000' : ''" /></td>
                        <td class="py-2 pr-2"><Input v-if="f.type === 'Decimal'" v-model.number="f.scale" type="number" min="0" :max="f.length" :class="[cellInput, 'min-w-16 px-2']" :aria-label="`Field ${i + 1} decimal places`" /></td>
                        <td class="py-2 text-center"><input v-model="f.isPrimaryKey" type="checkbox" class="mt-2 h-[18px] w-[18px] accent-primary" :aria-label="`Field ${i + 1} primary key`" @change="onPrimaryKey(f)" /></td>
                        <td class="py-2 text-center"><input type="checkbox" class="mt-2 h-[18px] w-[18px] accent-primary" :checked="!f.isNullable" :disabled="f.isPrimaryKey" :aria-label="`Field ${i + 1} required`" @change="f.isNullable = !$event.target.checked" /></td>
                        <td class="py-2 pr-2">
                          <div class="flex items-center gap-2">
                            <Input v-model="f.defaultValue" :class="[cellInput, 'min-w-28']" :disabled="f.type === 'Date' && f.currentDate"
                              :placeholder="f.type === 'Date' && f.currentDate ? 'Current date' : 'None'" :aria-label="`Field ${i + 1} default value`" />
                            <label v-if="f.type === 'Date'" class="flex items-center gap-1 whitespace-nowrap text-xs" title="The date and time the row is added">
                              <input v-model="f.currentDate" type="checkbox" class="accent-primary" :aria-label="`Field ${i + 1} defaults to the current date`" /> Current date
                            </label>
                          </div>
                        </td>
                        <td class="py-2"><button type="button" class="inline-flex h-[34px] w-[34px] items-center justify-center rounded-full text-red-700 hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-500/10" :aria-label="`Remove ${f.name}`" @click="removeField(i)"><Trash2 class="h-4 w-4" /></button></td>
                      </tr>
                      <tr v-if="check.fields[i]"><td></td><td colspan="8" class="pb-2 text-xs text-red-600 dark:text-red-400">{{ check.fields[i] }}</td></tr>
                    </template>
                  </tbody>
                </table>
              </div>

              <!-- Sample with these fields -->
              <div v-if="sample && fields.length" class="flex flex-col gap-2 rounded-[10px] bg-background p-3">
                <span class="text-xs font-semibold">Sample with these fields <span class="font-normal text-muted-foreground">first {{ Math.min(PREVIEW_ROWS, sample.rows.length) }} of {{ sample.rows.length.toLocaleString() }} rows</span></span>
                <div class="flex flex-wrap gap-1.5">
                  <span v-for="(f, i) in fields" :key="i" class="rounded-md border border-border bg-card px-2 py-0.5 text-xs"><span class="font-semibold">{{ f.name }}</span> <span class="text-muted-foreground">{{ f.type }}</span></span>
                </div>
                <p v-if="badCells" class="text-xs text-amber-700 dark:text-amber-400"><AlertTriangle class="mr-1 inline h-3.5 w-3.5" />{{ badCells.toLocaleString() }} value(s) in the sample do not fit their field (marked below; hover for why).</p>
                <div class="max-h-72 overflow-auto rounded-lg border border-border bg-card">
                  <table class="text-xs">
                    <thead class="sticky top-0 bg-muted text-left"><tr><th v-for="(f, i) in fields" :key="i" class="whitespace-nowrap px-2 py-1">{{ f.name }} <span class="font-normal text-muted-foreground">{{ f.type }}</span></th></tr></thead>
                    <tbody>
                      <tr v-for="(r, ri) in preview" :key="ri" class="border-t border-border">
                        <td v-for="(c, ci) in r" :key="ci" class="max-w-64 truncate whitespace-nowrap px-2 py-0.5" :class="c.problem ? 'bg-red-500/10 text-red-700 dark:text-red-300' : ''" :title="c.problem || c.v">{{ c.v }}</td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          </section>

          <!-- 3. Settings -->
          <section id="cde-s3" class="scroll-mt-4 overflow-hidden rounded-[14px] border border-border bg-card">
            <div class="flex items-center gap-2.5 border-b border-border px-[18px] py-3.5">
              <span class="flex h-6 w-6 items-center justify-center rounded-full bg-primary/10 text-xs font-bold text-primary">3</span>
              <h2 class="text-base font-bold">Settings</h2>
            </div>
            <div class="flex flex-col gap-3.5 px-[18px] py-4">
              <div class="grid gap-3.5 [grid-template-columns:repeat(auto-fit,minmax(260px,1fr))]">
                <label class="flex min-w-0 flex-col gap-1.5 text-[13px] font-semibold">Name *
                  <Input v-model="settings.name" class="h-10 rounded-[10px] text-sm font-normal" aria-label="Data extension name" />
                  <span v-if="nameMissing" class="text-xs font-normal text-muted-foreground">Required</span>
                </label>
                <label class="flex min-w-0 flex-col gap-1.5 text-[13px] font-semibold">External key
                  <Input v-model="settings.key" class="h-10 rounded-[10px] font-mono text-sm font-normal" placeholder="Leave empty and SFMC makes one" aria-label="External key" />
                </label>
              </div>
              <label class="flex min-w-0 flex-col gap-1.5 text-[13px] font-semibold">Description
                <Input v-model="settings.description" class="h-10 rounded-[10px] text-sm font-normal" placeholder="Optional" aria-label="Description" />
              </label>
              <div class="flex flex-col gap-1.5">
                <span class="flex items-center gap-2 text-[13px] font-semibold">Folder *
                  <span v-if="folderMissing" class="inline-flex items-center gap-1 rounded-md bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-800 dark:bg-amber-500/15 dark:text-amber-300"><Folder class="h-3 w-3" /> None picked yet</span>
                </span>
                <div class="rounded-[10px] border p-2 text-xs" :class="folderMissing ? 'border-dashed border-amber-400 bg-amber-50/60 dark:border-amber-500/50 dark:bg-amber-500/5' : 'border-border'">
                  <DEFolderPicker v-model="settings.folderId" v-model:path="settings.folderPath" :stack="stack" height="max-h-52" @error="(m) => (error = m)" />
                </div>
              </div>
              <div class="grid gap-2.5 [grid-template-columns:repeat(auto-fit,minmax(240px,1fr))]">
                <button v-for="t in SWITCHES" :key="t.key" :data-switch="t.key"
                  type="button" role="switch" :aria-checked="!!settings[t.key]" class="flex items-center gap-3 rounded-xl border border-border bg-card p-3 text-left hover:bg-accent" @click="toggleSetting(t.key)">
                  <span class="flex h-6 w-10 shrink-0 rounded-full p-0.5 transition-colors" :class="settings[t.key] ? 'justify-end bg-primary' : 'justify-start bg-gray-300 dark:bg-gray-600'"><span class="h-5 w-5 rounded-full bg-white shadow" /></span>
                  <span class="flex flex-col gap-0.5"><span class="text-sm font-semibold">{{ t.label }}</span><span class="text-xs text-muted-foreground">{{ t.desc }}</span></span>
                </button>
              </div>
              <div v-if="settings.isSendable" class="flex flex-wrap items-center gap-2.5 rounded-[10px] bg-primary/5 p-3">
                <span class="text-[13px] font-semibold">Send relationship</span>
                <select v-model="settings.sendField" :class="selectCls" aria-label="Send relationship field">
                  <option value="">Pick a field</option>
                  <option v-for="f in sendFields" :key="f.name" :value="f.name">{{ f.name }}</option>
                </select>
                <span class="text-[13px] text-muted-foreground">relates to</span>
                <span class="text-[13px] font-semibold">Subscriber Key</span>
              </div>
              <div class="flex flex-wrap items-center gap-2.5">
                <span class="text-[13px] font-semibold">Data retention</span>
                <select v-model="settings.retention.mode" :class="selectCls" aria-label="Data retention">
                  <option v-for="m in RETENTION_MODES" :key="m.id" :value="m.id">{{ m.label }}</option>
                </select>
                <template v-if="settings.retention.mode !== 'off'">
                  <span class="text-[13px] text-muted-foreground">after</span>
                  <Input v-model.number="settings.retention.length" type="number" min="1" max="999" class="h-9 w-20 rounded-lg text-sm" aria-label="Retention period" />
                  <select v-model.number="settings.retention.unit" :class="selectCls" aria-label="Retention unit">
                    <option v-for="u in RETENTION_UNITS" :key="u.id" :value="u.id">{{ u.label }}</option>
                  </select>
                  <label class="flex items-center gap-1.5 text-[13px]"><input v-model="settings.retention.resetOnImport" type="checkbox" class="accent-primary" /> Reset the period on import</label>
                </template>
              </div>
            </div>
          </section>

          <!-- Sticky bar -->
          <div class="sticky bottom-0 z-10 flex flex-wrap items-center gap-3 rounded-[14px] border border-border bg-card px-[18px] py-3 shadow-[0_-10px_30px_-20px_rgba(17,24,39,0.4)]">
            <span class="flex flex-wrap gap-1.5 text-xs font-semibold">
              <span class="rounded-md bg-primary/10 px-2 py-0.5 text-primary">{{ fields.length }} field(s)</span>
              <span class="rounded-md bg-muted px-2 py-0.5 text-foreground/80">{{ keyCount ? `${keyCount} primary key(s)` : 'No primary key' }}</span>
              <span v-if="fieldProblems" class="rounded-md bg-amber-100 px-2 py-0.5 text-amber-800 dark:bg-amber-500/15 dark:text-amber-300">{{ fieldProblems }} field(s) to fix</span>
              <span v-if="nameMissing" class="rounded-md bg-amber-100 px-2 py-0.5 text-amber-800 dark:bg-amber-500/15 dark:text-amber-300">Name needed</span>
              <span v-if="folderMissing" class="rounded-md bg-amber-100 px-2 py-0.5 text-amber-800 dark:bg-amber-500/15 dark:text-amber-300">Folder needed</span>
              <span v-if="!stack" class="rounded-md bg-muted px-2 py-0.5 text-muted-foreground">Connect to Marketing Cloud first</span>
            </span>
            <span class="ml-auto flex flex-wrap gap-2">
              <Button variant="outline" class="h-[38px] rounded-full px-3.5 text-sm" :disabled="!fields.length && !sample && !pasted" @click="startOver"><RotateCcw class="mr-1.5 h-4 w-4" /> Start over</Button>
              <Button class="h-[38px] rounded-full px-[18px] text-sm font-semibold" :disabled="!stack" @click="review">Review</Button>
            </span>
            <p v-if="error" class="basis-full text-[13px] text-red-600 dark:text-red-400" role="alert">{{ error }}<ReportErrorButton /></p>
          </div>
        </template>

        <!-- 4. Review -->
        <section v-else-if="step === 'confirm' || step === 'saving'" id="cde-s4" class="overflow-hidden rounded-[14px] border border-border bg-card">
          <div class="flex items-center gap-2.5 border-b border-border px-[18px] py-3.5">
            <span class="flex h-6 w-6 items-center justify-center rounded-full bg-primary text-xs font-bold text-primary-foreground">4</span>
            <h2 class="text-base font-bold">Check before creating</h2>
          </div>
          <div class="flex flex-col gap-3 px-[18px] py-4 text-[13px]">
            <dl class="grid gap-x-4 gap-y-2 sm:grid-cols-[160px_1fr]">
              <dt class="text-muted-foreground">Data extension</dt>
              <dd><b>{{ settings.name.trim() }}</b><span v-if="settings.key.trim()" class="text-muted-foreground"> (key <span class="font-mono">{{ settings.key.trim() }}</span>)</span></dd>
              <dt class="text-muted-foreground">Folder</dt><dd><b>{{ settings.folderPath }}</b></dd>
              <dt class="text-muted-foreground">{{ fields.length }} field(s)</dt>
              <dd>{{ fields.map((f) => `${f.name.trim()} (${f.type}${f.type === 'Text' && f.length ? ' ' + f.length : ''}${f.type === 'Decimal' ? ` ${f.length},${f.scale}` : ''}${f.isPrimaryKey ? ', primary key' : ''}${f.type === 'Date' && f.currentDate ? ', defaults to the current date' : ''})`).join(', ') }}</dd>
              <dt class="text-muted-foreground">Sending</dt>
              <dd>Sendable: {{ settings.isSendable ? `yes, ${settings.sendField} relates to Subscriber Key` : 'no' }}. Testable: {{ settings.isTestable ? 'yes' : 'no' }}.</dd>
              <dt class="text-muted-foreground">Data retention</dt><dd>{{ retentionLabel }}</dd>
            </dl>
            <label v-if="sample" class="flex items-center gap-1.5">
              <input v-model="loadRows" type="checkbox" class="accent-primary" />
              Also add the {{ loadPlan.items.length.toLocaleString() }} sample row(s){{ loadPlan.skipped ? ` (${loadPlan.skipped.toLocaleString()} with values that do not fit are left out)` : '' }}
            </label>
            <ProgressBar v-if="step === 'saving'" indeterminate :label="sample && loadRows ? 'Creating the data extension and sending rows' : 'Creating the data extension'" class="max-w-md" />
            <p v-if="error" class="text-red-600 dark:text-red-400" role="alert">{{ error }}<ReportErrorButton /></p>
            <div v-if="textFix && step !== 'saving'" class="flex flex-col gap-2 rounded-[10px] border border-amber-300 bg-amber-50 p-3 dark:border-amber-500/40 dark:bg-amber-500/10">
              <p>SFMC would not take <b>{{ textFix.name.trim() }}</b> as {{ textFix.type }}{{ textFix.isPrimaryKey ? ' while it is the primary key' : '' }}. A Text field of 254 characters holds the same values (254 is the longest email address).</p>
              <Button variant="outline" class="h-8 w-fit rounded-full text-xs" @click="retryAsText">Make {{ textFix.name.trim() }} Text (254) and try again</Button>
            </div>
            <div class="flex gap-2">
              <Button variant="outline" class="h-[38px] rounded-full px-3.5 text-sm" :disabled="step === 'saving'" @click="step = 'edit'"><ArrowLeft class="mr-1.5 h-4 w-4" /> Back</Button>
              <Button class="h-[38px] rounded-full px-[18px] text-sm font-semibold" :disabled="step === 'saving'" @click="create">
                <Loader2 v-if="step === 'saving'" class="mr-1.5 h-4 w-4 animate-spin" /> Create in SFMC
              </Button>
            </div>
          </div>
        </section>

        <!-- Done -->
        <section v-else-if="step === 'done' && result" class="flex flex-col gap-2.5 rounded-[14px] border border-border bg-card px-[18px] py-4 text-[13px]" role="status">
          <h2 class="flex items-center gap-2 text-base font-bold"><CheckCircle2 class="h-5 w-5 text-emerald-600 dark:text-emerald-400" /> Created {{ result.de.name }}</h2>
          <p v-if="result.loaded">{{ result.loaded.toLocaleString() }} row(s) sent to SFMC; it adds them in the background, so they can take a minute to show.<span v-if="result.skipped"> {{ result.skipped.toLocaleString() }} row(s) were left out.</span></p>
          <p v-if="result.loadError" class="text-red-600 dark:text-red-400" role="alert">The rows were not added: {{ result.loadError }}<ReportErrorButton /></p>
          <div class="flex flex-wrap items-center gap-3">
            <a v-if="deUrl" :href="deUrl" target="_blank" rel="noopener" class="inline-flex items-center gap-1 text-primary hover:underline" @click="openInSfmc($event, deUrl)"><ExternalLink class="h-3.5 w-3.5" /> Open in Contact Builder</a>
            <router-link :to="toolkitLink" class="inline-flex items-center gap-1 text-primary hover:underline">Find it in Data Extensions</router-link>
            <Button variant="outline" class="ml-auto h-9 rounded-full px-3.5 text-sm" @click="startOver"><Plus class="mr-1.5 h-4 w-4" /> Create another</Button>
          </div>
        </section>
      </div>
    </div>

    <AskAiDialog v-if="ai.shown.value" :open="aiFieldsOpen" title="Suggest field types" :system="AI_FIELDS_SYSTEM" :prompt="fieldsPrompt"
      :auto-ask="false" extra-label="What is the data extension for?" extra-placeholder="For example: newsletter sign-ups from the website" @close="aiFieldsOpen = false">
      <template #answer="{ text }">
        <div class="basis-full overflow-x-auto">
          <p v-if="!suggestionsFor(text).length" class="text-amber-700 dark:text-amber-300">The answer has no suggestions for these field names. Try asking again.</p>
          <table v-else class="text-xs mb-1">
            <thead><tr class="text-left text-muted-foreground"><th class="pr-3">Field</th><th class="pr-3">Now</th><th class="pr-3">Suggested</th><th>Primary key</th></tr></thead>
            <tbody>
              <tr v-for="x in suggestionsFor(text)" :key="x.field.name">
                <td class="pr-3">{{ x.field.name }}</td>
                <td class="pr-3 text-muted-foreground">{{ x.field.type }}{{ typeInfo[x.field.type]?.length ? ` (${x.field.length})` : '' }}</td>
                <td class="pr-3" :class="x.s.type !== x.field.type ? 'font-semibold' : ''">{{ x.s.type }}{{ x.s.length ? ` (${x.s.length}${x.s.scale != null && x.s.type === 'Decimal' ? `, ${x.s.scale}` : ''})` : '' }}</td>
                <td>{{ x.s.isPrimaryKey ? 'yes' : '' }}</td>
              </tr>
            </tbody>
          </table>
        </div>
        <Button v-if="suggestionsFor(text).length" size="sm" class="h-8 text-xs" @click="applySuggestions(text)">Apply types</Button>
        <Button v-if="suggestionsFor(text).some((x) => x.s.isPrimaryKey)" variant="outline" size="sm" class="h-8 text-xs" @click="applySuggestions(text, true)">Apply types and primary keys</Button>
      </template>
    </AskAiDialog>
  </div>
</template>
