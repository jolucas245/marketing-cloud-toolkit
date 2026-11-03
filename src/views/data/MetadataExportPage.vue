<script setup>
// Data > Download metadata (feedback #1036): one export of the current business
// unit's setup. Reading and downloads live in composables/useMetadataExport.js
// (results kept in memory for the app tab); the sheets, JSON and document are built
// in utils/metadataExport.js. Data extension rows are never read.
import { computed } from 'vue'
import { FileDown, Loader2, Play, Square, RotateCw, FileSpreadsheet, FileJson, FileText, CheckCircle2, XCircle, Clock, ShieldCheck } from 'lucide-vue-next'
import ProgressBar from '@/components/ui/ProgressBar.vue'
import ReportErrorButton from '@/components/results/ReportErrorButton.vue'
import { useStack } from '@/composables/useStack.js'
import { useMetadataExport } from '@/composables/useMetadataExport.js'
import { PARTS } from '@/utils/metadataExport.js'
import { formatDateTime } from '@/utils/format.js'

const { stack } = useStack()
const { selected, rowCounts, status, results, meta, running, start, retry, stop, hasResults, downloadExcel, downloadJson, downloadMarkdown } = useMetadataExport()

const tickedCount = computed(() => PARTS.filter((p) => selected[p.id]).length)
const allTicked = computed(() => tickedCount.value === PARTS.length)
function toggleAll() {
  const v = !allTicked.value
  for (const p of PARTS) selected[p.id] = v
}
const canDownload = computed(() => !running.value && hasResults())
const otherStack = computed(() => meta.value && stack.value && meta.value.stack !== stack.value)

const pill = 'h-9 inline-flex items-center gap-1.5 px-3.5 rounded-full border border-border bg-card text-[13px] font-medium whitespace-nowrap hover:bg-accent disabled:opacity-50 disabled:cursor-not-allowed'

function stateText(id) {
  const s = status[id]
  if (s.state === 'waiting') return 'Waiting'
  if (s.state === 'loading') {
    const n = s.total ? `${s.done.toLocaleString()} of ${s.total.toLocaleString()}` : s.done ? s.done.toLocaleString() : ''
    return `Loading${s.label ? `: ${s.label}` : ''}${n ? ` (${n})` : ''}`
  }
  if (s.state === 'done') {
    const r = results[id]
    const n = r?.items.length || 0
    let t = `Done: ${n.toLocaleString()} item${n === 1 ? '' : 's'}`
    if (r?.capped) t += ' (reading limit reached)'
    const problems = (r?.errors?.length || 0) + (r?.items.filter((x) => x.error).length || 0)
    if (problems) t += `, ${problems} problem${problems === 1 ? '' : 's'} (listed in the downloads)`
    return t
  }
  if (s.state === 'stopped') return 'Stopped'
  if (s.state === 'failed') return 'Failed'
  return selected[id] ? 'Not read yet' : 'Not selected'
}
</script>

<template>
  <div class="h-full overflow-y-auto bg-background">
    <div class="max-w-[1060px] px-7 pt-6 pb-10 flex flex-col gap-4">
      <header class="flex flex-col gap-1.5">
        <div class="flex items-center gap-3">
          <span class="h-10 w-10 shrink-0 rounded-xl bg-teal-50 text-teal-700 dark:bg-teal-950/40 dark:text-teal-300 flex items-center justify-center" aria-hidden="true">
            <FileDown class="h-5 w-5" />
          </span>
          <h1 class="text-2xl font-bold">Download metadata</h1>
        </div>
        <p class="text-sm text-muted-foreground max-w-[760px]">
          One export of this business unit's setup: data extensions and their fields, activities with their SQL and code,
          automations, journeys, entry events, CloudPages and folders. Pick the parts, read them, then download as Excel, JSON or Markdown.
        </p>
      </header>

      <div class="rounded-[14px] border border-emerald-200 bg-emerald-50 text-emerald-900 dark:border-emerald-900 dark:bg-emerald-950/30 dark:text-emerald-200 px-4 py-3 text-sm flex items-start gap-2.5">
        <ShieldCheck class="h-4 w-4 mt-0.5 shrink-0" aria-hidden="true" />
        <p>Metadata only: no rows are read from any data extension, so no contact or subscriber data is in the files. Everything stays in this browser tab until you download it.</p>
      </div>

      <p v-if="!stack" class="rounded-xl border border-sky-200 bg-sky-50 text-sky-900 dark:border-sky-900 dark:bg-sky-950/30 dark:text-sky-200 px-4 py-3 text-sm" role="status">
        Not connected to Marketing Cloud. Open Marketing Cloud in a tab and log in, then come back.
      </p>

      <section class="rounded-[14px] border border-border bg-card">
        <div class="px-4 py-3 border-b border-border flex flex-wrap items-center gap-2.5">
          <h2 class="text-base font-semibold flex-1">What to include</h2>
          <button type="button" :class="pill" :disabled="running" @click="toggleAll">{{ allTicked ? 'Clear all' : 'Select all' }}</button>
        </div>
        <ul class="divide-y divide-border">
          <li v-for="p in PARTS" :key="p.id" class="px-4 py-3 flex flex-col gap-2">
            <div class="flex flex-wrap items-start gap-3">
              <label class="flex items-start gap-2.5 flex-1 min-w-[240px] cursor-pointer">
                <input v-model="selected[p.id]" type="checkbox" class="mt-0.5 h-4 w-4 accent-primary" :disabled="running" />
                <span class="flex flex-col">
                  <span class="text-sm font-medium">{{ p.label }}</span>
                  <span class="text-xs text-muted-foreground">{{ p.hint }}</span>
                </span>
              </label>
              <span class="flex items-center gap-1.5 text-xs whitespace-nowrap" :class="{
                'text-muted-foreground': ['idle', 'waiting', 'stopped'].includes(status[p.id].state),
                'text-foreground': status[p.id].state === 'loading',
                'text-emerald-700 dark:text-emerald-300': status[p.id].state === 'done',
                'text-red-700 dark:text-red-300': status[p.id].state === 'failed',
              }" aria-live="polite">
                <Loader2 v-if="status[p.id].state === 'loading'" class="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
                <CheckCircle2 v-else-if="status[p.id].state === 'done'" class="h-3.5 w-3.5" aria-hidden="true" />
                <XCircle v-else-if="status[p.id].state === 'failed'" class="h-3.5 w-3.5" aria-hidden="true" />
                <Clock v-else-if="status[p.id].state === 'waiting'" class="h-3.5 w-3.5" aria-hidden="true" />
                {{ stateText(p.id) }}
              </span>
              <button v-if="['failed', 'stopped'].includes(status[p.id].state) || (status[p.id].state === 'done' && !running)" type="button"
                class="h-7 inline-flex items-center gap-1 px-2.5 rounded-full border border-border bg-card text-xs font-medium hover:bg-accent disabled:opacity-50"
                :disabled="running || !stack" @click="retry(stack, p.id)">
                <RotateCw class="h-3 w-3" /> {{ status[p.id].state === 'done' ? 'Read again' : 'Retry' }}
              </button>
            </div>
            <label v-if="p.id === 'des'" class="ml-[26px] flex items-center gap-2 text-xs text-muted-foreground cursor-pointer w-fit">
              <input v-model="rowCounts" type="checkbox" class="h-3.5 w-3.5 accent-primary" :disabled="running || !selected.des" />
              Include row counts (slow: one more call per data extension)
            </label>
            <ProgressBar v-if="status[p.id].state === 'loading'" :value="status[p.id].done" :max="status[p.id].total" class="ml-[26px]" size="xs"
              :aria-label="`${p.label} progress`" />
            <p v-if="status[p.id].state === 'failed'" class="ml-[26px] rounded-lg border border-red-200 bg-red-50 text-red-800 dark:border-red-900 dark:bg-red-950/30 dark:text-red-300 px-3 py-2 text-xs break-words" role="alert">
              {{ status[p.id].message }}<ReportErrorButton />
            </p>
          </li>
        </ul>
      </section>

      <div class="rounded-[14px] border border-border bg-card px-4 py-3 flex flex-wrap items-center gap-2.5">
        <button v-if="!running" type="button" class="h-9 inline-flex items-center gap-1.5 px-4 rounded-full bg-primary text-primary-foreground text-[13px] font-medium hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed"
          :disabled="!stack || !tickedCount" @click="start(stack)">
          <Play class="h-3.5 w-3.5" /> {{ hasResults() ? 'Read again' : 'Read selected parts' }}
        </button>
        <button v-else type="button" :class="pill" @click="stop"><Square class="h-3.5 w-3.5" /> Stop</button>
        <span class="text-[13px] text-muted-foreground">
          <template v-if="meta">Read from {{ meta.buName || meta.stack }}<template v-if="meta.buId"> ({{ meta.buId }})</template>, {{ formatDateTime(meta.exportedAt) }}</template>
          <template v-else>{{ tickedCount }} of {{ PARTS.length }} parts selected</template>
        </span>
        <span class="ml-auto flex flex-wrap gap-2">
          <button type="button" :class="pill" :disabled="!canDownload" @click="downloadExcel"><FileSpreadsheet class="h-4 w-4" /> Excel</button>
          <button type="button" :class="pill" :disabled="!canDownload" @click="downloadJson"><FileJson class="h-4 w-4" /> JSON</button>
          <button type="button" :class="pill" :disabled="!canDownload" @click="downloadMarkdown"><FileText class="h-4 w-4" /> Markdown</button>
        </span>
      </div>
      <p v-if="otherStack" class="text-xs text-amber-700 dark:text-amber-300">These results were read on stack {{ meta.stack }}; you are now connected to {{ stack }}. Read again to export this one.</p>
      <p class="text-xs text-muted-foreground">
        Excel has one sheet per part, plus DE fields, automation steps and journey activities as their own sheets. Cells longer than Excel allows are cut; the JSON file always has the full text.
        Parts that fail do not stop the others, and their problems are listed in the downloads.
      </p>
    </div>
  </div>
</template>
