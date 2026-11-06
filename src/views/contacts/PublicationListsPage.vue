<script setup>
// Contacts > Publication Lists (feedback #1080, user 2026-11-06): subscribers per list by
// status (Active, Unsubscribed, Held, Bounced), from the _ListSubscribers data view. The
// first visit starts the query (utils/publicationLists.js) and says the user will be told
// when the counts are in; the last counts stay here, with Refresh to read them again.
import { computed, ref, watch } from 'vue'
import { Loader2, RefreshCw, ListChecks } from 'lucide-vue-next'
import Button from '@/components/ui/button/Button.vue'
import ResultsTable from '@/components/detail/ResultsTable.vue'
import { useStack } from '@/composables/useStack.js'
import { fetchCurrentBU } from '@/utils/sfmcApi.js'
import { formatDateTime } from '@/utils/format.js'
import { jobs, results, scopeOf, requestSummary, resumeSummary, loadResults, pivotSummary, SUMMARY_SQL } from '@/utils/publicationLists.js'

const { stack } = useStack()
const bu = ref(null)
const buError = ref('')
const showSql = ref(false)

const scope = computed(() => (stack.value && bu.value ? scopeOf(stack.value, bu.value.accountId) : null))
const job = computed(() => (scope.value ? jobs[scope.value] || null : null))
const running = computed(() => job.value?.status === 'running')
const rows = computed(() => (scope.value ? results[scope.value] || null : null))
const summary = computed(() => pivotSummary(rows.value))
const loadError = ref('')
const at = (ms) => (ms ? formatDateTime(new Date(ms).toISOString()) : '')

async function refresh() {
  if (!stack.value || !bu.value) return
  await requestSummary(stack.value, bu.value.accountId)
}

watch(stack, async (s) => {
  bu.value = null
  buError.value = ''
  loadError.value = ''
  if (!s) return
  try { bu.value = await fetchCurrentBU(s) } catch (e) { buError.value = e.message }
  if (!bu.value) { buError.value ||= 'Could not tell which business unit is open.'; return }
  await resumeSummary(s, bu.value.accountId)
  // First visit for this business unit: start right away; else show the last counts.
  if (!jobs[scope.value]) await refresh()
  else loadResults(s, bu.value.accountId).catch((e) => { loadError.value = e.message })
}, { immediate: true })
</script>

<template>
  <div class="h-full overflow-y-auto p-4 space-y-4 text-sm">
    <div class="flex flex-wrap items-center gap-2">
      <h1 class="text-base font-semibold flex-1">Publication Lists</h1>
      <button type="button" class="text-xs text-primary hover:underline" @click="showSql = !showSql">{{ showSql ? 'Hide SQL' : 'Show SQL' }}</button>
      <Button variant="outline" size="sm" class="h-8 text-xs" :disabled="!bu || running" @click="refresh">
        <Loader2 v-if="running" class="h-3.5 w-3.5 mr-1 animate-spin" /><RefreshCw v-else class="h-3.5 w-3.5 mr-1" /> Refresh
      </Button>
    </div>
    <p class="m-0 text-xs text-muted-foreground">Subscribers on each list in {{ bu?.name || 'this business unit' }} by status, counted by a query on the _ListSubscribers data view. SFMC runs it as a Query Activity, which can take a few minutes; the last counts stay here.</p>
    <pre v-if="showSql" class="m-0 rounded-md border border-border bg-muted p-3 text-xs font-mono whitespace-pre-wrap">{{ SUMMARY_SQL }}</pre>

    <p v-if="buError" class="text-xs text-red-600" role="alert">{{ buError }}</p>

    <div v-if="running" class="flex items-start gap-2 rounded-lg border border-sky-300 bg-sky-50 p-3 text-xs text-sky-900 dark:border-sky-900 dark:bg-sky-950/40 dark:text-sky-200" role="status" data-pl-running>
      <Loader2 class="h-4 w-4 shrink-0 animate-spin" />
      <span>Counting subscribers in SFMC since {{ at(job.startedAt) }}. You can leave this page: the Toolkit will let you know once the data is available.</span>
    </div>
    <p v-else-if="job?.status === 'error'" class="text-xs text-red-600" role="alert" data-pl-error>Could not count the subscribers: {{ job.error }}</p>

    <p v-if="loadError" class="text-xs text-red-600" role="alert">Could not read the last counts: {{ loadError }}</p>
    <template v-if="rows">
      <p class="m-0 text-xs text-muted-foreground">{{ summary.rows.length.toLocaleString() }} list{{ summary.rows.length === 1 ? '' : 's' }}, counted {{ at(job?.finishedAt) }}, read from the {{ job?.ids?.deName || 'SFMCQS_publist' }} data extension.<template v-if="!summary.rows.length"> The query found no list subscribers. If that looks wrong, open the SFMCQS_publist Query Activity in Automation Studio to see whether it failed.</template></p>
      <ResultsTable v-if="summary.rows.length" :rows="summary.rows" :columns="summary.columns" filename="publication-lists" file-prefix="publication-lists" data-pl-table />
    </template>
    <div v-else-if="!job && !buError && bu" class="mx-auto mt-10 max-w-md rounded-[14px] border border-border bg-card p-6 text-center text-sm text-muted-foreground">
      <ListChecks class="mx-auto mb-2 h-6 w-6" />
      No counts yet. Refresh starts the query.
    </div>
  </div>
</template>
