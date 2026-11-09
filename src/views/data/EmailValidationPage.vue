<script setup>
// Email validation (SFMC REST address/v1/validateEmail): one address, a list, the
// addresses of contacts found by Contact Key, or a data extension column. For a data
// extension the results go into three of its fields (matched by primary key) or into
// a new data extension that copies the source (feedback #1090). One SFMC call per address.
//
// A run is a background job (composables/useJobs.js, feedback #1092): it keeps going
// when the user moves to another Toolkit page in this tab, and this page shows the job
// again when it is opened (the latest one, or `?job=<id>` from a notice).
import ReportErrorButton from '@/components/results/ReportErrorButton.vue'
import { computed, ref, watch, onMounted } from 'vue'
import { useRoute } from 'vue-router'
import { Loader2, MailCheck, Upload, Download, Square, CheckCircle2, XCircle, HelpCircle } from 'lucide-vue-next'
import Button from '@/components/ui/button/Button.vue'
import Input from '@/components/ui/input/Input.vue'
import ProgressBar from '@/components/ui/ProgressBar.vue'
import DEFolderPicker from '@/components/data/DEFolderPicker.vue'
import DEPickPanel from '@/components/data/DEPickPanel.vue'
import ValidationSummary from '@/components/emailValidation/ValidationSummary.vue'
import { useStack } from '@/composables/useStack.js'
import { startJob, stopJob, findJob, latestJob } from '@/composables/useJobs.js'
import { isPolicyOn, POLICY_NOTE } from '@/utils/policy.js'
import { fetchDEFieldList, fetchDEDetail, deRowCountOf } from '@/utils/deApi.js'
import { loadRemainingRows } from '@/utils/deRows.js'
import { parseKeyList, searchContactKeys } from '@/utils/contactsApi.js'
import { saveTextFile, readFileText } from '@/utils/download.js'
import { csvQuote } from '@/utils/queryCsv.js'
import {
  VALIDATORS, DEFAULT_VALIDATORS, RESULT_COLUMNS, MAX_BULK, MAX_DE_ROWS, parseEmailList, validateMany, contactEmails,
  guessEmailField, guessResultFields, checkInPlace, copyFieldsWithResults, copyDESettings, rowForResult, createResultWriter,
  createCopyDE, resultsTable, deNameTaken, freeDEName, isNameClash, summarize, summaryLine, resultMatches,
} from '@/utils/emailValidation.js'

const KIND = 'email-validation'
const PATH = '/email-validation'
const { stack } = useStack()
const route = useRoute()
const contactsOff = computed(() => isPolicyOn('disableContacts'))
// One address is a list of one, so one tab takes both (user, 2026-11-06; was One address
// and List of addresses).
const TABS = [
  { id: 'addresses', label: 'Email addresses' },
  { id: 'de', label: 'Data extension' },
  { id: 'contacts', label: 'Contacts' },
]
const tab = ref('addresses')
const validators = ref([...DEFAULT_VALIDATORS])

// ── The job shown on this page ──
const job = ref(null)
const missingJob = ref(false)
const jd = computed(() => job.value?.data || {})
const busy = computed(() => job.value?.status === 'running')
const stopping = computed(() => !!job.value?.stopRequested)
const formError = ref('')
const error = computed(() => formError.value || job.value?.error || '')
const results = computed(() => (jd.value.results || []).filter(Boolean))
const progress = computed(() => job.value?.progress || { done: 0, total: 0, stage: '' })
const deStage = computed(() => (busy.value ? progress.value.stage : ''))
const readCount = computed(() => jd.value.readCount || 0)
const deDone = computed(() => jd.value.deDone || null)
const contactNotes = computed(() => jd.value.contactNotes || [])
const summary = computed(() => summarize(results.value))
const filter = ref('')
const SHOW_MAX = 500

function attach() {
  const id = route?.query?.job ? String(route.query.job) : ''
  const j = id ? findJob(id) : latestJob(KIND)
  missingJob.value = !!id && (!j || !j.data)
  if (!j || !j.data) return
  job.value = j
  filter.value = ''
  if (j.data.tab) tab.value = j.data.tab
  if (j.status !== 'running') j.seen = true
}
onMounted(attach)
watch(() => route?.query?.job, attach)
// Another tab of the form starts empty (the job stays in Activity history).
watch(tab, (t) => {
  if (busy.value || !job.value || job.value.data?.tab === t) return
  job.value = null
  formError.value = ''
  filter.value = ''
})

/** Starts a run as a job; `run(job, ctx)` gets the stack and checks picked now. */
function begin(title, data, run) {
  formError.value = ''
  filter.value = ''
  missingJob.value = false
  const ctx = { stack: stack.value, validators: [...validators.value] }
  job.value = startJob({ kind: KIND, title, path: PATH, data: { results: [], ...data }, run: (j) => run(j, ctx) })
  return job.value
}

/** Checks `emails` into job.data.results (input order; `extra[i]` merged in). */
async function checkAll(j, ctx, emails, { extra = [], onEach, shouldStop = () => false } = {}) {
  j.progress.stage = 'checking'
  j.progress.done = 0
  j.progress.total = emails.length
  j.data.results = new Array(emails.length)
  await validateMany(ctx.stack, emails, {
    validators: ctx.validators,
    shouldStop: () => j.stopRequested || shouldStop(),
    onResult: (r, i) => {
      j.data.results[i] = { ...r, ...(extra[i] || {}) }
      j.progress.done++
      onEach?.(r, i)
    },
  })
}

function preflight(n, what) {
  if (!n) { formError.value = what; return false }
  if (!validators.value.length) { formError.value = 'Pick at least one check.'; return false }
  if (!stack.value) { formError.value = 'Not connected to SFMC.'; return false }
  return true
}

// ── Email addresses (one or many) ──
const listText = ref('')
const parsedList = computed(() => parseEmailList(listText.value))
const fileInput = ref(null)
async function onFile(e) {
  const file = e.target.files?.[0]
  e.target.value = ''
  if (!file) return
  try { listText.value = await readFileText(file) } catch (err) { formError.value = `Could not read ${file.name}: ${err.message}` }
}
function runEmails() {
  const emails = parsedList.value.emails
  if (busy.value || !preflight(emails.length, 'Enter at least one email address.')) return
  const n = emails.length
  // The title is kept in Activity history: a count, never the addresses.
  begin(`Email validation: ${n.toLocaleString()} ${n === 1 ? 'address' : 'addresses'}`, { tab: 'addresses' }, async (j, ctx) => {
    await checkAll(j, ctx, emails)
    return summaryLine(summarize(j.data.results))
  })
}

// ── Contacts ──
const contactKeys = ref('')
const parsedKeys = computed(() => parseKeyList(contactKeys.value, 1000))
function runContacts() {
  const keys = parsedKeys.value.keys
  if (busy.value || !preflight(keys.length, 'Enter at least one Contact Key.')) return
  const n = keys.length
  begin(`Email validation: ${n.toLocaleString()} ${n === 1 ? 'Contact Key' : 'Contact Keys'}`, { tab: 'contacts', contactNotes: [] }, async (j, ctx) => {
    j.progress.stage = 'finding'
    j.progress.total = n
    let found
    try {
      found = await searchContactKeys(ctx.stack, keys, { onProgress: (done, total) => { j.progress.done = done; j.progress.total = total } })
    } catch (e) {
      throw new Error(`Contact search failed: ${e.message}`)
    }
    const emails = []
    const extra = []
    const notes = []
    for (const r of found) {
      if (r.error) { notes.push(`${r.key}: ${r.error}`); continue }
      if (!r.contacts.length) { notes.push(`${r.key}: no contact has this key`); continue }
      const list = r.contacts.flatMap(contactEmails)
      if (!list.length) { notes.push(`${r.key}: Contact Builder sent no email address for this contact`); continue }
      for (const e of list) { emails.push(e.email); extra.push({ contactKey: r.key, attribute: e.attribute }) }
    }
    j.data.contactNotes = notes
    if (!emails.length) return 'No email addresses found for these Contact Keys'
    await checkAll(j, ctx, emails, { extra })
    return summaryLine(summarize(j.data.results))
  })
}

// ── Data extension ──
const de = ref(null)
const deDetail = ref(null)
const fields = ref([])
const fieldsError = ref('')
const emailField = ref('')
const outMode = ref('inplace') // inplace | new
const mapping = ref({ isValidEmail: '', invalidReason: '', APIresponse: '' })
const newName = ref('')
const nameTaken = ref(null) // { name, suggestion } when a DE with the new name exists
let nameTimer = null
watch(newName, (n) => {
  clearTimeout(nameTimer)
  nameTaken.value = null
  if (!n.trim() || !stack.value) return
  nameTimer = setTimeout(async () => {
    try {
      if (await deNameTaken(stack.value, n)) nameTaken.value = { name: n.trim(), suggestion: await freeDEName(stack.value, n) }
    } catch { /* checked again when the run starts */ }
  }, 400)
})
const newFolderId = ref(null)
const newFolderPath = ref('')
// The DE's row count, to say up front when only the first MAX_DE_ROWS are checked (user, 2026-11-06).
const deRowCount = ref(null)
const overLimit = computed(() => deRowCount.value != null && deRowCount.value > MAX_DE_ROWS)

// The panel has read the DE's record already: its row count and settings come from there.
async function pickDE(d, detail) {
  de.value = d
  deDetail.value = detail || null
  fields.value = []
  fieldsError.value = ''
  deRowCount.value = null
  try { deRowCount.value = deRowCountOf(detail) } catch { /* no count in the record */ }
  // The new DE goes next to the picked one unless the user picks another folder
  // (user, 2026-11-06). DEFolderPicker opens the tree to it, or clears it for a shared folder.
  if (detail?.categoryId != null || detail?.categoryID != null) {
    newFolderId.value = detail.categoryId ?? detail.categoryID
    newFolderPath.value = ''
  }
  try {
    fields.value = await fetchDEFieldList(stack.value, d.id)
    emailField.value = guessEmailField(fields.value)
    mapping.value = guessResultFields(fields.value)
    // A free name, since SFMC refuses a second DE with the same name (409; an earlier run made this one).
    const base = `${String(d.name || 'DE').replace(/[^A-Za-z0-9_ -]/g, '').slice(0, 80)}_EmailValidation`
    newName.value = base
    freeDEName(stack.value, base).then((n) => { if (newName.value === base) newName.value = n }).catch(() => {})
  } catch (e) {
    fieldsError.value = `Could not read the fields: ${e.message}`
  }
}
const fieldsByName = computed(() => Object.fromEntries(fields.value.map((f) => [f.name, f])))
const keyFields = computed(() => fields.value.filter((f) => f.isPrimaryKey).map((f) => f.name))
const inPlaceProblem = computed(() => (outMode.value === 'inplace' && fields.value.length ? checkInPlace({ fields: fields.value, emailField: emailField.value, mapping: mapping.value }) : ''))
const resultFieldOptions = computed(() => fields.value.filter((f) => !f.isPrimaryKey && f.name !== emailField.value))
// What the new DE gets (feedback #1090): every source field plus the three results.
const copyPlan = computed(() => copyFieldsWithResults(fields.value))

function runDE() {
  if (busy.value) return
  formError.value = ''
  if (!de.value || !emailField.value) { formError.value = 'Pick the data extension and its email field.'; return }
  if (outMode.value === 'inplace' && inPlaceProblem.value) { formError.value = inPlaceProblem.value; return }
  if (outMode.value === 'new' && (!newName.value.trim() || newFolderId.value == null)) { formError.value = 'Name the new data extension and pick its folder.'; return }
  if (!preflight(1, '')) return
  // Everything the run needs is captured now, so changing the form later does not touch it.
  const source = { ...de.value }
  const key = source.customerKey || source.key
  const mode = outMode.value
  const email = emailField.value
  const srcFields = fields.value.slice()
  const keys = keyFields.value.slice()
  const map = { ...mapping.value }
  const byName = { ...fieldsByName.value }
  const name = newName.value.trim()
  const folderId = newFolderId.value
  const detail0 = deDetail.value
  const plan = copyPlan.value

  begin(`Email validation: ${source.name}`, { tab: 'de', readCount: 0, deDone: null }, async (j, ctx) => {
    let notes = []
    if (mode === 'new') {
      // Checked before reading any row, so a clash costs nothing.
      j.progress.stage = 'preparing'
      let taken = false
      try { taken = await deNameTaken(ctx.stack, name) } catch { /* the create call says so if it clashes */ }
      if (taken) {
        const suggestion = await freeDEName(ctx.stack, name).catch(() => `${name}_2`)
        nameTaken.value = { name, suggestion }
        throw new Error(`A data extension named "${name}" already exists. Pick another name (for example "${suggestion}").`)
      }
    }
    j.progress.stage = 'reading'
    j.progress.done = 0
    j.progress.total = 0
    const rows = []
    await loadRemainingRows({
      stack: ctx.stack, key, have: 0, columnNames: srcFields.map((f) => f.name), limit: MAX_DE_ROWS,
      onRows: (r) => { rows.push(...r); j.data.readCount = rows.length },
      shouldStop: () => j.stopRequested,
    })
    if (j.stopRequested) { j.data.deDone = { name: source.name, sent: 0, stopped: true }; return 'Stopped while reading the rows' }

    let target = { key, name: source.name, created: false }
    if (mode === 'new') {
      j.progress.stage = 'creating'
      const detail = detail0 || await fetchDEDetail(ctx.stack, source.id).catch(() => ({}))
      const { settings, notes: settingNotes } = copyDESettings(source, detail, { name, folderId: Number.parseInt(folderId, 10), fields: plan.fields })
      notes = settingNotes
      try {
        target = { ...(await createCopyDE(ctx.stack, settings, plan.fields)), created: true }
      } catch (e) {
        if (!isNameClash(e)) throw e
        const suggestion = await freeDEName(ctx.stack, name).catch(() => `${name}_2`)
        nameTaken.value = { name, suggestion }
        throw new Error(`A data extension named "${name}" already exists. Pick another name (for example "${suggestion}"); no rows were checked.`)
      }
    }
    const writer = createResultWriter(ctx.stack, { key: target.key, mode })
    const opts = { mode, keyFields: keys, mapping: map, fieldsByName: byName, copyFields: srcFields.map((f) => f.name), names: plan.names }
    let writeError = null
    await checkAll(j, ctx, rows.map((r) => r[email]), {
      shouldStop: () => !!writeError,
      onEach: (r, i) => { writer.add(rowForResult(r, rows[i], opts)).catch((e) => { writeError = e }) },
    })
    // A copy stopped early still gets every row, the ones not reached without results.
    if (mode === 'new' && j.stopRequested && !writeError) {
      for (let i = 0; i < rows.length; i++) if (!j.data.results[i]) writer.add(rowForResult(null, rows[i], opts)).catch((e) => { writeError = e })
    }
    j.progress.stage = 'writing'
    try { await writer.flush() } catch (e) { writeError = writeError || e }
    if (writeError) throw new Error(`Writing the results to ${target.name} failed: ${writeError.message}`)
    j.data.deDone = {
      name: target.name, key: target.key, sent: writer.sent, created: target.created, stopped: j.stopRequested,
      renamed: mode === 'new' ? plan.renamed : [], droppedDefaults: mode === 'new' ? plan.droppedDefaults : [], notes,
    }
    return `${summaryLine(summarize(j.data.results))}; ${writer.sent.toLocaleString()} rows sent to ${target.name}${target.created ? ' (new)' : ''}`
  })
}

function download() {
  const rows = filteredResults.value.map((r) => ({ ...(r.contactKey != null ? { 'Contact Key': r.contactKey, Attribute: r.attribute } : {}), ...resultsTable([r])[0] }))
  if (!rows.length) return
  const head = Object.keys(rows[0])
  const csv = [head, ...rows.map((r) => head.map((h) => r[h] ?? ''))].map((r) => r.map(csvQuote).join(',')).join('\n')
  saveTextFile(csv, `email-validation-${new Date().toISOString().slice(0, 10)}.csv`, 'text/csv', 'CSV file')
}
const filteredResults = computed(() => results.value.filter((r) => resultMatches(r, filter.value)))
const shown = computed(() => filteredResults.value.slice(0, SHOW_MAX))
const openRow = ref(null)
watch(filter, () => { openRow.value = null })
const resultTab = computed(() => jd.value.tab || tab.value)
</script>

<template>
  <div class="h-full overflow-y-auto p-4 space-y-4 text-sm">
    <div class="flex items-center gap-2">
      <h1 class="text-base font-semibold flex-1">Email validation</h1>
      <RouterLink to="/activity" class="text-xs text-primary hover:underline">Activity history</RouterLink>
    </div>
    <p class="text-xs text-muted-foreground max-w-3xl">
      Checks addresses with SFMC's own validation API (one call per address). SFMC names one failed check per address, even when several fail, and does not always follow the order shown.
      Nothing is sent to anyone.
    </p>
    <p v-if="missingJob" class="text-xs text-amber-700 dark:text-amber-300" role="status" data-missing-job>The results of that run are not in this tab any more (the tab was closed or reloaded, or newer runs replaced them). Activity history still lists it.</p>

    <section class="rounded-lg border border-border bg-card p-3 space-y-3">
      <div class="flex flex-wrap gap-1 border-b border-border pb-2" role="tablist">
        <button v-for="t in TABS" :key="t.id" role="tab" :aria-selected="tab === t.id" :disabled="busy"
          class="px-3 py-1 rounded-md text-xs" :class="tab === t.id ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-accent'"
          @click="tab = t.id">{{ t.label }}</button>
      </div>

      <fieldset class="flex flex-wrap gap-x-4 gap-y-1 text-xs" :disabled="busy">
        <legend class="text-muted-foreground mb-1">Checks</legend>
        <label v-for="v in VALIDATORS" :key="v.id" class="flex items-center gap-1.5" :title="v.detail">
          <input v-model="validators" type="checkbox" :value="v.id" /> {{ v.label }} <span class="text-muted-foreground">({{ v.detail }})</span>
        </label>
      </fieldset>

      <!-- Email addresses: one or many -->
      <form v-if="tab === 'addresses'" class="space-y-2 text-xs" data-addresses @submit.prevent="runEmails">
        <label class="flex flex-col gap-0.5">One address, or several: one per line or separated by commas (up to {{ MAX_BULK.toLocaleString() }})
          <textarea v-model="listText" rows="4" class="w-full max-w-2xl rounded-md border border-border bg-background px-2 py-1.5 font-mono resize-y" placeholder="ana@example.com&#10;sam@example.org" aria-label="Email addresses"
            @keydown.enter.meta.prevent="runEmails" @keydown.enter.ctrl.prevent="runEmails" />
        </label>
        <div class="flex flex-wrap items-center gap-2">
          <Button size="sm" class="h-8 text-xs" type="submit" :disabled="busy || !parsedList.emails.length || !stack" title="Ctrl+Enter or Cmd+Enter in the box also runs it">
            <Loader2 v-if="busy" class="h-3.5 w-3.5 mr-1 animate-spin" /><MailCheck v-else class="h-3.5 w-3.5 mr-1" /> Run email validation
          </Button>
          <span v-if="parsedList.emails.length" class="text-muted-foreground" data-address-count>{{ parsedList.emails.length.toLocaleString() }} {{ parsedList.emails.length === 1 ? 'address' : 'addresses' }}</span>
          <Button type="button" variant="outline" size="sm" class="h-8 text-xs" :disabled="busy" @click="fileInput?.click()"><Upload class="h-3.5 w-3.5 mr-1" /> Load a file</Button>
          <input ref="fileInput" type="file" accept=".txt,.csv,.tsv,text/plain,text/csv" class="hidden" @change="onFile" />
          <span v-if="parsedList.skipped" class="text-amber-700 dark:text-amber-300">Only the first {{ MAX_BULK.toLocaleString() }} are checked ({{ parsedList.skipped.toLocaleString() }} left out).</span>
        </div>
      </form>

      <!-- Contacts -->
      <template v-else-if="tab === 'contacts'">
        <p v-if="contactsOff" class="text-xs text-muted-foreground">{{ POLICY_NOTE }}</p>
        <form v-else class="space-y-2 text-xs" @submit.prevent="runContacts">
          <label class="flex flex-col gap-0.5">Contact Keys (exact), one per line. The Toolkit finds each contact in Contact Builder and checks every email address it has.
            <textarea v-model="contactKeys" rows="5" class="w-full max-w-2xl rounded-md border border-border bg-background px-2 py-1.5 font-mono resize-y" />
          </label>
          <Button size="sm" class="h-8 text-xs" type="submit" :disabled="busy || !parsedKeys.keys.length || !stack">
            <Loader2 v-if="busy" class="h-3.5 w-3.5 mr-1 animate-spin" /><MailCheck v-else class="h-3.5 w-3.5 mr-1" /> Find contacts and run email validation
          </Button>
          <ul v-if="contactNotes.length" class="text-amber-700 dark:text-amber-300 list-disc pl-5">
            <li v-for="n in contactNotes" :key="n">{{ n }}</li>
          </ul>
        </form>
      </template>

      <!-- Data extension -->
      <div v-else class="space-y-3 text-xs">
        <!-- Folders, search and the picked DE's details on the page (user, 2026-11-06; a dialog before, feedback #1060). -->
        <div class="space-y-1 max-w-5xl">
          <p class="text-muted-foreground">Pick the data extension to validate. Only sendable data extensions are listed.</p>
          <DEPickPanel :stack="stack" :disabled="busy" sendable-only not-sendable-message="Email validation works only on sendable data extensions: pick a sendable one." @pick="(p) => pickDE(p.de, p.detail)" />
          <p v-if="overLimit" class="text-amber-700 dark:text-amber-300" role="alert" data-over-limit>This data extension has {{ deRowCount.toLocaleString() }} rows. Email validation can't check more than {{ MAX_DE_ROWS.toLocaleString() }} in one run: only the first {{ MAX_DE_ROWS.toLocaleString() }} are checked.</p>
        </div>
        <p v-if="fieldsError" class="text-red-600">{{ fieldsError }}<ReportErrorButton /></p>
        <template v-if="de && fields.length">
          <label class="flex items-center gap-2">Email field
            <select v-model="emailField" class="h-8 rounded-md border border-border bg-background px-2" :disabled="busy">
              <option value="">Pick a field</option>
              <option v-for="f in fields" :key="f.name" :value="f.name">{{ f.name }}{{ f.isPrimaryKey ? ' (primary key)' : '' }}</option>
            </select>
          </label>
          <fieldset class="space-y-2" :disabled="busy">
            <legend class="text-muted-foreground mb-1">Where the results go</legend>
            <label class="flex items-center gap-1.5"><input v-model="outMode" type="radio" value="inplace" /> Fields in {{ de.name }} (each row updated by its primary key)</label>
            <div v-if="outMode === 'inplace'" class="ml-5 grid grid-cols-[9rem_minmax(0,16rem)] gap-x-2 gap-y-1 items-center">
              <template v-for="c in RESULT_COLUMNS" :key="c">
                <span class="font-mono">{{ c }}</span>
                <select v-model="mapping[c]" class="h-7 rounded-md border border-border bg-background px-2">
                  <option value="">Pick a field</option>
                  <option v-for="f in resultFieldOptions" :key="f.name" :value="f.name">{{ f.name }} ({{ f.type }}{{ f.length ? ` ${f.length}` : '' }})</option>
                </select>
              </template>
              <p class="col-span-2 text-muted-foreground">isValidEmail gets true or false (a Boolean or Text field), invalidReason the reason, APIresponse SFMC's answer as JSON. Longer text is cut to the field's length.</p>
              <p v-if="inPlaceProblem" class="col-span-2 text-amber-700 dark:text-amber-300">{{ inPlaceProblem }}</p>
            </div>
            <label class="flex items-center gap-1.5"><input v-model="outMode" type="radio" value="new" /> A copy of {{ de.name }} with the results added</label>
            <div v-if="outMode === 'new'" class="ml-5 space-y-1 max-w-xl" data-copy-plan>
              <Input v-model="newName" class="h-8 text-xs" aria-label="New data extension name" />
              <p v-if="nameTaken" class="text-amber-700 dark:text-amber-300">A data extension named "{{ nameTaken.name }}" already exists.
                <button type="button" class="text-primary hover:underline" @click="newName = nameTaken.suggestion">Use "{{ nameTaken.suggestion }}"</button>
              </p>
              <p class="text-muted-foreground">The new data extension gets all {{ fields.length }} fields of {{ de.name }} (names, types, lengths, primary keys, required and default values), its sendable setting and send relationship, and three more fields: {{ copyPlan.fields.slice(-3).map((f) => f.name).join(', ') }}. Every row is copied with its results, so the copy can be used for sending or filtering. Data retention is not copied.</p>
              <p v-for="r in copyPlan.renamed" :key="r.from" class="text-amber-700 dark:text-amber-300" data-renamed-field>{{ de.name }} already has a field named {{ r.from }}, so this result goes into {{ r.to }}.</p>
              <p v-if="copyPlan.droppedDefaults.length" class="text-amber-700 dark:text-amber-300">These default values are not copied (the Toolkit could not read them as valid values): {{ copyPlan.droppedDefaults.join(', ') }}.</p>
              <p class="text-muted-foreground">Folder (the same folder as {{ de.name }} unless you pick another):</p>
              <DEFolderPicker v-model="newFolderId" v-model:path="newFolderPath" :stack="stack" height="h-80" @error="(m) => (formError = m)" />
            </div>
          </fieldset>
          <div class="flex flex-wrap items-center gap-2">
            <Button size="sm" class="h-8 text-xs" :disabled="busy || !emailField || !!inPlaceProblem || !stack" @click="runDE">
              <Loader2 v-if="busy" class="h-3.5 w-3.5 mr-1 animate-spin" /><MailCheck v-else class="h-3.5 w-3.5 mr-1" /> Run email validation
            </Button>
            <span class="text-muted-foreground">Up to {{ MAX_DE_ROWS.toLocaleString() }} rows. SFMC checks one address per call, so 4 calls run at a time; results are written 500 rows at a time as they come in.</span>
          </div>
        </template>
      </div>

      <div v-if="deStage === 'preparing' || deStage === 'creating'" class="flex items-center gap-2 text-xs text-muted-foreground"><Loader2 class="h-3.5 w-3.5 animate-spin" /> {{ deStage === 'creating' ? 'Creating the new data extension…' : 'Checking the name…' }}</div>
      <div v-if="deStage === 'reading'" class="flex items-center gap-2 text-xs text-muted-foreground"><Loader2 class="h-3.5 w-3.5 animate-spin" /> Reading rows: {{ readCount.toLocaleString() }}</div>
      <div v-if="deStage === 'writing'" class="flex items-center gap-2 text-xs text-muted-foreground"><Loader2 class="h-3.5 w-3.5 animate-spin" /> Writing the last results…</div>
      <div v-if="deDone && resultTab === 'de'" class="rounded-md border border-border p-2 text-xs" data-de-done>
        <p v-if="deDone.stopped && !deDone.sent">Stopped before any result was written.</p>
        <p v-else class="text-green-700 dark:text-green-400 font-semibold">Sent {{ deDone.sent.toLocaleString() }} rows to {{ deDone.name }}{{ deDone.created ? ' (new)' : '' }}{{ deDone.stopped ? ' (stopped early' + (deDone.created ? ': rows not checked are copied without results)' : ')') : '' }}.</p>
        <p v-for="r in deDone.renamed || []" :key="r.from" class="text-amber-700 dark:text-amber-300">The {{ r.from }} result is in the field {{ r.to }} (the source already had a field named {{ r.from }}).</p>
        <p v-for="n in deDone.notes || []" :key="n" class="text-amber-700 dark:text-amber-300">{{ n }}</p>
        <p class="text-muted-foreground">SFMC writes them in the background, so they can take a minute to show. Rows SFMC refuses (for example a value too long for a field) are not reported here.</p>
      </div>

      <p v-if="busy" class="rounded-md border border-sky-300 bg-sky-50 px-3 py-2 text-xs text-sky-900 dark:border-sky-900 dark:bg-sky-950/40 dark:text-sky-200" role="status" data-stay-note>
        This check keeps running while you use other Toolkit pages in this tab; you get a notice when it ends, and Activity history shows its progress. Closing or reloading this tab stops it.
      </p>
      <div v-if="busy && progress.total" class="space-y-1 text-xs" data-job-progress>
        <div class="flex items-center gap-2">
          <span class="text-muted-foreground">{{ progress.stage === 'finding' ? 'Contacts found' : 'Checked' }} {{ progress.done.toLocaleString() }} of {{ progress.total.toLocaleString() }}</span>
          <Button variant="outline" size="sm" class="h-7 text-xs ml-auto" :disabled="stopping" @click="stopJob(job)"><Square class="h-3 w-3 mr-1" /> {{ stopping ? 'Stopping…' : 'Stop' }}</Button>
        </div>
        <ProgressBar :value="progress.done" :max="progress.total" />
      </div>
      <p v-if="error" class="text-red-600 text-xs" role="alert">{{ error }}<ReportErrorButton /></p>
    </section>

    <ValidationSummary v-if="results.length" :summary="summary" :title="job?.title || 'Email validation'" :filter="filter" :running="busy" @filter="(f) => (filter = f)" />

    <section v-if="results.length" class="rounded-lg border border-border bg-card p-3 space-y-2 text-xs">
      <div class="flex flex-wrap items-center gap-3">
        <h2 class="font-semibold text-sm">Results</h2>
        <span v-if="filter" class="text-muted-foreground" data-filtered-count>{{ filteredResults.length.toLocaleString() }} of {{ results.length.toLocaleString() }} <button type="button" class="text-primary hover:underline" @click="filter = ''">Show all</button></span>
        <Button variant="outline" size="sm" class="h-7 text-xs ml-auto" @click="download"><Download class="h-3.5 w-3.5 mr-1" /> CSV{{ filter ? ' (these rows)' : '' }}</Button>
      </div>
      <p v-if="filteredResults.length > SHOW_MAX" class="text-muted-foreground">Showing the first {{ SHOW_MAX }}; the CSV has all {{ filteredResults.length.toLocaleString() }}.</p>
      <table class="w-full" data-results-table>
        <thead><tr class="text-left text-muted-foreground border-b border-border">
          <th v-if="resultTab === 'contacts'" class="py-1 pr-3">Contact Key</th>
          <th class="py-1 pr-3">Email</th><th class="py-1 pr-3">isValidEmail</th><th class="py-1 pr-3">invalidReason</th><th class="py-1 pr-3">APIresponse</th>
        </tr></thead>
        <tbody>
          <template v-for="(r, i) in shown" :key="i">
            <tr class="border-b border-border/50 align-top" data-result-row>
              <td v-if="resultTab === 'contacts'" class="py-1 pr-3 font-mono">{{ r.contactKey }}<div class="text-[10px] text-muted-foreground">{{ r.attribute }}</div></td>
              <td class="py-1 pr-3 font-mono break-all">{{ r.email || '(empty)' }}</td>
              <td class="py-1 pr-3 whitespace-nowrap">
                <span v-if="r.valid === true" class="inline-flex items-center gap-1 text-green-700 dark:text-green-400"><CheckCircle2 class="h-3.5 w-3.5" /> true</span>
                <span v-else-if="r.valid === false" class="inline-flex items-center gap-1 text-red-600"><XCircle class="h-3.5 w-3.5" /> false</span>
                <span v-else class="inline-flex items-center gap-1 text-muted-foreground"><HelpCircle class="h-3.5 w-3.5" /> not checked</span>
              </td>
              <td class="py-1 pr-3">{{ r.reason }}</td>
              <td class="py-1 pr-3"><button v-if="r.response" class="text-primary hover:underline" @click="openRow = openRow === i ? null : i">{{ openRow === i ? 'Hide' : 'Show' }}</button></td>
            </tr>
            <tr v-if="openRow === i"><td :colspan="resultTab === 'contacts' ? 5 : 4"><pre class="max-h-60 overflow-auto rounded bg-muted p-2 text-[11px]">{{ r.response }}</pre></td></tr>
          </template>
        </tbody>
      </table>
    </section>
  </div>
</template>
