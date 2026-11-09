<script setup>
// To Test (user, 2026-11-04): the checklist for a test build. Routed only when
// __TEST_BUILD__ is true (npm run package -- --test, or any *-test-* zip), so the store
// build has no trace of it. Results stay in this browser (chrome.storage.local) until
// Send results puts them all in one feedback row (utils/toTestReport.js).
import { computed, ref } from 'vue'
import { CheckCircle2, XCircle, MinusCircle, FlaskConical, RotateCcw, Send } from 'lucide-vue-next'
import { testResultsReport } from '@/utils/toTestReport.js'
import { TO_TEST } from '@/data/toTest.js'
import { errorReport } from '@/composables/useReportError.js'

const KEY = 'toolkit_to_test'
const COMMIT = __TEST_COMMIT__
const results = ref({}) // id -> { result: 'pass' | 'fail' | 'skip', at, note? }
const filter = ref('all') // all | open | fail
const open = ref(new Set([TO_TEST[0]?.version, TO_TEST[1]?.version]))

try { chrome.storage?.local.get(KEY, (r) => { results.value = r?.[KEY] || {} }) } catch { /* not in an extension */ }
function save() { try { chrome.storage?.local.set({ [KEY]: results.value }) } catch { /* not in an extension */ } }

function mark(item, result) {
  const next = { ...results.value }
  if (next[item.id]?.result === result) delete next[item.id]
  else next[item.id] = { ...next[item.id], result, at: new Date().toISOString() }
  results.value = next
  save()
  if (result === 'fail' && next[item.id]) report(item)
}
function report(item) {
  errorReport.value = {
    kind: 'problem',
    message: `[To Test] ${item.title}: failed`,
    details: [`Test build: ${COMMIT || 'unknown'}`, `Item: ${item.id}${item.ref ? ` (${item.ref})` : ''}${item.from ? `, raised by ${item.from}` : ''}`, `Where: ${item.where}`,
      'Steps:', ...item.steps.map((s, i) => `${i + 1}. ${s}`), `Expected: ${item.expect}`, '', 'What happened:', ''].join('\n'),
  }
}
function setNote(item, note) {
  const next = { ...results.value }
  next[item.id] = { ...(next[item.id] || {}), note }
  if (!next[item.id].result && !note.trim()) delete next[item.id]
  results.value = next
  save()
}
// Every item's result and note in one feedback row (kind 'test-results'); the tester
// reviews it in the Feedback form and adds their name before it is sent.
function sendResults() {
  const r = testResultsReport(TO_TEST, results.value, COMMIT)
  errorReport.value = {
    kind: 'test-results',
    message: r.message,
    details: r.details,
    notice: 'Your results are filled in below. Add your name so your results can be told apart from other testers\', and remove anything you do not want to send (customer data in notes).',
  }
}
function resetAll() { results.value = {}; save() }

const total = computed(() => TO_TEST.reduce((n, v) => n + v.items.length, 0))
const counts = computed(() => {
  const c = { pass: 0, fail: 0, skip: 0 }
  for (const r of Object.values(results.value)) if (r && c[r.result] != null) c[r.result]++
  return c
})
const shown = (item) => filter.value === 'all' || (filter.value === 'open' ? !results.value[item.id]?.result : results.value[item.id]?.result === 'fail')
function toggle(v) { const s = new Set(open.value); s.has(v) ? s.delete(v) : s.add(v); open.value = s }
</script>

<template>
  <div class="h-full overflow-y-auto" data-to-test-page>
    <div class="max-w-4xl mx-auto px-5 py-6 space-y-5">
      <div class="flex flex-wrap items-center gap-3">
        <span class="flex h-9 w-9 items-center justify-center rounded-xl bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300"><FlaskConical class="h-[18px] w-[18px]" /></span>
        <div class="flex-1 min-w-0">
          <h1 class="text-xl font-bold">To Test</h1>
          <p class="text-sm text-muted-foreground">Test build {{ COMMIT || '' }}. This page is only in test builds, never in the store version. Use a sandbox with test data.</p>
        </div>
      </div>

      <div class="flex flex-wrap items-center gap-2 text-sm">
        <span class="rounded-full bg-muted px-3 py-1 tabular-nums">{{ counts.pass + counts.fail + counts.skip }} of {{ total }} done</span>
        <span class="rounded-full bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300 px-3 py-1 tabular-nums">{{ counts.pass }} passed</span>
        <span class="rounded-full bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300 px-3 py-1 tabular-nums">{{ counts.fail }} failed</span>
        <span class="rounded-full bg-muted px-3 py-1 tabular-nums">{{ counts.skip }} skipped</span>
        <div class="flex-1" />
        <div class="flex gap-1" role="group" aria-label="Show">
          <button v-for="f in [['all', 'All'], ['open', 'Not done'], ['fail', 'Failed']]" :key="f[0]" type="button" class="h-8 px-3 rounded-full border border-border text-xs"
            :class="filter === f[0] ? 'bg-primary text-primary-foreground border-primary' : 'hover:bg-accent'" :aria-pressed="filter === f[0]" @click="filter = f[0]">{{ f[1] }}</button>
        </div>
        <button type="button" class="h-8 px-3 rounded-full bg-primary text-primary-foreground text-xs hover:opacity-90 inline-flex items-center gap-1" title="Send every result and note on this page to the developer (you review it first)" data-send-results @click="sendResults"><Send class="h-3 w-3" /> Send results</button>
        <button type="button" class="h-8 px-3 rounded-full border border-border text-xs hover:bg-accent inline-flex items-center gap-1" title="Clear every result on this page" @click="resetAll"><RotateCcw class="h-3 w-3" /> Reset</button>
      </div>

      <p class="text-xs text-muted-foreground">Mark each item Pass, Fail or Skip (click again to clear). Fail opens Feedback with the item filled in: add what happened and send it. Results stay in this browser until you click Send results, which sends every result and note in one message (you see it first). "Not checked on a live org" items have only been tried with test data so far, so they need the most attention.</p>

      <section v-for="v in TO_TEST" :key="v.version" class="rounded-[14px] border border-border bg-card">
        <button type="button" class="w-full flex items-center gap-2 px-4 py-3 text-left" :aria-expanded="open.has(v.version)" @click="toggle(v.version)">
          <span class="font-semibold">Version {{ v.version }}</span>
          <span class="text-xs text-muted-foreground">{{ v.status }}</span>
          <span class="ml-auto text-xs text-muted-foreground tabular-nums">{{ v.items.filter((i) => results[i.id]?.result).length }} / {{ v.items.length }}</span>
        </button>
        <ol v-if="open.has(v.version)" class="border-t border-border divide-y divide-border">
          <li v-for="item in v.items.filter(shown)" :key="item.id" class="px-4 py-3 space-y-1.5" :data-test-item="item.id">
            <div class="flex flex-wrap items-start gap-2">
              <div class="flex-1 min-w-0">
                <div class="text-xs text-muted-foreground">{{ item.area }}<template v-if="item.ref"> · {{ item.ref }}</template><template v-if="item.from"> · raised by {{ item.from }}</template></div>
                <div class="font-medium">{{ item.title }}</div>
              </div>
              <span v-if="item.live" class="rounded-full bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300 px-2 py-0.5 text-[11px] font-medium">Not checked on a live org</span>
              <div class="flex gap-1">
                <button type="button" class="h-7 px-2 rounded-md border text-xs inline-flex items-center gap-1" :class="results[item.id]?.result === 'pass' ? 'bg-emerald-600 text-white border-emerald-600' : 'border-border hover:bg-accent'" :aria-pressed="results[item.id]?.result === 'pass'" @click="mark(item, 'pass')"><CheckCircle2 class="h-3.5 w-3.5" /> Pass</button>
                <button type="button" class="h-7 px-2 rounded-md border text-xs inline-flex items-center gap-1" :class="results[item.id]?.result === 'fail' ? 'bg-red-600 text-white border-red-600' : 'border-border hover:bg-accent'" :aria-pressed="results[item.id]?.result === 'fail'" @click="mark(item, 'fail')"><XCircle class="h-3.5 w-3.5" /> Fail</button>
                <button type="button" class="h-7 px-2 rounded-md border text-xs inline-flex items-center gap-1" :class="results[item.id]?.result === 'skip' ? 'bg-muted-foreground text-background border-muted-foreground' : 'border-border hover:bg-accent'" :aria-pressed="results[item.id]?.result === 'skip'" @click="mark(item, 'skip')"><MinusCircle class="h-3.5 w-3.5" /> Skip</button>
              </div>
            </div>
            <div class="text-xs"><span class="text-muted-foreground">Where:</span> {{ item.where }}</div>
            <ol class="list-decimal pl-5 text-sm space-y-0.5"><li v-for="(s, i) in item.steps" :key="i">{{ s }}</li></ol>
            <div class="text-sm"><span class="text-muted-foreground">Expected:</span> {{ item.expect }}</div>
            <input type="text" maxlength="500" class="w-full h-7 rounded-md border border-border bg-background px-2 text-xs" placeholder="Note (optional, sent with Send results)"
              :value="results[item.id]?.note || ''" :aria-label="`Note for ${item.title}`" @change="setNote(item, $event.target.value)" />
            <button v-if="results[item.id]?.result === 'fail'" type="button" class="text-xs text-primary hover:underline" @click="report(item)">Report again</button>
          </li>
        </ol>
      </section>
    </div>
  </div>
</template>
