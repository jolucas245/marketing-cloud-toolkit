<script setup>
// Home (feedback #1025, like Data Cloud Inspector's Home): where you are connected and
// the state of this business unit at a glance (automations, journeys, what needs a
// look, what you watch), the pages you use most and your recent saved queries.
// Automation and journey figures come from the overview pages' cache, filled by the
// quiet preload (utils/preloadOverviews.js), so Home adds no SFMC calls when that is fresh.
import { computed, onMounted, onUnmounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { Loader2, RefreshCw, Workflow, Route, AlertTriangle, Eye, Bell, Play, Blocks, Footprints, MailCheck, Search, ExternalLink, Bookmark, Clock } from 'lucide-vue-next'
import Button from '@/components/ui/button/Button.vue'
import StatusBadge from '@/components/results/StatusBadge.vue'
import ReportErrorButton from '@/components/results/ReportErrorButton.vue'
import { useStack, whenStack } from '@/composables/useStack.js'
import { fetchCurrentBU } from '@/utils/sfmcApi.js'
import { summarizeAutomations, summarizeJourneys } from '@/utils/overview.js'
import { pageCacheKey, readPageCache } from '@/utils/pageCache.js'
import { preloadOverviews } from '@/utils/preloadOverviews.js'
import { WATCHES_KEY, NOTICES_KEY, watchHere, watchType, unreadCount, automationStatusName } from '@/utils/watches.js'
import { readVisits, mostUsed, recentQueries, sqlLine } from '@/utils/home.js'
import { formatDateTime } from '@/utils/format.js'
import { openInSfmc } from '@/utils/sfmcLinks.js'

const router = useRouter()
const { stack, state } = useStack()
const isMac = /Mac/i.test(navigator.platform || '')

const bu = ref(null)
const autos = ref(null)
const journeys = ref(null)
const savedAt = ref(0)
const loading = ref(false)
const error = ref('')

function readCache() {
  const id = bu.value?.accountId
  const a = readPageCache(pageCacheKey('automation-overview', stack.value, id))
  const j = readPageCache(pageCacheKey('journey-overview', stack.value, id))
  autos.value = a?.list ? summarizeAutomations(a.list) : null
  journeys.value = j?.list ? summarizeJourneys(j.list) : null
  savedAt.value = Math.max(a?.savedAt || 0, j?.savedAt || 0)
}

async function load({ fresh = false } = {}) {
  if (!stack.value) return
  loading.value = true
  error.value = ''
  try {
    bu.value = await fetchCurrentBU(stack.value).catch(() => null)
    readCache()
    if (fresh || !autos.value || !journeys.value) {
      await preloadOverviews(stack.value, fresh ? { maxAgeMs: 0 } : {})
      readCache()
    }
    if (!autos.value && !journeys.value) error.value = 'Could not read the automations and journeys of this business unit. Open Automation overview for the error.'
  } catch (e) {
    error.value = `Could not read this business unit: ${e.message}`
  } finally {
    loading.value = false
  }
}

// Watches and notices (chrome.storage.local), saved queries and page visits.
const watches = ref({})
const notices = ref([])
const queries = ref([])
const visits = ref(readVisits())
const watched = computed(() => Object.values(watches.value).filter((w) => w.stack === stack.value && watchHere(w, bu.value?.accountId)))
const watchedNeedsLook = computed(() => watched.value.filter((w) => w.notFound || w.error || /error|fail/i.test(String(w.last?.lastRunStatus || ''))))
const used = computed(() => mostUsed(visits.value))
function readLocal() {
  try {
    chrome.storage.local.get(null, (raw) => {
      watches.value = raw?.[WATCHES_KEY] || {}
      notices.value = raw?.[NOTICES_KEY] || []
      queries.value = recentQueries(raw)
    })
  } catch { /* not in an extension */ }
}
const onChange = (c, area) => { if (area === 'local' && (WATCHES_KEY in c || NOTICES_KEY in c)) readLocal() }

onMounted(() => {
  readLocal()
  try { chrome.storage.onChanged.addListener(onChange) } catch { /* ignore */ }
  whenStack(() => load())
})
onUnmounted(() => { try { chrome.storage.onChanged.removeListener(onChange) } catch { /* ignore */ } })

const sfmcUrl = computed(() => (stack.value ? `https://mc.${stack.value}.exacttarget.com/cloud/` : 'https://mc.exacttarget.com'))
// countBy (utils/summaries.js) gives [{ label, count }], most first.
const byStatus = (list) => (Array.isArray(list) ? list.map((x) => [x.label, x.count]) : Object.entries(list || {})).sort((a, b) => b[1] - a[1])
const runningCount = computed(() => byStatus(autos.value?.byStatus).filter(([s]) => /^running$/i.test(s)).reduce((t, [, n]) => t + n, 0))
const QUICK = [
  { to: '/queries/workspace', label: 'Run a query', icon: Play },
  { to: '/queries/builder', label: 'Build a query', icon: Blocks },
  { to: '/contact-journeys', label: 'Find a contact in journeys', icon: Footprints },
  { to: '/email-validation', label: 'Validate email addresses', icon: MailCheck },
]
function openQuery(q) { router.push({ path: q.source === 'builder' ? '/queries/builder' : '/queries/workspace', query: { id: q.id } }) }
</script>

<template>
  <div class="h-full overflow-y-auto p-4 space-y-4 text-sm">
    <div class="flex flex-wrap items-center gap-2">
      <h1 class="text-base font-semibold flex-1">Home</h1>
      <span v-if="savedAt" class="text-xs text-muted-foreground">Read {{ formatDateTime(new Date(savedAt).toISOString()) }}</span>
      <Button variant="outline" size="sm" class="h-8 text-xs" :disabled="loading || !stack" @click="load({ fresh: true })">
        <Loader2 v-if="loading" class="h-3.5 w-3.5 mr-1 animate-spin" /><RefreshCw v-else class="h-3.5 w-3.5 mr-1" /> Refresh
      </Button>
    </div>

    <!-- Connection -->
    <section class="rounded-lg border border-border bg-card p-3 flex flex-wrap items-center gap-x-6 gap-y-2">
      <div class="flex items-center gap-2">
        <span class="h-2.5 w-2.5 rounded-full" :class="state === 'connected' ? 'bg-emerald-500' : state === 'detecting' ? 'bg-amber-400' : 'bg-red-500'" />
        <span class="font-medium">{{ state === 'connected' ? 'Connected' : state === 'detecting' ? 'Looking for an SFMC session…' : 'Not connected' }}</span>
      </div>
      <div v-if="stack"><span class="text-muted-foreground">Stack</span> {{ stack }}</div>
      <div v-if="bu"><span class="text-muted-foreground">Business unit</span> {{ bu.name }} <span class="text-muted-foreground">({{ bu.accountId }})</span></div>
      <a :href="sfmcUrl" target="_blank" rel="noopener" class="ml-auto inline-flex items-center gap-1 text-xs text-primary hover:underline" @click="openInSfmc($event, sfmcUrl)">
        <ExternalLink class="h-3 w-3" /> {{ state === 'connected' ? 'Open Marketing Cloud' : 'Log in to Marketing Cloud' }}
      </a>
      <p v-if="state === 'disconnected'" class="basis-full text-xs text-muted-foreground">Log in to Marketing Cloud in a tab of this browser, then come back: the Toolkit uses that session. Everything here is read-only.</p>
    </section>

    <p v-if="error" class="text-red-600 text-xs" role="alert">{{ error }}<ReportErrorButton /></p>

    <!-- At a glance -->
    <div class="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
      <RouterLink to="/automation-overview" class="rounded-lg border border-border bg-card p-3 hover:border-primary/50">
        <div class="flex items-center gap-1.5 text-xs text-muted-foreground"><Workflow class="h-3.5 w-3.5" /> Automations</div>
        <div class="text-2xl font-semibold tabular-nums">{{ autos ? autos.total.toLocaleString() : loading ? '…' : '—' }}</div>
        <div v-if="autos" class="text-xs text-muted-foreground">{{ runningCount }} running now</div>
      </RouterLink>
      <RouterLink to="/automation-overview" class="rounded-lg border border-border bg-card p-3 hover:border-primary/50">
        <div class="flex items-center gap-1.5 text-xs text-muted-foreground"><AlertTriangle class="h-3.5 w-3.5" /> Needs a look</div>
        <div class="text-2xl font-semibold tabular-nums" :class="autos?.attention.length ? 'text-red-600' : ''">{{ autos ? autos.attention.length : loading ? '…' : '—' }}</div>
        <div v-if="autos" class="text-xs text-muted-foreground">{{ autos.failedLastRun }} with a failed last run</div>
      </RouterLink>
      <RouterLink to="/journey-overview" class="rounded-lg border border-border bg-card p-3 hover:border-primary/50">
        <div class="flex items-center gap-1.5 text-xs text-muted-foreground"><Route class="h-3.5 w-3.5" /> Journeys</div>
        <div class="text-2xl font-semibold tabular-nums">{{ journeys ? journeys.total.toLocaleString() : loading ? '…' : '—' }}</div>
        <div v-if="journeys" class="text-xs text-muted-foreground">{{ journeys.live }} live</div>
      </RouterLink>
      <RouterLink to="/automation-overview" class="rounded-lg border border-border bg-card p-3 hover:border-primary/50">
        <div class="flex items-center gap-1.5 text-xs text-muted-foreground"><Eye class="h-3.5 w-3.5" /> Watched here</div>
        <div class="text-2xl font-semibold tabular-nums">{{ watched.length }}</div>
        <div class="text-xs text-muted-foreground flex items-center gap-1"><Bell class="h-3 w-3" /> {{ unreadCount(notices) }} unread notice{{ unreadCount(notices) === 1 ? '' : 's' }}<template v-if="watchedNeedsLook.length">, {{ watchedNeedsLook.length }} to check</template></div>
      </RouterLink>
    </div>

    <div class="grid gap-3 lg:grid-cols-2">
      <!-- Status breakdowns and what needs a look -->
      <section class="rounded-lg border border-border bg-card p-3 space-y-3 text-xs">
        <h2 class="font-semibold text-sm">This business unit</h2>
        <div v-if="loading && !autos && !journeys" class="flex items-center gap-2 text-muted-foreground"><Loader2 class="h-3.5 w-3.5 animate-spin" /> Reading automations and journeys…</div>
        <div v-if="autos">
          <div class="text-muted-foreground mb-1">Automations by status</div>
          <div class="flex flex-wrap gap-2"><span v-for="[s, n] in byStatus(autos.byStatus)" :key="s" class="inline-flex items-center gap-1"><StatusBadge :status="s" /> {{ n }}</span></div>
        </div>
        <div v-if="journeys">
          <div class="text-muted-foreground mb-1">Journeys by status</div>
          <div class="flex flex-wrap gap-2"><span v-for="[s, n] in byStatus(journeys.byStatus)" :key="s" class="inline-flex items-center gap-1"><StatusBadge :status="s" /> {{ n }}</span></div>
        </div>
        <div v-if="autos">
          <div class="text-muted-foreground mb-1">Needs a look</div>
          <p v-if="!autos.attention.length">Nothing: no failed last runs, no automations in error, none running for more than 6 hours.</p>
          <ul v-else class="space-y-0.5">
            <li v-for="x in autos.attention.slice(0, 6)" :key="x.automation.id" class="flex gap-2">
              <RouterLink :to="`/automations/${encodeURIComponent(x.automation.id)}`" class="font-medium hover:underline truncate">{{ x.automation.name }}</RouterLink>
              <span class="text-red-600 shrink-0">{{ x.reason }}</span>
            </li>
            <li v-if="autos.attention.length > 6"><RouterLink to="/automation-overview" class="text-primary hover:underline">All {{ autos.attention.length }} in Automation overview</RouterLink></li>
          </ul>
        </div>
        <div v-if="watchedNeedsLook.length">
          <div class="text-muted-foreground mb-1">Watched automations to check</div>
          <ul class="space-y-0.5">
            <li v-for="w in watchedNeedsLook.slice(0, 5)" :key="w.id" class="flex gap-2">
              <span class="font-medium truncate">{{ w.name }}</span>
              <span class="text-muted-foreground shrink-0">{{ w.notFound ? 'not found in this business unit' : w.error ? 'check failed' : `${automationStatusName(w.last?.status)}, last run ${w.last?.lastRunStatus}` }}</span>
            </li>
          </ul>
        </div>
      </section>

      <div class="space-y-3">
        <!-- Quick start -->
        <section class="rounded-lg border border-border bg-card p-3 text-xs space-y-2">
          <h2 class="font-semibold text-sm">Start</h2>
          <div class="grid grid-cols-2 gap-2">
            <RouterLink v-for="q in QUICK" :key="q.to" :to="q.to" class="flex items-center gap-2 rounded-md border border-border px-2 py-1.5 hover:bg-accent"><component :is="q.icon" class="h-3.5 w-3.5 text-primary" /> {{ q.label }}</RouterLink>
          </div>
          <p class="text-muted-foreground flex items-center gap-1"><Search class="h-3 w-3" /> Press <kbd class="px-1 rounded border border-border">{{ isMac ? '⌘' : 'Ctrl' }}+K</kbd> to search saved queries, emails, data extensions, automations and journeys.</p>
        </section>

        <!-- Most used -->
        <section class="rounded-lg border border-border bg-card p-3 text-xs space-y-2">
          <h2 class="font-semibold text-sm">Most used</h2>
          <p v-if="!used.length" class="text-muted-foreground">The pages you open most will show here.</p>
          <div v-else class="flex flex-wrap gap-2">
            <RouterLink v-for="p in used" :key="p.path" :to="p.path" class="inline-flex items-center gap-1.5 rounded-md border border-border px-2 py-1 hover:bg-accent"><component :is="p.icon" class="h-3.5 w-3.5" /> {{ p.name }}</RouterLink>
          </div>
        </section>

        <!-- Recent saved queries -->
        <section class="rounded-lg border border-border bg-card p-3 text-xs space-y-2">
          <div class="flex items-center gap-2">
            <h2 class="font-semibold text-sm flex-1">Recent queries</h2>
            <RouterLink to="/queries/saved" class="text-primary hover:underline inline-flex items-center gap-1"><Bookmark class="h-3 w-3" /> All saved queries</RouterLink>
          </div>
          <p v-if="!queries.length" class="text-muted-foreground">No saved queries yet. Queries you run or save show here.</p>
          <ul v-else class="space-y-1">
            <li v-for="q in queries" :key="q.id">
              <button class="w-full text-left rounded px-1 py-0.5 hover:bg-accent" :title="q.sql" @click="openQuery(q)">
                <span class="font-medium">{{ q.name || sqlLine(q.sql, 50) }}</span>
                <span class="ml-2 text-muted-foreground inline-flex items-center gap-0.5"><Clock class="h-3 w-3" /> {{ q.at ? formatDateTime(new Date(q.at).toISOString()) : '' }}</span>
                <span v-if="q.name" class="block font-mono text-[11px] text-muted-foreground truncate">{{ sqlLine(q.sql) }}</span>
              </button>
            </li>
          </ul>
        </section>
      </div>
    </div>
  </div>
</template>
