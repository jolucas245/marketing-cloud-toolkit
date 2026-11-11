<script setup>
// Automation > Import results (user, 2026-11-10): every import run of the last 7, 30 or 90
// days with its import definition's name, status, start, duration and row counts (total,
// successful, duplicated, errors), so failed or partial imports stand out. SOAP
// ImportResultsSummary (StartDate filter) joined to ImportDefinition by CustomerKey.
// Read-only. Times are SFMC's own wall clock as the API returns them.
import { computed, ref } from 'vue'
import { Loader2, RefreshCw } from 'lucide-vue-next'
import Button from '@/components/ui/button/Button.vue'
import SfmcErrorNotice from '@/components/results/SfmcErrorNotice.vue'
import DataTable from '@/components/results/DataTable.vue'
import DownloadMenu from '@/components/results/DownloadMenu.vue'
import { useStack, whenStack } from '@/composables/useStack.js'
import { searchError } from '@/utils/sfmcErrors.js'
import { fetchImportResults, importResultFlags, formatDuration } from '@/utils/setupApi.js'
import { formatDateTime } from '@/utils/format.js'

const { stack } = useStack()
const list = ref(null)
const busy = ref(false)
const error = ref(null)
const days = ref(30)
const onlyProblems = ref(false)
async function load() {
  busy.value = true
  error.value = null
  try { list.value = await fetchImportResults(stack.value, { days: days.value }) } catch (e) { error.value = searchError(e, 'read the import results') } finally { busy.value = false }
}
whenStack(load)
function setDays(d) { if (days.value !== d) { days.value = d; load() } }

const rows = computed(() => (list.value || [])
  .map((r) => ({
    ...r, nameText: r.name || r.key, flags: importResultFlags(r).join('; '), startText: formatDateTime(r.start), endText: formatDateTime(r.end), duration: formatDuration(r.durationSec),
  }))
  .filter((r) => !onlyProblems.value || r.flags))
const summary = computed(() => {
  const all = list.value || []
  return {
    runs: all.length, imports: new Set(all.map((r) => r.key)).size, problems: all.filter((r) => importResultFlags(r).length).length,
    rows: all.reduce((n, r) => n + (r.successful || 0), 0),
  }
})
const columns = [
  { key: 'nameText', label: 'Import' }, { key: 'status', label: 'Status' }, { key: 'flags', label: 'Needs a look' },
  { key: 'startText', label: 'Start', sortValue: (r) => r.start }, { key: 'duration', label: 'Duration', sortValue: (r) => r.durationSec },
  { key: 'total', label: 'Total rows' }, { key: 'successful', label: 'Successful' }, { key: 'duplicated', label: 'Duplicated' }, { key: 'errors', label: 'Errors' },
  { key: 'importType', label: 'Import type' }, { key: 'endText', label: 'End', hidden: true, sortValue: (r) => r.end },
  { key: 'key', label: 'External key', hidden: true }, { key: 'destinationId', label: 'Destination ID', hidden: true }, { key: 'taskResultId', label: 'Task result ID', hidden: true },
]
const getDoc = () => ({ title: `Import results, last ${days.value} days`, blocks: [{ type: 'table', columns: columns.map((c) => c.label), rows: rows.value.map((r) => columns.map((c) => String(r[c.key] ?? ''))) }] })
</script>

<template>
  <div class="p-4 space-y-4 max-w-7xl">
    <div class="flex flex-wrap items-center gap-2">
      <h1 class="text-lg font-semibold">Import results</h1>
      <span class="text-xs text-muted-foreground">Every import run in this business unit, with SFMC's row counts. Read only.</span>
      <div class="flex-1" />
      <DownloadMenu :get-doc="getDoc" file-name="import-results" :disabled="!rows.length" />
      <Button variant="outline" size="sm" class="gap-1" :disabled="busy" @click="load"><Loader2 v-if="busy" class="h-3.5 w-3.5 animate-spin" /><RefreshCw v-else class="h-3.5 w-3.5" /> Refresh</Button>
    </div>
    <SfmcErrorNotice v-if="error" :error="error" :retrying="busy" @retry="load" />
    <section class="rounded-lg border border-border bg-card">
      <div class="flex flex-wrap items-center gap-3 px-3 py-2 border-b border-border text-xs">
        <div class="flex gap-0.5 border border-border rounded-md p-0.5" role="group" aria-label="Period">
          <button v-for="d in [7, 30, 90]" :key="d" class="px-2 py-0.5 rounded" :class="days === d ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-accent'" :aria-pressed="days === d" :disabled="busy" @click="setDays(d)">Last {{ d }} days</button>
        </div>
        <span v-if="list">{{ summary.runs }} runs of {{ summary.imports }} imports, {{ summary.rows.toLocaleString() }} rows imported, <span :class="summary.problems ? 'font-semibold text-amber-700 dark:text-amber-400' : ''">{{ summary.problems }} need a look</span></span>
        <label class="flex items-center gap-1.5"><input v-model="onlyProblems" type="checkbox" data-imports-problems /> Only those with problems</label>
        <span class="text-muted-foreground">Needs a look: rows with errors, or a status other than Completed. Times as SFMC reports them.</span>
      </div>
      <div v-if="busy && !list" class="flex items-center gap-2 p-4 text-sm text-muted-foreground"><Loader2 class="h-4 w-4 animate-spin" /> Reading the import results…</div>
      <DataTable v-else :columns="columns" :rows="rows" storage-key="import-results" empty-text="No import runs in this period.">
        <template #cell-flags="{ row }"><span class="text-amber-700 dark:text-amber-400">{{ row.flags }}</span></template>
        <template #cell-errors="{ row }"><span :class="row.errors > 0 ? 'font-semibold text-amber-700 dark:text-amber-400' : ''">{{ row.errors ?? '' }}</span></template>
      </DataTable>
    </section>
  </div>
</template>
