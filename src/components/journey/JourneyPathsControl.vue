<script setup>
// Contact paths on a journey's page (feedback #1089): every contact's path through this
// journey in a period, summed per activity and per route and drawn over the canvas
// (the parent passes `counts` to JourneyCanvas). Never read until Show paths.
// The whole-journey history search is not confirmed live (utils/journeyPaths.js);
// when Journey Builder refuses it, the data-view email send counts are offered instead.
import { computed, onBeforeUnmount, ref } from 'vue'
import { useRouter } from 'vue-router'
import { Loader2, Footprints, X, Database } from 'lucide-vue-next'
import Button from '@/components/ui/button/Button.vue'
import ProgressBar from '@/components/ui/ProgressBar.vue'
import { withReconnect, searchError } from '@/utils/sfmcErrors.js'
import { PATH_RANGES, PATH_MAX_ROWS, periodRange, journeyMatcher, fetchJourneyHistory, aggregatePaths, pathRows, journeySendCountsSql } from '@/utils/journeyPaths.js'

const props = defineProps({
  stack: { type: String, default: '' },
  journey: { type: Object, required: true },
  versions: { type: Array, default: () => [] },
  graph: { type: Object, required: true },
})
const emit = defineEmits(['counts'])
const router = useRouter()

const period = ref('7') // '1' | '7' | '30' | 'custom'
const from = ref('')
const to = ref('')
const busy = ref(false)
const progress = ref({ read: 0, total: null, kept: 0 })
const error = ref(null) // { message, refused }
const result = ref(null) // { agg, read, total, capped, searchKey, label }
let generation = 0

const periodDays = computed(() => (period.value === 'custom' ? null : Number(period.value)))
const label = () => (period.value === 'custom' ? `${from.value || '...'} to ${to.value || 'today'}` : PATH_RANGES.find((r) => String(r.days) === period.value)?.label || '')

async function show() {
  let range
  try { range = periodRange(period.value === 'custom' ? { from: from.value, to: to.value } : { days: periodDays.value }) }
  catch (e) { error.value = { message: e.message }; return }
  const gen = ++generation
  const stack = props.stack
  busy.value = true
  error.value = null
  result.value = null
  emit('counts', null)
  progress.value = { read: 0, total: null, kept: 0 }
  const matcher = journeyMatcher(props.journey, props.versions)
  try {
    const r = await withReconnect(stack, () => fetchJourneyHistory(stack, props.journey, {
      ...range, matcher, versions: props.versions || [], max: PATH_MAX_ROWS,
      onProgress: (p) => { if (gen === generation) progress.value = p },
      cancelled: () => gen !== generation,
    }))
    if (gen !== generation) return
    const agg = aggregatePaths(props.journey, props.graph, r.items)
    result.value = { agg, read: r.read, total: r.total, capped: r.capped, form: r.form, label: label(), rows: pathRows(props.graph, agg) }
    emit('counts', agg)
  } catch (e) {
    if (gen !== generation) return
    const known = e.code === 'HISTORY_SEARCH_REFUSED' || e.code === 'HISTORY_NOT_FILTERED'
    error.value = { message: known ? e.message : searchError(e, 'read the journey history').message, refused: known }
  } finally {
    if (gen === generation) busy.value = false
  }
}

function clear() {
  generation++
  busy.value = false
  result.value = null
  error.value = null
  emit('counts', null)
}
onBeforeUnmount(() => { generation++ })

function openSendCounts() {
  const days = periodDays.value ?? Math.max(1, Math.ceil((Date.now() - new Date(from.value || Date.now()).getTime()) / 86400000))
  router.push({ path: '/queries/workspace', query: { sql: journeySendCountsSql(props.journey.name || '', days) } })
}
const reached = computed(() => result.value?.rows.filter((r) => r.count > 0) || [])
</script>

<template>
  <section class="rounded-lg border border-border bg-card p-3 space-y-3 text-xs" data-contact-paths>
    <p class="text-muted-foreground max-w-3xl">Show the paths contacts took through this journey in a period, summed on the canvas: the number of contact entries that reached each activity, and the number that took each route (thicker lines carry more). Reads Journey Builder's journey history, newest first, up to {{ PATH_MAX_ROWS.toLocaleString() }} rows. Nothing is read until you press Show paths.</p>
    <form class="flex flex-wrap items-end gap-3" @submit.prevent="show">
      <label class="flex flex-col gap-0.5">Period
        <select v-model="period" class="h-8 rounded-md border border-border bg-background px-2" aria-label="Paths period" data-paths-period>
          <option v-for="r in PATH_RANGES" :key="r.days" :value="String(r.days)">{{ r.label }}</option>
          <option value="custom">Custom</option>
        </select>
      </label>
      <template v-if="period === 'custom'">
        <label class="flex flex-col gap-0.5">From <input v-model="from" type="date" class="h-8 rounded-md border border-border bg-background px-2" aria-label="From date" data-paths-from /></label>
        <label class="flex flex-col gap-0.5">To <input v-model="to" type="date" class="h-8 rounded-md border border-border bg-background px-2" aria-label="To date" data-paths-to /></label>
      </template>
      <Button size="sm" class="h-8 text-xs" type="submit" :disabled="busy || !stack" data-paths-show>
        <Loader2 v-if="busy" class="h-3.5 w-3.5 mr-1 animate-spin" /><Footprints v-else class="h-3.5 w-3.5 mr-1" /> Show paths
      </Button>
      <Button v-if="result || busy || error" variant="outline" size="sm" class="h-8 text-xs" type="button" data-paths-clear @click="clear"><X class="h-3.5 w-3.5 mr-1" /> Clear</Button>
    </form>

    <ProgressBar v-if="busy" :value="progress.read" :max="Math.min(progress.total ?? PATH_MAX_ROWS, PATH_MAX_ROWS)" :indeterminate="progress.total == null && !progress.read"
      :label="`Reading the history: ${progress.read.toLocaleString()} rows read, ${progress.kept.toLocaleString()} for this journey`" aria-label="Reading the journey history" />

    <div v-if="error" class="space-y-1" role="alert" data-paths-error>
      <p class="text-red-600">{{ error.message }}</p>
      <p v-if="error.refused" class="text-muted-foreground">Paths need the journey history. The data views can still count email sends per activity and version in this period (email steps only, no routes).</p>
    </div>

    <div v-if="result" class="space-y-2" data-paths-summary>
      <p>
        <b>{{ result.label }}:</b> {{ result.agg.entries.toLocaleString() }} contact {{ result.agg.entries === 1 ? 'entry' : 'entries' }} by {{ result.agg.contacts.toLocaleString() }} {{ result.agg.contacts === 1 ? 'contact' : 'contacts' }},
        {{ result.agg.exited.toLocaleString() }} left the journey<span v-if="result.agg.failed">, <span class="text-red-600">{{ result.agg.failed.toLocaleString() }} with a failed step</span></span>.
        <span class="text-muted-foreground">{{ result.read.toLocaleString() }} history rows read.</span>
      </p>
      <p v-if="result.capped" class="text-amber-700 dark:text-amber-400" data-paths-capped>Stopped at {{ PATH_MAX_ROWS.toLocaleString() }} history rows<span v-if="result.total"> of {{ result.total.toLocaleString() }}</span>: the counts cover the newest rows only, and the oldest entries may be missing their first steps. Pick a shorter period for full counts.</p>
      <p v-if="result.form" class="text-muted-foreground" data-paths-form>History searched for this journey by its {{ result.form }}.</p>
      <p v-if="result.agg.unmatched" class="text-muted-foreground">{{ result.agg.unmatched.toLocaleString() }} history rows name activities that are not in this version's canvas (other versions, or removed steps); they are not drawn.</p>
      <p v-if="!result.agg.entries" class="text-muted-foreground">No contact went through this journey in the period.</p>
      <details v-if="reached.length">
        <summary class="cursor-pointer">Per activity</summary>
        <table class="mt-1 text-left" data-paths-table>
          <thead class="text-muted-foreground"><tr><th class="pr-4 font-medium">Activity</th><th class="pr-4 font-medium text-right">Contact entries</th><th class="font-medium text-right">Failed</th></tr></thead>
          <tbody><tr v-for="r in reached" :key="r.key" class="border-t border-border"><td class="pr-4">{{ r.name }}</td><td class="pr-4 text-right tabular-nums">{{ r.count.toLocaleString() }}</td><td class="text-right tabular-nums" :class="r.failed ? 'text-red-600' : 'text-muted-foreground'">{{ r.failed.toLocaleString() }}</td></tr></tbody>
        </table>
      </details>
    </div>
    <button type="button" class="inline-flex items-center gap-1 text-primary hover:underline" data-paths-sends @click="openSendCounts"><Database class="h-3 w-3" /> Email send counts from data views (Run Query)</button>
  </section>
</template>
