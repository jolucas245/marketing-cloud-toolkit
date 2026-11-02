<script setup>
// Contact journeys: one contact across every journey, or within one journey. Lists
// the journeys the contact is in now and the ones it went through, and for each the
// path it took: its steps in order and the same path on the journey's canvas.
// Read-only. The history items' field names are not confirmed live (utils/contactJourneys.js).
import { computed, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import { Loader2, Search, Route as RouteIcon, ChevronDown, ChevronRight, ExternalLink, Database, X } from 'lucide-vue-next'
import Button from '@/components/ui/button/Button.vue'
import Input from '@/components/ui/input/Input.vue'
import JourneyCanvas from '@/components/journey/JourneyCanvas.vue'
import StatusBadge from '@/components/results/StatusBadge.vue'
import SfmcErrorNotice from '@/components/results/SfmcErrorNotice.vue'
import { useStack } from '@/composables/useStack.js'
import { withReconnect, searchError } from '@/utils/sfmcErrors.js'
import { searchJourneys, fetchJourney, journeyGraph, layoutJourney } from '@/utils/journeys.js'
import { fetchContactMembership, fetchContactHistory, groupByJourney, matchSteps, pathOnGraph, stepNumbers, journeySendsSql, stepLabel, RANGES } from '@/utils/contactJourneys.js'
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
    try { jResults.value = (await searchJourneys(stack.value, { query: q.trim() })).items.slice(0, 20) }
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

async function find() {
  const key = contactKey.value.trim()
  if (!key) { error.value = 'Enter a Contact Key.'; return }
  if (scope.value === 'one' && !journey.value) { error.value = 'Pick the journey.'; return }
  error.value = ''
  busy.value = true
  membership.value = null
  history.value = null
  open.value = {}
  paths.value = {}
  searched.value = { key, scope: scope.value, journey: journey.value, days: days.value }
  const [m, h] = await Promise.allSettled([
    withReconnect(stack.value, () => fetchContactMembership(stack.value, key)),
    withReconnect(stack.value, () => fetchContactHistory(stack.value, key, { days: days.value })),
  ])
  membership.value = m.status === 'fulfilled' ? m.value : { error: m.reason?.message || String(m.reason) }
  history.value = h.status === 'fulfilled' ? h.value : { error: h.reason?.message || String(h.reason) }
  busy.value = false
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
const paths = ref({}) // id → { status, graph, layout, visited, visitedEdges, steps, unmatched, error, journeyId }
async function toggle(g) {
  open.value = { ...open.value, [g.id]: !open.value[g.id] }
  if (!open.value[g.id] || paths.value[g.id]) return
  paths.value = { ...paths.value, [g.id]: { status: 'loading' } }
  try {
    const id = g.definitionId || g.definitionKey
    if (!id) throw new Error('The history does not say which journey this is.')
    const def = await withReconnect(stack.value, () => fetchJourney(stack.value, id, g.version))
    const graph = journeyGraph(def)
    const layout = layoutJourney(graph)
    const { keys, unmatched, ended } = matchSteps(def, g.steps)
    const { nodes, edges } = pathOnGraph(graph, keys, { ended })
    paths.value = { ...paths.value, [g.id]: { status: 'ok', graph, layout, visited: nodes, visitedEdges: edges, steps: stepNumbers(keys), unmatched, journeyId: def.id, version: def.version, name: def.name } }
  } catch (e) {
    paths.value = { ...paths.value, [g.id]: { status: 'error', error: e.message } }
  }
}

function openSendsSql() {
  router.push({ path: '/queries/workspace', query: { sql: journeySendsSql(searched.value?.key || contactKey.value.trim()) } })
}
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
            <button v-for="j in jResults" :key="j.id" type="button" class="w-full flex items-center gap-1.5 px-1 py-1 rounded text-left hover:bg-muted" @click="journey = { id: j.id, key: j.key, name: j.name, version: j.version }; jQuery = ''">
              <RouteIcon class="h-3 w-3 shrink-0" /><span class="truncate flex-1">{{ j.name }}</span><StatusBadge :status="j.status" />
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
        <p v-if="membership?.error" class="text-red-600">Could not read the journeys this contact is in: {{ membership.error }}</p>
        <p v-else-if="!currentIn.length" class="text-muted-foreground">{{ searched.scope === 'one' ? 'Not in this journey now.' : 'Not in any journey now.' }}</p>
        <ul v-else class="space-y-0.5">
          <li v-for="m in currentIn" :key="`${m.definitionKey}|${m.version}`"><span class="font-mono">{{ m.definitionKey }}</span> <span class="text-muted-foreground">version {{ m.version ?? '?' }}</span></li>
        </ul>
      </section>

      <section class="rounded-lg border border-border bg-card p-3 space-y-2 text-xs">
        <div class="flex flex-wrap items-center gap-2">
          <h2 class="font-semibold text-sm flex-1">Journey history ({{ RANGES.find((r) => r.days === searched.days)?.label.toLowerCase() }})</h2>
          <Button variant="outline" size="sm" class="h-7 text-xs" title="Journey emails this contact was sent, from the _Sent, _JourneyActivity and _Journey data views" @click="openSendsSql"><Database class="h-3.5 w-3.5 mr-1" /> Email sends in Run Query</Button>
        </div>
        <p v-if="history?.error" class="text-red-600">Could not read the journey history: {{ history.error }}. Email sends in Run Query lists the journey emails this contact was sent from the data views instead.</p>
        <p v-else-if="!groups.length" class="text-muted-foreground">No journey steps for this contact in this period. Journey Builder keeps history for a limited time; Email sends in Run Query looks further back for emails.</p>
        <div v-for="g in groups" :key="g.id" class="rounded-md border border-border">
          <button type="button" class="w-full flex flex-wrap items-center gap-2 px-2 py-1.5 text-left hover:bg-muted/40" :aria-expanded="!!open[g.id]" @click="toggle(g)">
            <ChevronDown v-if="open[g.id]" class="h-3.5 w-3.5" /><ChevronRight v-else class="h-3.5 w-3.5" />
            <span class="font-medium">{{ g.name || g.definitionKey || g.definitionId || 'Journey' }}</span>
            <span v-if="g.version != null" class="text-muted-foreground">version {{ g.version }}</span>
            <span class="text-muted-foreground">{{ g.steps.length }} step{{ g.steps.length === 1 ? '' : 's' }}</span>
            <span v-if="g.failed" class="text-red-600">{{ g.failed }} failed</span>
            <span class="ml-auto text-muted-foreground">{{ g.first ? formatDateTime(g.first) : '' }}{{ g.last && g.last !== g.first ? ` to ${formatDateTime(g.last)}` : '' }}</span>
          </button>
          <div v-if="open[g.id]" class="border-t border-border p-2 space-y-2">
            <table class="w-full">
              <thead><tr class="text-left text-muted-foreground border-b border-border"><th class="py-1 pr-3 w-8">#</th><th class="py-1 pr-3">When</th><th class="py-1 pr-3">Step</th><th class="py-1 pr-3">Type</th><th class="py-1 pr-3">Status</th><th class="py-1 pr-3">Message</th></tr></thead>
              <tbody>
                <tr v-for="(s, i) in g.steps" :key="i" class="border-b border-border/50 align-top">
                  <td class="py-1 pr-3 tabular-nums">{{ i + 1 }}</td>
                  <td class="py-1 pr-3 whitespace-nowrap">{{ s.time ? formatDateTime(s.time) : '' }}</td>
                  <td class="py-1 pr-3">{{ stepLabel(s) }}</td>
                  <td class="py-1 pr-3">{{ s.activityType }}</td>
                  <td class="py-1 pr-3" :class="statusClass(s.status)">{{ s.status }}</td>
                  <td class="py-1 pr-3 break-words">{{ s.message }}</td>
                </tr>
              </tbody>
            </table>
            <div v-if="paths[g.id]?.status === 'loading'" class="flex items-center gap-2 text-muted-foreground"><Loader2 class="h-3.5 w-3.5 animate-spin" /> Loading the journey…</div>
            <p v-else-if="paths[g.id]?.status === 'error'" class="text-red-600">Could not draw the path: {{ paths[g.id].error }}</p>
            <template v-else-if="paths[g.id]?.status === 'ok'">
              <div class="flex items-center gap-2">
                <span class="text-muted-foreground">The contact's path is outlined; numbers are the step order. Other steps are dimmed.</span>
                <RouterLink :to="{ path: `/journeys/${paths[g.id].journeyId}`, query: paths[g.id].version ? { version: paths[g.id].version } : {} }" class="ml-auto inline-flex items-center gap-1 text-primary hover:underline">Open the journey <ExternalLink class="h-3 w-3" /></RouterLink>
              </div>
              <p v-if="paths[g.id].unmatched.length" class="text-amber-700 dark:text-amber-300">{{ paths[g.id].unmatched.length }} step(s) could not be placed on the canvas (not in this version of the journey).</p>
              <div class="overflow-auto max-h-[60vh] rounded-lg border border-border bg-[radial-gradient(circle,hsl(var(--border))_1px,transparent_1px)] bg-size-[16px_16px]">
                <JourneyCanvas :graph="paths[g.id].graph" :layout="paths[g.id].layout" :visited="paths[g.id].visited" :visited-edges="paths[g.id].visitedEdges" :steps="paths[g.id].steps" />
              </div>
            </template>
          </div>
        </div>
        <template v-if="history?.raw?.length">
          <button class="text-primary hover:underline" @click="showRaw = !showRaw">{{ showRaw ? 'Hide' : 'Show' }} the history as Journey Builder sent it</button>
          <pre v-if="showRaw" class="max-h-96 overflow-auto rounded bg-muted p-2 text-[11px]">{{ JSON.stringify(history.raw, null, 2) }}</pre>
        </template>
      </section>
    </template>
  </div>
</template>
