<script setup>
// Summary of an email validation run (feedback #1091): total, valid, not valid, not
// checked, and the not-valid ones split by the check that failed. Each count is a bar;
// clicking one filters the results table (emits `filter` with the filter id, or '' to
// show all). Copy and Download give the counts only, never the addresses.
import { computed } from 'vue'
import { Copy, Download } from 'lucide-vue-next'
import Button from '@/components/ui/button/Button.vue'
import { summaryRows, summaryText } from '@/utils/emailValidation.js'
import { saveTextFile } from '@/utils/download.js'
import { csvQuote } from '@/utils/queryCsv.js'
import { showToast } from '@/composables/useToast.js'

const props = defineProps({
  summary: { type: Object, required: true },
  title: { type: String, default: 'Email validation' },
  filter: { type: String, default: '' },
  running: { type: Boolean, default: false },
})
const emit = defineEmits(['filter'])

const total = computed(() => props.summary.total || 0)
const width = (n) => `${total.value ? Math.max(n ? 1 : 0, Math.round((100 * n) / total.value)) : 0}%`
const pct = (n) => (total.value ? `${Math.round((1000 * n) / total.value) / 10}%` : '')

const groups = computed(() => [
  { id: 'valid', label: 'Valid', count: props.summary.valid, bar: 'bg-green-600 dark:bg-green-500', text: 'text-green-700 dark:text-green-400' },
  { id: 'invalid', label: 'Not valid', count: props.summary.invalid, bar: 'bg-red-600 dark:bg-red-500', text: 'text-red-600 dark:text-red-400' },
  ...props.summary.categories.map((c) => ({ id: `invalid:${c.id}`, label: c.label, count: c.count, bar: 'bg-red-300 dark:bg-red-800', text: 'text-red-700 dark:text-red-300', sub: true })),
  { id: 'notChecked', label: 'Not checked (errors)', count: props.summary.notChecked, bar: 'bg-slate-400 dark:bg-slate-500', text: 'text-muted-foreground' },
])

const pick = (id) => emit('filter', props.filter === id ? '' : id)

async function copy() {
  try {
    await navigator.clipboard.writeText(summaryText(props.summary, props.title))
    showToast('Copied the summary.')
  } catch { showToast('Could not copy the summary.') }
}
function download() {
  const rows = summaryRows(props.summary)
  const csv = [['Group', 'Count', 'Share'], ...rows.map((r) => [r.Group, r.Count, r.Share])].map((r) => r.map(csvQuote).join(',')).join('\n')
  saveTextFile(csv, `email-validation-summary-${new Date().toISOString().slice(0, 10)}.csv`, 'text/csv', 'CSV file')
}
</script>

<template>
  <section class="rounded-lg border border-border bg-card p-3 space-y-2 text-xs" data-validation-summary>
    <div class="flex flex-wrap items-center gap-2">
      <h2 class="font-semibold text-sm flex-1">Summary{{ running ? ' so far' : '' }}</h2>
      <span class="text-muted-foreground" data-summary-total>{{ total.toLocaleString() }} checked</span>
      <Button variant="outline" size="sm" class="h-7 text-xs" data-summary-copy @click="copy"><Copy class="h-3.5 w-3.5 mr-1" /> Copy</Button>
      <Button variant="outline" size="sm" class="h-7 text-xs" data-summary-download @click="download"><Download class="h-3.5 w-3.5 mr-1" /> CSV</Button>
    </div>
    <p class="text-muted-foreground">Click a line to show only those results{{ filter ? '; click it again to show all' : '' }}.</p>
    <ul class="space-y-1 max-w-3xl">
      <li v-for="g in groups" :key="g.id" :class="g.sub ? 'pl-5' : ''">
        <button type="button" class="w-full grid grid-cols-[minmax(0,16rem)_minmax(0,1fr)_6rem] items-center gap-2 rounded px-1 py-0.5 text-left hover:bg-accent disabled:opacity-60 disabled:hover:bg-transparent"
          :class="filter === g.id ? 'bg-accent ring-1 ring-primary' : ''" :disabled="!g.count" :aria-pressed="filter === g.id" :data-summary-group="g.id" @click="pick(g.id)">
          <span class="truncate" :class="g.sub ? '' : 'font-medium ' + g.text">{{ g.label }}</span>
          <span class="h-2.5 rounded-full bg-muted overflow-hidden"><span class="block h-full rounded-full" :class="g.bar" :style="{ width: width(g.count) }" /></span>
          <span class="text-right tabular-nums">{{ g.count.toLocaleString() }} <span class="text-muted-foreground">{{ pct(g.count) }}</span></span>
        </button>
      </li>
    </ul>
    <details v-if="summary.errors.length" class="max-w-3xl">
      <summary class="cursor-pointer text-muted-foreground">Not checked, by error ({{ summary.errors.length }})</summary>
      <ul class="mt-1 list-disc pl-5">
        <li v-for="e in summary.errors.slice(0, 10)" :key="e.message">{{ e.message }}: {{ e.count.toLocaleString() }}</li>
      </ul>
    </details>
  </section>
</template>
