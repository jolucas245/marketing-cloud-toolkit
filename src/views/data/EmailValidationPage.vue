<script setup>
// Email validation (SFMC REST address/v1/validateEmail): one address, a list, the
// addresses of contacts found by Contact Key, or a data extension column. For a data
// extension the results go into three of its fields (matched by primary key) or into
// a new data extension. One SFMC call per address.
import ReportErrorButton from '@/components/results/ReportErrorButton.vue'
import { computed, ref, watch, onMounted, onBeforeUnmount } from 'vue'
import { onBeforeRouteLeave } from 'vue-router'
import { askConfirm } from '@/composables/useConfirm.js'
import { Loader2, MailCheck, Upload, Download, Square, CheckCircle2, XCircle, HelpCircle } from 'lucide-vue-next'
import Button from '@/components/ui/button/Button.vue'
import Input from '@/components/ui/input/Input.vue'
import ProgressBar from '@/components/ui/ProgressBar.vue'
import DEFolderPicker from '@/components/data/DEFolderPicker.vue'
import DEPickPanel from '@/components/data/DEPickPanel.vue'
import { useStack } from '@/composables/useStack.js'
import { isPolicyOn, POLICY_NOTE } from '@/utils/policy.js'
import { fetchDEFieldList, deRowCountOf } from '@/utils/deApi.js'
import { loadRemainingRows } from '@/utils/deRows.js'
import { parseKeyList, searchContactKeys } from '@/utils/contactsApi.js'
import { saveTextFile, readFileText } from '@/utils/download.js'
import { csvQuote } from '@/utils/queryCsv.js'
import {
  VALIDATORS, DEFAULT_VALIDATORS, RESULT_COLUMNS, MAX_BULK, MAX_DE_ROWS, parseEmailList, validateMany, contactEmails,
  guessEmailField, guessResultFields, checkInPlace, newDEFields, rowForResult, createResultWriter, createResultsDE, resultsTable,
  deNameTaken, freeDEName, isNameClash,
} from '@/utils/emailValidation.js'

const { stack } = useStack()
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

const busy = ref(false)
const stopping = ref(false)
const error = ref('')
const results = ref([]) // [{ email, valid, reason, response, contactKey?, attribute? }]
const progress = ref({ done: 0, total: 0 })
const SHOW_MAX = 500

function reset() {
  error.value = ''
  results.value = []
  progress.value = { done: 0, total: 0 }
  stopping.value = false
  deDone.value = null
}
watch(tab, () => { if (!busy.value) reset() })

const counts = computed(() => {
  const list = results.value.filter(Boolean)
  return { valid: list.filter((r) => r.valid === true).length, invalid: list.filter((r) => r.valid === false).length, notChecked: list.filter((r) => r.valid == null).length }
})

async function runEmails(emails, extra = []) {
  reset()
  if (!emails.length) { error.value = 'Enter at least one email address.'; return }
  if (!validators.value.length) { error.value = 'Pick at least one check.'; return }
  busy.value = true
  progress.value = { done: 0, total: emails.length }
  results.value = new Array(emails.length)
  try {
    await validateMany(stack.value, emails, {
      validators: validators.value,
      shouldStop: () => stopping.value,
      onResult: (r, i) => {
        results.value[i] = { ...r, ...(extra[i] || {}) }
        progress.value = { done: progress.value.done + 1, total: emails.length }
      },
    })
  } catch (e) {
    error.value = e.message
  } finally {
    results.value = results.value.filter(Boolean)
    busy.value = false
  }
}

// ── Email addresses (one or many) ──
const listText = ref('')
const parsedList = computed(() => parseEmailList(listText.value))
const fileInput = ref(null)
async function onFile(e) {
  const file = e.target.files?.[0]
  e.target.value = ''
  if (!file) return
  try { listText.value = await readFileText(file) } catch (err) { error.value = `Could not read ${file.name}: ${err.message}` }
}

// ── Contacts ──
const contactKeys = ref('')
const parsedKeys = computed(() => parseKeyList(contactKeys.value, 1000))
const contactNotes = ref([])
async function runContacts() {
  reset()
  contactNotes.value = []
  const keys = parsedKeys.value.keys
  if (!keys.length) { error.value = 'Enter at least one Contact Key.'; return }
  busy.value = true
  progress.value = { done: 0, total: keys.length }
  let found
  try {
    found = await searchContactKeys(stack.value, keys, { onProgress: (done, total) => { progress.value = { done, total } } })
  } catch (e) {
    error.value = `Contact search failed: ${e.message}`
    busy.value = false
    return
  }
  busy.value = false
  const emails = []
  const extra = []
  for (const r of found) {
    if (r.error) { contactNotes.value.push(`${r.key}: ${r.error}`); continue }
    if (!r.contacts.length) { contactNotes.value.push(`${r.key}: no contact has this key`); continue }
    const list = r.contacts.flatMap(contactEmails)
    if (!list.length) { contactNotes.value.push(`${r.key}: Contact Builder sent no email address for this contact`); continue }
    for (const e of list) { emails.push(e.email); extra.push({ contactKey: r.key, attribute: e.attribute }) }
  }
  const notes = contactNotes.value
  if (emails.length) await runEmails(emails, extra)
  contactNotes.value = notes
}

// ── Data extension ──
const de = ref(null)
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
const deStage = ref('') // reading | checking | writing
const readCount = ref(0)
const deDone = ref(null) // { name, key, sent, created, stopped }
// The DE's row count, to say up front when only the first MAX_DE_ROWS are checked (user, 2026-11-06).
const deRowCount = ref(null)
const overLimit = computed(() => deRowCount.value != null && deRowCount.value > MAX_DE_ROWS)

// The panel has read the DE's record already: its row count comes from there.
async function pickDE(d, detail) {
  de.value = d
  fields.value = []
  fieldsError.value = ''
  deRowCount.value = null
  try { deRowCount.value = deRowCountOf(detail) } catch { /* no count in the record */ }
  // The new DE goes next to the picked one unless the user picks another folder
  // (user, 2026-11-06). DEFolderPicker opens the tree to it, or clears it for a shared folder.
  if (detail?.categoryId != null) {
    newFolderId.value = detail.categoryId
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

// A check runs in this page: leaving it, or closing the tab, stops it (user, 2026-11-06).
onBeforeRouteLeave(async () => {
  if (!busy.value) return true
  const leave = await askConfirm({ title: 'Stop the email check?', message: 'The check runs on this screen. Leaving it stops the check; results already written stay.', confirmLabel: 'Leave and stop', cancelLabel: 'Stay', danger: true })
  if (leave) stopping.value = true
  return leave
})
const onUnload = (e) => { if (busy.value) { e.preventDefault(); e.returnValue = '' } }
onMounted(() => window.addEventListener('beforeunload', onUnload))
onBeforeUnmount(() => window.removeEventListener('beforeunload', onUnload))

async function runDE() {
  reset()
  if (!de.value || !emailField.value) { error.value = 'Pick the data extension and its email field.'; return }
  if (outMode.value === 'inplace' && inPlaceProblem.value) { error.value = inPlaceProblem.value; return }
  if (outMode.value === 'new' && (!newName.value.trim() || newFolderId.value == null)) { error.value = 'Name the new data extension and pick its folder.'; return }
  if (!validators.value.length) { error.value = 'Pick at least one check.'; return }
  busy.value = true
  if (outMode.value === 'new') {
    // Checked before reading any row, so a clash costs nothing.
    try {
      if (await deNameTaken(stack.value, newName.value)) {
        nameTaken.value = { name: newName.value.trim(), suggestion: await freeDEName(stack.value, newName.value) }
        error.value = `A data extension named "${nameTaken.value.name}" already exists. Pick another name (for example "${nameTaken.value.suggestion}").`
        busy.value = false
        return
      }
    } catch { /* the create call says so if it clashes */ }
  }
  const key = de.value.customerKey || de.value.key
  try {
    deStage.value = 'reading'
    readCount.value = 0
    const rows = []
    await loadRemainingRows({
      stack: stack.value, key, have: 0, columnNames: fields.value.map((f) => f.name), limit: MAX_DE_ROWS,
      onRows: (r) => { rows.push(...r); readCount.value = rows.length },
      shouldStop: () => stopping.value,
    })
    if (stopping.value) { deDone.value = { name: de.value.name, sent: 0, stopped: true }; return }

    let target = { key, name: de.value.name, created: false }
    if (outMode.value === 'new') {
      let made
      try {
        made = await createResultsDE(stack.value, { name: newName.value.trim(), categoryID: Number.parseInt(newFolderId.value, 10), fields: newDEFields(fields.value, emailField.value) })
      } catch (e) {
        if (!isNameClash(e)) throw e
        const suggestion = await freeDEName(stack.value, newName.value).catch(() => `${newName.value.trim()}_2`)
        nameTaken.value = { name: newName.value.trim(), suggestion }
        throw new Error(`A data extension named "${newName.value.trim()}" already exists. Pick another name (for example "${suggestion}"); no rows were checked.`)
      }
      target = { key: made.key, name: made.name, created: true }
    }
    const writer = createResultWriter(stack.value, { key: target.key, mode: outMode.value })
    const opts = {
      mode: outMode.value,
      keyFields: outMode.value === 'inplace' ? keyFields.value : keyFields.value.filter((k) => k !== emailField.value),
      emailField: emailField.value,
      mapping: mapping.value,
      fieldsByName: fieldsByName.value,
    }
    deStage.value = 'checking'
    progress.value = { done: 0, total: rows.length }
    results.value = new Array(rows.length)
    let writeError = null
    await validateMany(stack.value, rows.map((r) => r[emailField.value]), {
      validators: validators.value,
      shouldStop: () => stopping.value || !!writeError,
      onResult: (r, i) => {
        results.value[i] = r
        progress.value = { done: progress.value.done + 1, total: rows.length }
        writer.add(rowForResult(r, rows[i], opts)).catch((e) => { writeError = e })
      },
    })
    deStage.value = 'writing'
    try { await writer.flush() } catch (e) { writeError = writeError || e }
    if (writeError) throw new Error(`Writing the results to ${target.name} failed: ${writeError.message}`)
    deDone.value = { name: target.name, key: target.key, sent: writer.sent, created: target.created, stopped: stopping.value }
  } catch (e) {
    error.value = e.message
  } finally {
    results.value = results.value.filter(Boolean)
    deStage.value = ''
    busy.value = false
  }
}

function download() {
  const rows = results.value.filter(Boolean).map((r) => ({ ...(r.contactKey != null ? { 'Contact Key': r.contactKey, Attribute: r.attribute } : {}), ...resultsTable([r])[0] }))
  if (!rows.length) return
  const head = Object.keys(rows[0])
  const csv = [head, ...rows.map((r) => head.map((h) => r[h] ?? ''))].map((r) => r.map(csvQuote).join(',')).join('\n')
  saveTextFile(csv, `email-validation-${new Date().toISOString().slice(0, 10)}.csv`, 'text/csv', 'CSV file')
}
const shown = computed(() => results.value.filter(Boolean).slice(0, SHOW_MAX))
const openRow = ref(null)
</script>

<template>
  <div class="h-full overflow-y-auto p-4 space-y-4 text-sm">
    <div class="flex items-center gap-2">
      <h1 class="text-base font-semibold flex-1">Email validation</h1>
    </div>
    <p class="text-xs text-muted-foreground max-w-3xl">
      Checks addresses with SFMC's own validation API (one call per address). SFMC names one failed check per address, even when several fail, and does not always follow the order shown.
      Nothing is sent to anyone.
    </p>

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
      <form v-if="tab === 'addresses'" class="space-y-2 text-xs" data-addresses @submit.prevent="runEmails(parsedList.emails)">
        <label class="flex flex-col gap-0.5">One address, or several: one per line or separated by commas (up to {{ MAX_BULK.toLocaleString() }})
          <textarea v-model="listText" rows="4" class="w-full max-w-2xl rounded-md border border-border bg-background px-2 py-1.5 font-mono resize-y" placeholder="ana@example.com&#10;sam@example.org" aria-label="Email addresses"
            @keydown.enter.meta.prevent="runEmails(parsedList.emails)" @keydown.enter.ctrl.prevent="runEmails(parsedList.emails)" />
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
            <label class="flex items-center gap-1.5"><input v-model="outMode" type="radio" value="new" /> A new data extension</label>
            <div v-if="outMode === 'new'" class="ml-5 space-y-1 max-w-xl">
              <Input v-model="newName" class="h-8 text-xs" aria-label="New data extension name" />
              <p v-if="nameTaken" class="text-amber-700 dark:text-amber-300">A data extension named "{{ nameTaken.name }}" already exists.
                <button type="button" class="text-primary hover:underline" @click="newName = nameTaken.suggestion">Use "{{ nameTaken.suggestion }}"</button>
              </p>
              <p class="text-muted-foreground">Fields: {{ newDEFields(fields, emailField).map((f) => f.name).join(', ') }}. Rows are added, not matched.</p>
              <DEFolderPicker v-model="newFolderId" v-model:path="newFolderPath" :stack="stack" height="h-80" @error="(m) => (error = m)" />
            </div>
          </fieldset>
          <div class="flex flex-wrap items-center gap-2">
            <Button size="sm" class="h-8 text-xs" :disabled="busy || !emailField || !!inPlaceProblem || !stack" @click="runDE">
              <Loader2 v-if="busy" class="h-3.5 w-3.5 mr-1 animate-spin" /><MailCheck v-else class="h-3.5 w-3.5 mr-1" /> Run email validation
            </Button>
            <span class="text-muted-foreground">Up to {{ MAX_DE_ROWS.toLocaleString() }} rows. SFMC checks one address per call, so 4 calls run at a time; results are written 500 rows at a time as they come in.</span>
          </div>
        </template>
        <div v-if="deStage === 'reading'" class="flex items-center gap-2 text-muted-foreground"><Loader2 class="h-3.5 w-3.5 animate-spin" /> Reading rows: {{ readCount.toLocaleString() }}</div>
        <div v-if="deStage === 'writing'" class="flex items-center gap-2 text-muted-foreground"><Loader2 class="h-3.5 w-3.5 animate-spin" /> Writing the last results…</div>
        <div v-if="deDone" class="rounded-md border border-border p-2">
          <p v-if="deDone.stopped && !deDone.sent">Stopped before any result was written.</p>
          <p v-else class="text-green-700 dark:text-green-400 font-semibold">Sent {{ deDone.sent.toLocaleString() }} results to {{ deDone.name }}{{ deDone.created ? ' (new)' : '' }}{{ deDone.stopped ? ' (stopped early)' : '' }}.</p>
          <p class="text-muted-foreground">SFMC writes them in the background, so they can take a minute to show. Rows SFMC refuses (for example a value too long for a field) are not reported here.</p>
        </div>
      </div>

      <p v-if="busy" class="rounded-md border border-sky-300 bg-sky-50 px-3 py-2 text-xs text-sky-900 dark:border-sky-900 dark:bg-sky-950/40 dark:text-sky-200" role="status" data-stay-note>Please stay on this screen until the check is done. It runs here: leaving the page or closing the tab stops it.</p>
      <div v-if="busy && progress.total" class="space-y-1 text-xs">
        <div class="flex items-center gap-2">
          <span class="text-muted-foreground">{{ deStage === 'checking' || tab !== 'de' ? 'Checked' : 'Done' }} {{ progress.done.toLocaleString() }} of {{ progress.total.toLocaleString() }}</span>
          <Button variant="outline" size="sm" class="h-7 text-xs ml-auto" :disabled="stopping" @click="stopping = true"><Square class="h-3 w-3 mr-1" /> Stop</Button>
        </div>
        <ProgressBar :value="progress.done" :max="progress.total" />
      </div>
      <p v-if="error" class="text-red-600 text-xs" role="alert">{{ error }}<ReportErrorButton /></p>
    </section>

    <section v-if="shown.length" class="rounded-lg border border-border bg-card p-3 space-y-2 text-xs">
      <div class="flex flex-wrap items-center gap-3">
        <h2 class="font-semibold text-sm">Results</h2>
        <span class="text-green-700 dark:text-green-400">{{ counts.valid.toLocaleString() }} valid</span>
        <span class="text-red-600">{{ counts.invalid.toLocaleString() }} not valid</span>
        <span v-if="counts.notChecked" class="text-muted-foreground">{{ counts.notChecked.toLocaleString() }} not checked</span>
        <Button variant="outline" size="sm" class="h-7 text-xs ml-auto" @click="download"><Download class="h-3.5 w-3.5 mr-1" /> CSV</Button>
      </div>
      <p v-if="results.length > SHOW_MAX" class="text-muted-foreground">Showing the first {{ SHOW_MAX }}; the CSV has all {{ results.length.toLocaleString() }}.</p>
      <table class="w-full">
        <thead><tr class="text-left text-muted-foreground border-b border-border">
          <th v-if="tab === 'contacts'" class="py-1 pr-3">Contact Key</th>
          <th class="py-1 pr-3">Email</th><th class="py-1 pr-3">isValidEmail</th><th class="py-1 pr-3">invalidReason</th><th class="py-1 pr-3">APIresponse</th>
        </tr></thead>
        <tbody>
          <template v-for="(r, i) in shown" :key="i">
            <tr class="border-b border-border/50 align-top">
              <td v-if="tab === 'contacts'" class="py-1 pr-3 font-mono">{{ r.contactKey }}<div class="text-[10px] text-muted-foreground">{{ r.attribute }}</div></td>
              <td class="py-1 pr-3 font-mono break-all">{{ r.email || '(empty)' }}</td>
              <td class="py-1 pr-3 whitespace-nowrap">
                <span v-if="r.valid === true" class="inline-flex items-center gap-1 text-green-700 dark:text-green-400"><CheckCircle2 class="h-3.5 w-3.5" /> true</span>
                <span v-else-if="r.valid === false" class="inline-flex items-center gap-1 text-red-600"><XCircle class="h-3.5 w-3.5" /> false</span>
                <span v-else class="inline-flex items-center gap-1 text-muted-foreground"><HelpCircle class="h-3.5 w-3.5" /> not checked</span>
              </td>
              <td class="py-1 pr-3">{{ r.reason }}</td>
              <td class="py-1 pr-3"><button v-if="r.response" class="text-primary hover:underline" @click="openRow = openRow === i ? null : i">{{ openRow === i ? 'Hide' : 'Show' }}</button></td>
            </tr>
            <tr v-if="openRow === i"><td :colspan="tab === 'contacts' ? 5 : 4"><pre class="max-h-60 overflow-auto rounded bg-muted p-2 text-[11px]">{{ r.response }}</pre></td></tr>
          </template>
        </tbody>
      </table>
    </section>
  </div>
</template>
