<script setup>
// Content > Changes (feedback #1087): everything created or modified in a period, by
// a given person, across Content Builder assets, automations and journeys. Loads only
// on Find changes. Read only: nothing in SFMC changes. Logic in utils/changes.js.
import { computed, reactive, ref } from 'vue'
import { Search, Loader2, FileText, ArrowRight } from 'lucide-vue-next'
import Button from '@/components/ui/button/Button.vue'
import Input from '@/components/ui/input/Input.vue'
import ProgressBar from '@/components/ui/ProgressBar.vue'
import DataTable from '@/components/results/DataTable.vue'
import DownloadMenu from '@/components/results/DownloadMenu.vue'
import SfmcErrorNotice from '@/components/results/SfmcErrorNotice.vue'
import { useStack } from '@/composables/useStack.js'
import { withReconnect, searchError } from '@/utils/sfmcErrors.js'
import { formatDateTime, plural } from '@/utils/format.js'
import { saveTextFile } from '@/utils/download.js'
import {
  PERIODS, MAX_ASSET_PAGES, CHANGE_PAGE_SIZE, MAX_LIST_ITEMS, cutoffDate, loadAssetChanges, loadAutomationChanges, loadJourneyChanges,
  matchesPerson, distinctPeople, personLabel, sortChanges, changesCsv,
} from '@/utils/changes.js'

const { stack } = useStack()

// ── Controls ─────────────────────────────────────────────
const period = ref('7') // '1' | '7' | '30' | '90' | 'custom'
const fromDate = ref('')
const what = ref('modified') // modified | created | both
const personText = ref('')
const personPick = ref('')
const sources = reactive({ contentBuilder: true, automations: true, journeys: true })
const SOURCES = [
  { id: 'contentBuilder', label: 'Content Builder', what: 'assets', load: loadAssetChanges },
  { id: 'automations', label: 'Automations', what: 'automations', load: loadAutomationChanges },
  { id: 'journeys', label: 'Journeys', what: 'journeys', load: loadJourneyChanges },
]

// ── Loading ──────────────────────────────────────────────
// Per source: { status: 'loading' | 'done' | 'error', rows, loaded, total, capped, error }
const results = reactive({})
const searched = ref(null) // { cutoff, what } of the last Find changes
const formError = ref('')
const loading = computed(() => Object.values(results).some((r) => r.status === 'loading'))

async function find() {
  formError.value = ''
  if (!stack.value) { formError.value = 'Not connected to Marketing Cloud. Log in to SFMC in this browser.'; return }
  const cutoff = cutoffDate(period.value === 'custom' ? { from: fromDate.value } : { days: Number(period.value) })
  if (!cutoff) { formError.value = 'Pick a From date.'; return }
  const picked = SOURCES.filter((s) => sources[s.id])
  if (!picked.length) { formError.value = 'Tick at least one source.'; return }
  const w = what.value
  searched.value = { cutoff, what: w }
  personPick.value = ''
  for (const k of Object.keys(results)) delete results[k]
  // Each source loads on its own: one failing shows its error, the rest still show.
  await Promise.all(picked.map(async (s) => {
    results[s.id] = { status: 'loading', rows: [], loaded: 0, total: null, capped: false, error: null }
    const r = results[s.id] // the reactive copy, so progress shows
    try {
      const out = await withReconnect(stack.value, () => s.load(stack.value, {
        since: cutoff, what: w, onProgress: (loaded, total) => { r.loaded = loaded; r.total = total ?? null },
      }))
      Object.assign(r, { status: 'done', rows: out.rows, capped: out.capped })
    } catch (e) {
      Object.assign(r, { status: 'error', error: searchError(e, `read ${s.what}`) })
    }
  }))
}

// ── Table ────────────────────────────────────────────────
const allRows = computed(() => Object.values(results).flatMap((r) => r.rows || []))
const people = computed(() => distinctPeople(allRows.value, searched.value?.what))
const shown = computed(() => {
  const w = searched.value?.what || 'modified'
  return sortChanges(allRows.value.filter((r) => matchesPerson(r, { text: personText.value, key: personPick.value }, w)), w)
})
const hasJourneys = computed(() => (results.journeys?.rows || []).length > 0)

const columns = [
  { key: 'type', label: 'Type' },
  { key: 'name', label: 'Name', hideable: false },
  { key: 'folder', label: 'Folder' },
  { key: 'createdDate', label: 'Created', class: 'whitespace-nowrap', type: 'date' },
  { key: 'createdBy', label: 'Created by', sortValue: (r) => personLabel(r.createdBy) || null, filterValue: (r) => [personLabel(r.createdBy), r.createdBy?.email].join(' ') },
  { key: 'modifiedDate', label: 'Modified', class: 'whitespace-nowrap', type: 'date' },
  { key: 'modifiedBy', label: 'Modified by', sortValue: (r) => personLabel(r.modifiedBy) || null, filterValue: (r) => [personLabel(r.modifiedBy), r.modifiedBy?.email].join(' ') },
  { key: 'open', label: '', sortable: false, filterable: false, hideable: false },
]

const sinceText = computed(() => (searched.value ? formatDateTime(searched.value.cutoff.toISOString()) : ''))
const WHAT_WORDS = { modified: 'modified', created: 'created', both: 'created or modified' }
const fileBase = () => `changes-${new Date().toISOString().slice(0, 10)}`
const downloadCsv = () => saveTextFile(changesCsv(shown.value), `${fileBase()}.csv`, 'text/csv', 'CSV file')
function getDoc() {
  const p = (x) => personLabel(x)
  return {
    title: `Changes since ${sinceText.value}`,
    blocks: [{ type: 'table', columns: ['Type', 'Name', 'Folder', 'Created', 'Created by', 'Modified', 'Modified by'],
      rows: shown.value.map((r) => [r.type, r.name, r.folder, formatDateTime(r.createdDate), p(r.createdBy), formatDateTime(r.modifiedDate), p(r.modifiedBy)]) }],
  }
}
</script>

<template>
  <div class="h-full flex flex-col text-sm" data-changes-page>
    <div class="px-5 py-3 border-b border-border bg-card space-y-2">
      <div class="flex flex-wrap items-center gap-2">
        <h1 class="text-lg font-semibold mr-2">Changes</h1>
        <span class="text-xs text-muted-foreground">What was created or modified, and by whom. Read only.</span>
      </div>
      <form class="flex flex-wrap items-end gap-3" @submit.prevent="find">
        <label class="text-xs">Period
          <select v-model="period" class="block h-8 mt-1 rounded-md border border-border bg-background px-2 text-xs" aria-label="Period" data-changes-period>
            <option v-for="d in PERIODS" :key="d" :value="String(d)">{{ d === 1 ? 'Last day' : `Last ${d} days` }}</option>
            <option value="custom">From a date</option>
          </select>
        </label>
        <label v-if="period === 'custom'" class="text-xs">From
          <input v-model="fromDate" type="date" class="block h-8 mt-1 rounded-md border border-border bg-background px-2 text-xs" aria-label="From date" data-changes-from />
        </label>
        <label class="text-xs">What changed
          <select v-model="what" class="block h-8 mt-1 rounded-md border border-border bg-background px-2 text-xs" aria-label="What changed" data-changes-what>
            <option value="modified">Modified</option>
            <option value="created">Created</option>
            <option value="both">Created or modified</option>
          </select>
        </label>
        <fieldset class="text-xs">
          <legend class="mb-1">Look in</legend>
          <div class="flex items-center gap-3 h-8">
            <label v-for="s in SOURCES" :key="s.id" class="flex items-center gap-1.5"><input v-model="sources[s.id]" type="checkbox" :data-changes-source="s.id" /> {{ s.label }}</label>
          </div>
        </fieldset>
        <Button type="submit" :disabled="loading" data-changes-find><Loader2 v-if="loading" class="h-4 w-4 animate-spin" /><Search v-else class="h-4 w-4" /> Find changes</Button>
      </form>
      <p v-if="formError" class="text-xs text-red-700 dark:text-red-300" role="alert" data-changes-form-error>{{ formError }}</p>
    </div>

    <div class="flex-1 min-h-0 overflow-y-auto p-4 space-y-3">
      <div v-if="!searched" class="max-w-md mx-auto mt-12 text-center text-muted-foreground">
        Pick a period and what changed, then Find changes. Content Builder covers every asset type: emails, templates, content blocks, images and CloudPages.
      </div>
      <template v-else>
        <!-- One line per source: progress, count, cap or error. -->
        <div v-for="s in SOURCES.filter((x) => results[x.id])" :key="s.id" :data-changes-status="s.id">
          <ProgressBar v-if="results[s.id].status === 'loading'" :value="results[s.id].loaded" :max="results[s.id].total || 0" :label="`Reading ${s.what}`" show-count />
          <SfmcErrorNotice v-else-if="results[s.id].status === 'error'" :error="results[s.id].error" :retrying="loading" @retry="find" />
          <p v-else class="text-xs text-muted-foreground">
            {{ s.label }}: {{ plural(results[s.id].rows.length, 'change') }}.
            <template v-if="results[s.id].capped && s.id === 'contentBuilder'"> Stopped at {{ (MAX_ASSET_PAGES * CHANGE_PAGE_SIZE).toLocaleString() }} assets, newest first: pick a shorter period to see older ones.</template>
            <template v-else-if="results[s.id].capped"> Read the first {{ MAX_LIST_ITEMS.toLocaleString() }} only.</template>
          </p>
        </div>

        <div class="flex flex-wrap items-end gap-3">
          <label class="text-xs">Person
            <Input v-model="personText" class="mt-1 h-8 w-64 text-xs" placeholder="Name or email contains" aria-label="Person name or email" data-changes-person />
          </label>
          <label class="text-xs">Or pick
            <select v-model="personPick" class="block h-8 mt-1 rounded-md border border-border bg-background px-2 text-xs max-w-72" aria-label="Pick a person" data-changes-people>
              <option value="">Everyone ({{ people.length }})</option>
              <option v-for="p in people" :key="p.key" :value="p.key">{{ p.label }}</option>
            </select>
          </label>
          <div class="flex-1" />
          <template v-if="shown.length">
            <Button variant="outline" size="sm" class="h-8 text-xs" data-changes-csv @click="downloadCsv"><FileText class="h-3.5 w-3.5" /> CSV</Button>
            <DownloadMenu :get-doc="getDoc" :file-name="fileBase()" />
          </template>
        </div>
        <p class="text-xs text-muted-foreground" data-changes-summary>
          {{ plural(shown.length, 'item') }} {{ WHAT_WORDS[searched.what] }} since {{ sinceText }}<template v-if="shown.length !== allRows.length"> ({{ allRows.length }} before the person filter)</template>.
          <template v-if="hasJourneys"> Journeys only give user IDs for who created or modified them, so the person filter matches journeys by ID, not by name.</template>
        </p>

        <DataTable :columns="columns" :rows="shown" row-key="key" storage-key="content-changes" :empty-text="loading ? 'Reading changes.' : 'No changes found.'">
          <template #cell-name="{ row }"><span class="font-medium">{{ row.name }}</span></template>
          <template #cell-createdDate="{ row }">{{ formatDateTime(row.createdDate) }}</template>
          <template #cell-modifiedDate="{ row }">{{ formatDateTime(row.modifiedDate) }}</template>
          <template #cell-createdBy="{ row }"><span :title="row.createdBy?.email || ''">{{ personLabel(row.createdBy) }}</span></template>
          <template #cell-modifiedBy="{ row }"><span :title="row.modifiedBy?.email || ''">{{ personLabel(row.modifiedBy) }}</span></template>
          <template #cell-open="{ row }">
            <RouterLink v-if="row.open" :to="row.open" class="inline-flex items-center gap-1 text-primary hover:underline whitespace-nowrap" data-changes-open>Open <ArrowRight class="h-3 w-3" /></RouterLink>
          </template>
        </DataTable>
      </template>
    </div>
  </div>
</template>
