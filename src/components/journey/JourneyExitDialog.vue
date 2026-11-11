<script setup>
// Remove contacts from a journey (API idea 4; user, 2026-11-11). The only feature that
// changes journey data in SFMC. Three steps: contacts and versions, a review, then the
// run with a result per contact. The run starts only after a confirm dialog in which
// the user types the number of contacts (or the journey name). Hidden under the
// `disableJourneyWrites` policy (the page does not show the button; requestExit refuses too).
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { X, Loader2, UserMinus, Upload, Database, Download, Square, RefreshCw, AlertTriangle } from 'lucide-vue-next'
import Button from '@/components/ui/button/Button.vue'
import ProgressBar from '@/components/ui/ProgressBar.vue'
import DEPickerDialog from '@/components/data/DEPickerDialog.vue'
import { fetchDEFieldList } from '@/utils/deApi.js'
import { loadRemainingRows } from '@/utils/deRows.js'
import { readFileText, saveTextFile } from '@/utils/download.js'
import { withReconnect, searchError } from '@/utils/sfmcErrors.js'
import {
  EXIT_BATCH, EXIT_MAX_KEYS, EXIT_STATUS_LABELS, cleanKeys, parsePastedKeys, parseKeyFile, guessHeader, guessKeyColumn,
  keysFromColumn, runExit, refreshExitStatus, exitCounts, exitResultsCsv, confirmMatches, journeyWritesAllowed,
} from '@/utils/journeyExit.js'

const props = defineProps({
  stack: { type: String, default: '' },
  journey: { type: Object, required: true }, // { id, key, name, version }
  versions: { type: Array, default: () => [] }, // [{ version, status }]
  initialKeys: { type: Array, default: () => [] },
  initialVersions: { type: Array, default: null }, // preselected versions; null = all versions
})
const emit = defineEmits(['close'])

const fmt = (n) => Number(n).toLocaleString('en-US')
const step = ref('keys') // keys | review | run

// Contacts
const source = ref('paste') // paste | file | de
const pasteText = ref(props.initialKeys.join('\n'))
const file = ref(null) // { name, rows }
const fileHeader = ref(true)
const fileColumn = ref(0)
const fileInput = ref(null)
const deOpen = ref(false)
const de = ref(null) // { de, fields, column, keys, total, loading, error, capped }
const formError = ref('')

const parsed = computed(() => {
  if (source.value === 'paste') return parsePastedKeys(pasteText.value)
  if (source.value === 'file') return file.value ? keysFromColumn(file.value.rows, fileColumn.value, fileHeader.value) : cleanKeys([])
  return de.value?.keys ? cleanKeys(de.value.keys) : cleanKeys([])
})
const keys = computed(() => parsed.value.keys)
const tooMany = computed(() => keys.value.length > EXIT_MAX_KEYS)
const fileColumns = computed(() => {
  const first = file.value?.rows?.[0] || []
  return first.map((c, i) => (fileHeader.value && c.trim() ? c.trim() : `Column ${i + 1}`))
})

async function onFile(e) {
  const f = e.target.files?.[0]
  e.target.value = ''
  if (!f) return
  formError.value = ''
  try {
    const { rows } = parseKeyFile(await readFileText(f))
    if (!rows.length) { formError.value = `${f.name} has no rows.`; return }
    fileHeader.value = guessHeader(rows)
    fileColumn.value = fileHeader.value ? guessKeyColumn(rows[0]) : 0
    file.value = { name: f.name, rows }
  } catch (err) { formError.value = `Could not read ${f.name}: ${err.message}` }
}

async function onDePick({ de: picked }) {
  deOpen.value = false
  de.value = { de: picked, fields: [], column: '', keys: null, total: null, loading: true, error: '', capped: false }
  try {
    const fields = await withReconnect(props.stack, () => fetchDEFieldList(props.stack, picked.id))
    const names = fields.map((f) => f.name)
    const pk = fields.find((f) => f.isPrimaryKey)?.name
    // ContactKey or SubscriberKey by name, else the primary key, else the first field.
    const byName = names.find((n) => /^(contact|subscriber)[\s_-]*key$/i.test(n))
    de.value = { ...de.value, fields: names, column: byName || pk || names[0] || '', loading: false }
  } catch (e) { de.value = { ...de.value, loading: false, error: searchError(e, `read the fields of ${picked.name}`).message } }
}
async function readDeColumn() {
  const d = de.value
  if (!d?.column) return
  de.value = { ...d, keys: null, loading: true, error: '', capped: false, total: null }
  const out = []
  let total = null
  try {
    await withReconnect(props.stack, () => loadRemainingRows({
      stack: props.stack, key: d.de.key, have: 0, columnNames: d.fields, limit: EXIT_MAX_KEYS,
      onRows: (rows, t) => { out.push(...rows.map((r) => r[d.column])); if (t != null) total = t },
    }))
    de.value = { ...de.value, keys: out, total, loading: false, capped: total != null && total > EXIT_MAX_KEYS }
  } catch (e) { de.value = { ...de.value, loading: false, error: searchError(e, `read the rows of ${d.de.name}`).message } }
}

// Versions
const versionList = computed(() => {
  const list = props.versions.length ? props.versions : [{ version: props.journey.version, status: props.journey.status }]
  return list.filter((v) => v?.version != null)
})
const versionMode = ref(props.initialVersions?.length ? 'chosen' : 'all')
const chosen = ref((props.initialVersions || []).map(Number))
const pickedVersions = computed(() => (versionMode.value === 'all' ? null : [...chosen.value].sort((a, b) => a - b)))
const versionText = computed(() => (pickedVersions.value ? `Version${pickedVersions.value.length === 1 ? '' : 's'} ${pickedVersions.value.join(', ')}` : 'All versions'))

function toReview() {
  formError.value = ''
  if (!props.journey.key) { formError.value = 'This journey has no key, so contacts cannot be removed from it.'; return }
  if (!keys.value.length) { formError.value = 'Add at least one Contact Key.'; return }
  if (tooMany.value) { formError.value = `${fmt(keys.value.length)} contacts: remove at most ${fmt(EXIT_MAX_KEYS)} at a time.`; return }
  if (pickedVersions.value && !pickedVersions.value.length) { formError.value = 'Tick at least one version, or choose All versions.'; return }
  step.value = 'review'
}

// Confirm
const confirmOpen = ref(false)
const typed = ref('')
const canConfirm = computed(() => confirmMatches(typed.value, keys.value.length, props.journey.name))
function openConfirm() { typed.value = ''; confirmOpen.value = true }

// Run
const running = ref(false)
const stopAsked = ref(false)
const progress = ref({ done: 0, total: 0 })
const rows = ref([])
const stopped = ref(false)
const runError = ref('')
const refreshing = ref(false)
const counts = computed(() => exitCounts(rows.value))

async function start() {
  if (!canConfirm.value || !journeyWritesAllowed()) return
  confirmOpen.value = false
  step.value = 'run'
  running.value = true
  stopAsked.value = false
  runError.value = ''
  rows.value = []
  const list = [...keys.value]
  progress.value = { done: 0, total: list.length }
  try {
    const r = await runExit({
      stack: props.stack, keys: list, definitionKey: props.journey.key, versions: pickedVersions.value,
      shouldStop: () => stopAsked.value,
      onProgress: (p) => { progress.value = { done: p.done, total: p.total }; rows.value = p.rows },
    })
    rows.value = r.rows
    stopped.value = r.stopped
  } catch (e) { runError.value = e?.message || String(e) } finally { running.value = false }
}
async function checkAgain() {
  refreshing.value = true
  runError.value = ''
  try { rows.value = await refreshExitStatus({ stack: props.stack, rows: rows.value, definitionKey: props.journey.key, versions: pickedVersions.value }) }
  catch (e) { runError.value = `Could not read the status: ${e?.message || e}` } finally { refreshing.value = false }
}
function downloadCsv() {
  saveTextFile(exitResultsCsv(rows.value, props.journey.name || props.journey.key), `journey-exit-${new Date().toISOString().slice(0, 10)}.csv`, 'text/csv', 'CSV file')
}
const statusClass = (s) => ({ exited: 'text-green-700 dark:text-green-400', error: 'text-red-600', queued: 'text-amber-700 dark:text-amber-400' }[s] || 'text-muted-foreground')

function close() {
  if (running.value) return // Stop first; the dialog stays while a batch is out
  if (confirmOpen.value) { confirmOpen.value = false; return }
  emit('close')
}
const onKey = (e) => { if (e.key === 'Escape' && !deOpen.value) close() }
onMounted(() => window.addEventListener('keydown', onKey))
onBeforeUnmount(() => window.removeEventListener('keydown', onKey))
</script>

<template>
  <div class="fixed inset-0 z-[150] flex items-center justify-center bg-black/40 p-4" @mousedown.self="close">
    <div role="dialog" aria-modal="true" aria-label="Remove contacts from this journey" class="flex flex-col w-full max-w-3xl max-h-[88vh] overflow-hidden rounded-2xl border border-border bg-card shadow-xl text-xs" data-journey-exit>
      <div class="flex items-center gap-2 px-4 py-3 border-b border-border">
        <UserMinus class="h-4 w-4 text-red-600" />
        <h2 class="font-semibold text-sm flex-1 truncate">Remove contacts from {{ journey.name || journey.key }}</h2>
        <button type="button" class="p-1 rounded hover:bg-accent disabled:opacity-40" aria-label="Close" :disabled="running" @click="close"><X class="h-4 w-4" /></button>
      </div>

      <div class="flex-1 min-h-0 overflow-y-auto p-4 space-y-3">
        <!-- Step 1: contacts and versions -->
        <template v-if="step === 'keys'">
          <p class="text-muted-foreground">This changes data in Marketing Cloud: Journey Builder takes the contacts out of this journey. Nothing is sent until you review the list and confirm.</p>
          <div class="flex gap-1" role="tablist" aria-label="Where the Contact Keys come from">
            <button v-for="[id, label] in [['paste', 'Paste'], ['file', 'File'], ['de', 'Data extension']]" :key="id" type="button" role="tab" :aria-selected="source === id"
              class="px-2.5 py-1 rounded-md border border-border" :class="source === id ? 'bg-primary text-primary-foreground' : 'hover:bg-accent'" :data-exit-source="id" @click="source = id">{{ label }}</button>
          </div>
          <label v-if="source === 'paste'" class="flex flex-col gap-0.5">Contact Keys (one per line, or separated by commas)
            <textarea v-model="pasteText" rows="6" class="w-full rounded-md border border-border bg-background px-2 py-1 font-mono text-xs" aria-label="Contact Keys" data-exit-keys />
          </label>
          <div v-else-if="source === 'file'" class="space-y-2">
            <Button type="button" variant="outline" size="sm" class="h-8 text-xs" @click="fileInput?.click()"><Upload class="h-3.5 w-3.5 mr-1" /> Choose a CSV or text file</Button>
            <input ref="fileInput" type="file" accept=".txt,.csv,.tsv,text/plain,text/csv" class="hidden" data-exit-file @change="onFile" />
            <div v-if="file" class="flex flex-wrap items-center gap-3">
              <span class="font-medium">{{ file.name }}</span>
              <label class="flex items-center gap-1.5"><input v-model="fileHeader" type="checkbox" /> First row is a header</label>
              <label class="flex items-center gap-1.5">Column
                <select v-model.number="fileColumn" class="h-7 rounded-md border border-border bg-background px-1" aria-label="Column with the Contact Keys">
                  <option v-for="(c, i) in fileColumns" :key="i" :value="i">{{ c }}</option>
                </select>
              </label>
            </div>
          </div>
          <div v-else class="space-y-2">
            <Button type="button" variant="outline" size="sm" class="h-8 text-xs" :disabled="!stack" @click="deOpen = true"><Database class="h-3.5 w-3.5 mr-1" /> {{ de ? 'Choose another data extension' : 'Choose a data extension' }}</Button>
            <div v-if="de" class="flex flex-wrap items-center gap-3">
              <span class="font-medium">{{ de.de.name }}</span>
              <label v-if="de.fields.length" class="flex items-center gap-1.5">Column
                <select v-model="de.column" class="h-7 rounded-md border border-border bg-background px-1" aria-label="Field with the Contact Keys">
                  <option v-for="f in de.fields" :key="f" :value="f">{{ f }}</option>
                </select>
              </label>
              <Button v-if="de.fields.length" type="button" size="sm" class="h-7 text-xs" :disabled="de.loading" @click="readDeColumn">Read the keys</Button>
              <span v-if="de.loading" class="text-muted-foreground"><Loader2 class="h-3 w-3 animate-spin inline" /> Reading</span>
            </div>
            <p v-if="de?.error" class="text-red-600">{{ de.error }}</p>
            <p v-if="de?.capped" class="text-amber-700 dark:text-amber-400">This data extension has {{ fmt(de.total) }} rows. Only the first {{ fmt(EXIT_MAX_KEYS) }} were read: the Toolkit removes at most {{ fmt(EXIT_MAX_KEYS) }} contacts at a time.</p>
          </div>
          <p class="text-muted-foreground" data-exit-count>
            {{ fmt(keys.length) }} contact{{ keys.length === 1 ? '' : 's' }}<template v-if="parsed.duplicates">, {{ fmt(parsed.duplicates) }} duplicate{{ parsed.duplicates === 1 ? '' : 's' }} left out</template><template v-if="parsed.blank"> ({{ fmt(parsed.blank) }} blank left out)</template>.
            Keys are trimmed and compared exactly (Contact Keys are case sensitive).
          </p>
          <p v-if="tooMany" class="text-red-600">At most {{ fmt(EXIT_MAX_KEYS) }} contacts at a time.</p>

          <fieldset class="space-y-1">
            <legend class="font-medium mb-1">Versions</legend>
            <label class="flex items-center gap-1.5"><input v-model="versionMode" type="radio" value="all" data-exit-all-versions /> All versions</label>
            <label class="flex items-center gap-1.5"><input v-model="versionMode" type="radio" value="chosen" /> Only these versions:</label>
            <div v-if="versionMode === 'chosen'" class="flex flex-wrap gap-3 pl-5">
              <label v-for="v in versionList" :key="v.version" class="flex items-center gap-1"><input v-model="chosen" type="checkbox" :value="Number(v.version)" /> Version {{ v.version }}<span v-if="v.status" class="text-muted-foreground"> ({{ v.status }})</span></label>
            </div>
          </fieldset>
          <p v-if="formError" class="text-red-600" role="alert">{{ formError }}</p>
        </template>

        <!-- Step 2: review -->
        <template v-else-if="step === 'review'">
          <h3 class="font-semibold text-sm">Review</h3>
          <dl class="grid grid-cols-[8rem_minmax(0,1fr)] gap-x-3 gap-y-1" data-exit-review>
            <dt class="text-muted-foreground">Journey</dt><dd class="wrap-break-word">{{ journey.name || journey.key }}</dd>
            <dt class="text-muted-foreground">Journey key</dt><dd class="font-mono break-all">{{ journey.key }}</dd>
            <dt class="text-muted-foreground">Versions</dt><dd>{{ versionText }}</dd>
            <dt class="text-muted-foreground">Contacts</dt><dd>{{ fmt(keys.length) }}, sent {{ EXIT_BATCH }} at a time</dd>
          </dl>
          <div>
            <p class="text-muted-foreground mb-1">{{ keys.length > 20 ? 'The first 20 Contact Keys' : 'Contact Keys' }}</p>
            <ul class="font-mono rounded-md border border-border bg-background p-2 max-h-48 overflow-y-auto" data-exit-preview>
              <li v-for="k in keys.slice(0, 20)" :key="k" class="break-all">{{ k }}</li>
            </ul>
            <p v-if="keys.length > 20" class="text-muted-foreground mt-1">and {{ fmt(keys.length - 20) }} more.</p>
          </div>
          <p class="text-muted-foreground">SFMC's documentation says exits are not immediate: Journey Builder queues the request and takes contacts out later, so the results show Queued at first. Check status again reads them later.</p>
        </template>

        <!-- Step 3: run and results -->
        <template v-else>
          <div class="flex flex-wrap items-center gap-2">
            <ProgressBar class="flex-1" :value="progress.done" :max="progress.total" label="Sent" show-count aria-label="Contacts sent" />
            <Button v-if="running" variant="outline" size="sm" class="h-7 text-xs" :disabled="stopAsked" data-exit-stop @click="stopAsked = true"><Square class="h-3 w-3 mr-1" /> {{ stopAsked ? 'Stopping after this batch' : 'Stop' }}</Button>
          </div>
          <p v-if="running" class="text-muted-foreground">Sending {{ EXIT_BATCH }} contacts at a time. Stop takes effect between batches; contacts already sent stay sent.</p>
          <p v-if="stopped" class="text-amber-700 dark:text-amber-400">Stopped: {{ fmt(counts.not_sent) }} contact{{ counts.not_sent === 1 ? ' was' : 's were' }} not sent.</p>
          <p v-if="runError" class="text-red-600" role="alert">{{ runError }}</p>
          <div v-if="rows.length" class="flex flex-wrap items-center gap-3" data-exit-counts>
            <span v-for="(n, s) in counts" v-show="n" :key="s" :class="statusClass(s)">{{ EXIT_STATUS_LABELS[s] }}: {{ fmt(n) }}</span>
            <div class="flex-1" />
            <Button v-if="!running && counts.queued + counts.unknown" variant="outline" size="sm" class="h-7 text-xs" :disabled="refreshing" @click="checkAgain">
              <Loader2 v-if="refreshing" class="h-3 w-3 mr-1 animate-spin" /><RefreshCw v-else class="h-3 w-3 mr-1" /> Check status again
            </Button>
            <Button v-if="!running" variant="outline" size="sm" class="h-7 text-xs" data-exit-csv @click="downloadCsv"><Download class="h-3 w-3 mr-1" /> CSV</Button>
          </div>
          <div v-if="rows.length" class="overflow-x-auto max-h-[45vh]">
            <table class="w-full text-left" data-exit-results>
              <thead class="sticky top-0 bg-card text-muted-foreground"><tr><th class="py-1 pr-3 font-medium">Contact Key</th><th class="py-1 pr-3 font-medium">Result</th><th class="py-1 pr-3 font-medium">Versions</th><th class="py-1 font-medium">SFMC's message</th></tr></thead>
              <tbody>
                <tr v-for="r in rows.slice(0, 2000)" :key="r.contactKey" class="border-t border-border align-top">
                  <td class="py-1 pr-3 font-mono break-all">{{ r.contactKey }}</td>
                  <td class="py-1 pr-3 whitespace-nowrap" :class="statusClass(r.status)">{{ EXIT_STATUS_LABELS[r.status] || r.status }}<span v-if="r.sfmcStatus && r.sfmcStatus !== EXIT_STATUS_LABELS[r.status]" class="text-muted-foreground"> ({{ r.sfmcStatus }})</span></td>
                  <td class="py-1 pr-3">{{ (r.versions || []).join(', ') }}</td>
                  <td class="py-1 break-words">{{ r.message }}</td>
                </tr>
              </tbody>
            </table>
            <p v-if="rows.length > 2000" class="text-muted-foreground mt-1">The first 2,000 rows are shown; the CSV has all {{ fmt(rows.length) }}.</p>
          </div>
        </template>
      </div>

      <div class="flex flex-wrap justify-end gap-2 px-4 py-2 border-t border-border">
        <template v-if="step === 'keys'">
          <Button variant="outline" size="sm" @click="emit('close')">Cancel</Button>
          <Button size="sm" :disabled="!keys.length || tooMany || !stack" data-exit-next @click="toReview">Review {{ fmt(keys.length) }} contact{{ keys.length === 1 ? '' : 's' }}</Button>
        </template>
        <template v-else-if="step === 'review'">
          <Button variant="outline" size="sm" @click="step = 'keys'">Back</Button>
          <Button variant="destructive" size="sm" data-exit-open-confirm @click="openConfirm"><UserMinus class="h-3.5 w-3.5 mr-1" /> Remove {{ fmt(keys.length) }} contact{{ keys.length === 1 ? '' : 's' }}</Button>
        </template>
        <Button v-else variant="outline" size="sm" :disabled="running" @click="emit('close')">Close</Button>
      </div>
    </div>

    <!-- Confirm: typed number of contacts or the journey name -->
    <div v-if="confirmOpen" class="fixed inset-0 z-[160] flex items-center justify-center bg-black/40 p-4" @mousedown.self="confirmOpen = false">
      <div role="alertdialog" aria-modal="true" aria-labelledby="journey-exit-confirm-title" class="w-full max-w-md rounded-2xl border border-border bg-card p-4 shadow-xl text-xs space-y-3" data-exit-confirm>
        <h3 id="journey-exit-confirm-title" class="flex items-center gap-2 font-semibold text-sm"><AlertTriangle class="h-4 w-4 text-red-600" /> Remove {{ fmt(keys.length) }} contact{{ keys.length === 1 ? '' : 's' }} from this journey?</h3>
        <p>This removes {{ fmt(keys.length) }} contact{{ keys.length === 1 ? '' : 's' }} from <b>{{ journey.name || journey.key }}</b> ({{ versionText.toLowerCase() }}) in Marketing Cloud. It cannot be undone: a removed contact does not get the rest of the journey and comes back only if it enters again.</p>
        <p class="text-muted-foreground">Exits are not immediate; Journey Builder processes them after the request.</p>
        <label class="flex flex-col gap-1">Type {{ keys.length }} (the number of contacts) or the journey name to confirm
          <input v-model="typed" type="text" class="h-8 rounded-md border border-border bg-background px-2" autocomplete="off" aria-label="Type the number of contacts to confirm" data-exit-typed @keydown.enter.prevent="start" />
        </label>
        <div class="flex justify-end gap-2">
          <Button variant="outline" size="sm" @click="confirmOpen = false">Cancel</Button>
          <Button variant="destructive" size="sm" :disabled="!canConfirm" data-exit-confirm-run @click="start">Remove from the journey</Button>
        </div>
      </div>
    </div>

    <DEPickerDialog v-if="deOpen" :stack="stack" title="Data extension with the Contact Keys" @pick="onDePick" @close="deOpen = false" />
  </div>
</template>
