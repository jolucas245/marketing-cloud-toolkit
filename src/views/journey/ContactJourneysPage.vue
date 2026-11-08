<script setup>
// Contact journeys: one contact across every journey, or within one journey. Lists
// the journeys the contact is in now and the ones it went through, and for each the
// path it took: its steps in order and the same path on the journey's canvas.
// Read-only. The history items' field names are not confirmed live (utils/contactJourneys.js).
import ReportErrorButton from '@/components/results/ReportErrorButton.vue'
import { computed, onMounted, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import { Loader2, Search, Route as RouteIcon, ChevronDown, ChevronRight, ExternalLink, Database, X, FileDown } from 'lucide-vue-next'
import Button from '@/components/ui/button/Button.vue'
import Input from '@/components/ui/input/Input.vue'
import CodeView from '@/components/results/CodeView.vue'
import JourneyCanvas from '@/components/journey/JourneyCanvas.vue'
import StatusBadge from '@/components/results/StatusBadge.vue'
import SfmcErrorNotice from '@/components/results/SfmcErrorNotice.vue'
import { useStack, whenStack } from '@/composables/useStack.js'
import { withReconnect, searchError } from '@/utils/sfmcErrors.js'
import { searchJourneys, groupJourneyVersions, journeyGraph, layoutJourney } from '@/utils/journeys.js'
import DownloadMenu from '@/components/results/DownloadMenu.vue'
import { journeySvg } from '@/utils/journeySvg.js'
import { pageCacheKey, readPageCache, writePageCache } from '@/utils/pageCache.js'
import { saveTextFile } from '@/utils/download.js'
import { csvQuote } from '@/utils/queryCsv.js'
import { fetchContactMembership, fetchContactHistory, groupByJourney, journeyForHistory, contactJourneysDoc, contactJourneysRows, entryFlowText, matchSteps, pathOnGraph, stepNumbers, journeySendsSql, stepLabel, RANGES } from '@/utils/contactJourneys.js'
import { formatDateTime } from '@/utils/format.js'

const router = useRouter()
const { stack } = useStack()

const contactKey = ref('')
const scope = ref('all') // all | one
const days = ref(30)

// One journey: search and pick.
const jQuery = ref('')
const jResults = ref([])
const jSearching = ref(false)
const journey = ref(null) // { id, key, name, version }
let timer = null
watch(jQuery, (q) => {
  clearTimeout(timer)
  if (!q.trim()) { jResults.value = []; return }
  timer = setTimeout(async () => {
    jSearching.value = true
    // Every version, grouped per journey: the newest version alone showed "Draft" for a
    // journey whose older version is Published (live test, 2026-11-07).
    try { jResults.value = groupJourneyVersions((await searchJourneys(stack.value, { query: q.trim(), allVersions: true })).items).slice(0, 20) }
    catch (e) { error.value = searchError(e, 'search journeys') }
    finally { jSearching.value = false }
  }, 300)
})

const busy = ref(false)
const error = ref('')
const searched = ref(null) // { key, scope, journey, days }
const membership = ref(null) // { memberships, errors } | { error }
const history = ref(null) // { items, raw, total } | { error }
const showRaw = ref(false)

// Results stay for the life of the app tab (feedback #1017): leaving the page and
// coming back shows them again. Memory only, never written to storage.
const memoryKey = () => pageCacheKey('contact-journeys', stack.value)
function remember() {
  writePageCache(memoryKey(), { contactKey: contactKey.value, scope: scope.value, days: days.value, journey: journey.value,
    searched: searched.value, membership: membership.value, history: history.value, open: open.value, paths: paths.value, picked: picked.value })
}
function restore() {
  const m = readPageCache(memoryKey())
  if (!m?.searched) return
  contactKey.value = m.contactKey; scope.value = m.scope; days.value = m.days; journey.value = m.journey
  searched.value = m.searched; membership.value = m.membership; history.value = m.history
  open.value = m.open || {}; paths.value = m.paths || {}; picked.value = m.picked || {}
}

async function find() {
  const key = contactKey.value.trim()
  if (!key) { error.value = 'Enter a Contact Key.'; return }
  if (scope.value === 'one' && !journey.value) { error.value = 'Pick the journey.'; return }
  error.value = ''
  busy.value = true
  membership.value = null
  history.value = null
  open.value = {}
  picked.value = {}
  paths.value = {}
  searched.value = { key, scope: scope.value, journey: journey.value, days: days.value }
  const [m, h] = await Promise.allSettled([
    withReconnect(stack.value, () => fetchContactMembership(stack.value, key)),
    withReconnect(stack.value, () => fetchContactHistory(stack.value, key, { days: days.value })),
  ])
  membership.value = m.status === 'fulfilled' ? m.value : { error: m.reason?.message || String(m.reason) }
  history.value = h.status === 'fulfilled' ? h.value : { error: h.reason?.message || String(h.reason) }
  busy.value = false
  remember()
}

const inScope = (g) => searched.value?.scope !== 'one' || !searched.value.journey
  || g.definitionId === searched.value.journey.id || g.definitionKey === searched.value.journey.key || g.name === searched.value.journey.name
const groups = computed(() => (history.value?.items ? groupByJourney(history.value.items).filter(inScope) : []))
const currentIn = computed(() => {
  const list = membership.value?.memberships || []
  if (searched.value?.scope !== 'one') return list
  return list.filter((m) => m.definitionKey === searched.value.journey?.key)
})

// Path on the canvas, loaded when a journey is opened.
const open = ref({})
const paths = ref({}) // id → { status, def, graph, layout, fallback, error, journeyId, version }
// The entry shown on the canvas per journey (feedback #1020): the newest unless one is picked.
const picked = ref({}) // group id → entry index
const entryOf = (g) => g.entries[picked.value[g.id] ?? 0] || g.entries[0]
function pick(g, i) { picked.value = { ...picked.value, [g.id]: i }; remember() }
function pathFor(g) {
  const p = paths.value[g.id]
  if (p?.status !== 'ok') return null
  const e = entryOf(g)
  const { keys, unmatched, ended } = matchSteps(p.def, e?.steps || [])
  const { nodes, edges } = pathOnGraph(p.graph, keys, { ended })
  return { visited: nodes, visitedEdges: edges, steps: stepNumbers(keys), unmatched }
}
const showTable = ref({})
async function toggle(g) {
  open.value = { ...open.value, [g.id]: !open.value[g.id] }
  remember()
  if (!open.value[g.id] || paths.value[g.id]) return
  paths.value = { ...paths.value, [g.id]: { status: 'loading' } }
  try {
    const { journey: def, fallback } = await withReconnect(stack.value, () => journeyForHistory(stack.value, g))
    const graph = journeyGraph(def)
    const layout = layoutJourney(graph)
    paths.value = { ...paths.value, [g.id]: { status: 'ok', def, graph, layout, fallback, journeyId: def.id, version: def.version, name: def.name } }
  } catch (e) {
    paths.value = { ...paths.value, [g.id]: { status: 'error', error: e.message } }
  }
  remember()
}

// Downloads (feedback #1019): the results as a document (opened journeys with their
// canvas and the picked entry's path), and every step as CSV.
const periodLabel = () => RANGES.find((r) => r.days === searched.value?.days)?.label || ''
function getDoc() {
  const diagrams = {}
  for (const g of groups.value) {
    const p = paths.value[g.id]
    if (p?.status === 'ok') diagrams[g.id] = journeySvg(p.graph, p.layout, 'horizontal', pathFor(g))
  }
  return contactJourneysDoc({
    contactKey: searched.value.key, periodLabel: periodLabel(),
    scopeLabel: searched.value.scope === 'one' ? `Within ${searched.value.journey?.name || 'one journey'}` : 'Across all journeys',
    membership: membership.value?.error ? { error: membership.value.error } : currentIn.value, groups: groups.value, diagrams, fmt: formatDateTime,
  })
}
function downloadCsv() {
  const csv = contactJourneysRows(groups.value).map((r) => r.map((v) => csvQuote(v ?? '')).join(',')).join('\n')
  saveTextFile(csv, `contact-journeys-${new Date().toISOString().slice(0, 10)}.csv`, 'text/csv', 'CSV file')
}

function openSendsSql() {
  router.push({ path: '/queries/workspace', query: { sql: journeySendsSql(searched.value?.key || contactKey.value.trim()) } })
}
onMounted(() => whenStack(() => { if (!searched.value) restore() }))
const statusClass = (s) => (/fail|error/i.test(s) ? 'text-red-600' : /complete|success|executed|metcriteria/i.test(s) ? 'text-green-700 dark:text-green-400' : 'text-muted-foreground')
</script>

<template>
  <div class="h-full overflow-y-auto p-4 space-y-4 text-sm">
    <h1 class="text-base font-semibold">Contact journeys</h1>
    <p class="text-xs text-muted-foreground max-w-3xl">Find one contact in every journey, or in one journey, and see the path it took: each step in order, and the same path on the journey's canvas. Read-only.</p>

    <section class="rounded-lg border border-border bg-card p-3 space-y-3 text-xs">
      <form class="flex flex-wrap items-end gap-3" @submit.prevent="find">
        <label class="flex flex-col gap-0.5">Contact Key (exact)
          <Input v-model="contactKey" class="h-8 text-xs w-72 font-mono" aria-label="Contact Key" />
        </label>
        <fieldset class="flex items-center gap-3">
          <label class="flex items-center gap-1.5"><input v-model="scope" type="radio" value="all" /> Across all journeys</label>
          <label class="flex items-center gap-1.5"><input v-model="scope" type="radio" value="one" /> Within one journey</label>
        </fieldset>
        <label class="flex flex-col gap-0.5">Period
          <select v-model.number="days" class="h-8 rounded-md border border-border bg-background px-2">
            <option v-for="r in RANGES" :key="r.days" :value="r.days">{{ r.label }}</option>
          </select>
        </label>
        <Button size="sm" class="h-8 text-xs" type="submit" :disabled="busy || !contactKey.trim() || !stack">
          <Loader2 v-if="busy" class="h-3.5 w-3.5 mr-1 animate-spin" /><Search v-else class="h-3.5 w-3.5 mr-1" /> Find
        </Button>
      </form>
      <div v-if="scope === 'one'" class="space-y-1 max-w-xl">
        <div v-if="journey" class="flex items-center gap-2">Journey: <b>{{ journey.name }}</b> <span class="text-muted-foreground">v{{ journey.version }}</span>
          <button class="p-0.5 rounded hover:bg-accent" title="Pick another journey" @click="journey = null"><X class="h-3 w-3" /></button>
        </div>
        <template v-else>
          <Input v-model="jQuery" class="h-8 text-xs" placeholder="Search journeys by name" aria-label="Search journeys" />
          <div v-if="jQuery.trim()" class="max-h-40 overflow-y-auto border border-border rounded p-1">
            <div v-if="jSearching" class="flex items-center gap-1 p-1 text-muted-foreground"><Loader2 class="h-3 w-3 animate-spin" /> Searching...</div>
            <button v-for="j in jResults" :key="j.id" type="button" class="w-full flex items-center gap-1.5 px-1 py-1 rounded text-left hover:bg-muted"
              :title="j.versions.map((v) => `Version ${v.version}: ${v.status}`).join('\n')"
              @click="journey = { id: j.id, key: j.key, name: j.name, version: j.primary?.version }; jQuery = ''">
              <RouteIcon class="h-3 w-3 shrink-0" /><span class="truncate flex-1">{{ j.name }}</span>
              <span v-if="j.versions.length > 1" class="shrink-0 text-[10px] text-muted-foreground">{{ j.versions.filter((v) => v !== j.primary).map((v) => `v${v.version} ${v.status}`).join(', ') }}</span>
              <span class="shrink-0 text-[10px] text-muted-foreground">v{{ j.primary?.version }}</span><StatusBadge :status="j.primary?.status" />
            </button>
            <div v-if="!jSearching && !jResults.length" class="p-1 text-muted-foreground italic">No matches</div>
          </div>
        </template>
      </div>
      <SfmcErrorNotice :error="error" @retry="find" />
    </section>

    <template v-if="searched && !busy">
      <section class="rounded-lg border border-border bg-card p-3 space-y-2 text-xs">
        <h2 class="font-semibold text-sm">In now</h2>
        <p v-if="membership?.error" class="text-red-600">Could not read the journeys this contact is in: {{ membership.error }}<ReportErrorButton /></p>
        <p v-else-if="!currentIn.length" class="text-muted-foreground">{{ searched.scope === 'one' ? 'Not in this journey now.' : 'Not in any journey now.' }}</p>
        <ul v-else class="space-y-0.5">
          <li v-for="m in currentIn" :key="`${m.definitionKey}|${m.version}`"><span class="font-mono">{{ m.definitionKey }}</span> <span class="text-muted-foreground">version {{ m.version ?? '?' }}</span></li>
        </ul>
      </section>

      <section class="rounded-lg border border-border bg-card p-3 space-y-2 text-xs">
        <div class="flex flex-wrap items-center gap-2">
          <h2 class="font-semibold text-sm flex-1">Journey history ({{ RANGES.find((r) => r.days === searched.days)?.label.toLowerCase() }})</h2>
          <DownloadMenu v-if="groups.length || currentIn.length" :get-doc="getDoc" file-name="contact-journeys" />
          <Button v-if="groups.length" variant="outline" size="sm" class="h-7 text-xs" title="Every step as a CSV file" @click="downloadCsv"><FileDown class="h-3.5 w-3.5 mr-1" /> CSV</Button>
          <Button variant="outline" size="sm" class="h-7 text-xs" title="Journey emails this contact was sent, from the _Sent, _JourneyActivity and _Journey data views" @click="openSendsSql"><Database class="h-3.5 w-3.5 mr-1" /> Email sends in Run Query</Button>
        </div>
        <p v-if="history?.error" class="text-red-600">Could not read the journey history: {{ history.error }}. Email sends in Run Query lists the journey emails this contact was sent from the data views instead.<ReportErrorButton /></p>
        <p v-else-if="!groups.length" class="text-muted-foreground">No journey steps for this contact in this period. Journey Builder keeps history for a limited time; Email sends in Run Query looks further back for emails.</p>
        <div v-for="g in groups" :key="g.id" class="rounded-md border border-border">
          <button type="button" class="w-full flex flex-wrap items-center gap-2 px-2 py-1.5 text-left hover:bg-muted/40" :aria-expanded="!!open[g.id]" @click="toggle(g)">
            <ChevronDown v-if="open[g.id]" class="h-3.5 w-3.5" /><ChevronRight v-else class="h-3.5 w-3.5" />
            <span class="font-medium">{{ g.name || g.definitionKey || g.definitionId || 'Journey' }}</span>
            <span v-if="g.version != null" class="text-muted-foreground">version {{ g.version }}</span>
            <span class="text-muted-foreground">{{ g.entries.length }} entr{{ g.entries.length === 1 ? 'y' : 'ies' }}, {{ g.steps.length }} step{{ g.steps.length === 1 ? '' : 's' }}</span>
            <span v-if="g.failed" class="text-red-600">{{ g.failed }} failed</span>
            <span class="ml-auto text-muted-foreground">{{ g.first ? formatDateTime(g.first) : '' }}{{ g.last && g.last !== g.first ? ` to ${formatDateTime(g.last)}` : '' }}</span>
          </button>
          <div v-if="open[g.id]" class="border-t border-border p-2 space-y-2">
            <!-- One flow per entry (feedback #1020); hover a step for its time and status. -->
            <div v-for="(e, n) in g.entries" :key="e.id || n" class="rounded border px-2 py-1.5" :class="(picked[g.id] ?? 0) === n ? 'border-primary/60 bg-primary/5' : 'border-border'">
              <div class="flex flex-wrap items-center gap-2 mb-1">
                <span class="font-medium">Entry {{ g.entries.length - n }}</span>
                <span class="text-muted-foreground">{{ e.first ? formatDateTime(e.first) : '' }}{{ e.last && e.last !== e.first ? ` to ${formatDateTime(e.last)}` : '' }}</span>
                <span v-if="e.failed" class="text-red-600">{{ e.failed }} failed</span>
                <span v-if="e.id" class="text-muted-foreground font-mono text-[10px] truncate max-w-[16rem]" :title="`definitionInstanceId ${e.id}`">{{ e.id }}</span>
                <button v-if="g.entries.length > 1" class="ml-auto text-primary hover:underline disabled:no-underline disabled:text-muted-foreground" :disabled="(picked[g.id] ?? 0) === n" @click="pick(g, n)">{{ (picked[g.id] ?? 0) === n ? 'On the canvas' : 'Show on the canvas' }}</button>
              </div>
              <ol class="flex flex-wrap items-center gap-1" :aria-label="entryFlowText(e)">
                <li v-for="(st, i) in e.steps" :key="i" class="flex items-center gap-1">
                  <span v-if="i" class="text-muted-foreground" aria-hidden="true">&rarr;</span>
                  <span class="px-1.5 py-0.5 rounded border cursor-default" :class="/fail|error/i.test(st.status) ? 'border-red-300 bg-red-50 text-red-700 dark:bg-red-950/40 dark:text-red-300' : 'border-border bg-muted/40'"
                    :title="[st.time ? formatDateTime(st.time) : '', st.activityType, st.status, st.message].filter(Boolean).join(' · ')">{{ stepLabel(st) }}</span>
                </li>
              </ol>
            </div>
            <button class="text-primary hover:underline" @click="showTable = { ...showTable, [g.id]: !showTable[g.id] }">{{ showTable[g.id] ? 'Hide' : 'Show' }} the steps as a table</button>
            <table v-if="showTable[g.id]" class="w-full">
              <thead><tr class="text-left text-muted-foreground border-b border-border"><th class="py-1 pr-3 w-8">#</th><th class="py-1 pr-3">When</th><th class="py-1 pr-3">Step</th><th class="py-1 pr-3">Type</th><th class="py-1 pr-3">Status</th><th class="py-1 pr-3">Message</th></tr></thead>
              <tbody>
                <tr v-for="(st, i) in g.steps" :key="i" class="border-b border-border/50 align-top">
                  <td class="py-1 pr-3 tabular-nums">{{ i + 1 }}</td>
                  <td class="py-1 pr-3 whitespace-nowrap">{{ st.time ? formatDateTime(st.time) : '' }}</td>
                  <td class="py-1 pr-3">{{ stepLabel(st) }}</td>
                  <td class="py-1 pr-3">{{ st.activityType }}</td>
                  <td class="py-1 pr-3" :class="statusClass(st.status)">{{ st.status }}</td>
                  <td class="py-1 pr-3 break-words">{{ st.message }}</td>
                </tr>
              </tbody>
            </table>
            <div v-if="paths[g.id]?.status === 'loading'" class="flex items-center gap-2 text-muted-foreground"><Loader2 class="h-3.5 w-3.5 animate-spin" /> Loading the journey…</div>
            <p v-else-if="paths[g.id]?.status === 'error'" class="text-red-600">Could not draw the path: {{ paths[g.id].error }}<ReportErrorButton /></p>
            <template v-else-if="paths[g.id]?.status === 'ok'">
              <div class="flex items-center gap-2">
                <span class="text-muted-foreground">Entry {{ g.entries.length - (picked[g.id] ?? 0) }}: the contact's path is outlined; numbers are the step order. Other steps are dimmed.</span>
                <RouterLink :to="{ path: `/journeys/${paths[g.id].journeyId}`, query: paths[g.id].version ? { version: paths[g.id].version } : {} }" class="ml-auto inline-flex items-center gap-1 text-primary hover:underline">Open the journey <ExternalLink class="h-3 w-3" /></RouterLink>
              </div>
              <p v-if="paths[g.id].fallback" class="text-amber-700 dark:text-amber-300">Journey Builder did not find the exact version in the history, so this is version {{ paths[g.id].version ?? '?' }} of the journey.</p>
              <p v-if="pathFor(g)?.unmatched.length" class="text-amber-700 dark:text-amber-300">{{ pathFor(g).unmatched.length }} step(s) could not be placed on the canvas (not in this version of the journey).</p>
              <div class="min-w-0">
                <JourneyCanvas :key="picked[g.id] ?? 0" :graph="paths[g.id].graph" :layout="paths[g.id].layout" :visited="pathFor(g).visited" :visited-edges="pathFor(g).visitedEdges" :steps="pathFor(g).steps" />
              </div>
            </template>
          </div>
        </div>
        <template v-if="history?.raw?.length">
          <button class="text-primary hover:underline" @click="showRaw = !showRaw">{{ showRaw ? 'Hide' : 'Show' }} the history as Journey Builder sent it</button>
          <CodeView v-if="showRaw" :code="JSON.stringify(history.raw, null, 2)" lang="json" max-height="384px" />
        </template>
      </section>
    </template>
  </div>
</template>
