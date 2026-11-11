<script setup>
import QueryStudioNotice from '@/components/shell/QueryStudioNotice.vue'
import SecretAlerts from '@/components/shell/SecretAlerts.vue'
import HomeBlock from '@/components/home/HomeBlock.vue'
// Home (feedback #1025, like Data Cloud Inspector's Home): where you are connected and
// the state of this business unit at a glance (automations, journeys, what needs a
// look, what you watch), the pages you use most and your recent saved queries.
// Automation and journey figures come from the overview pages' cache, filled by the
// quiet preload (utils/preloadOverviews.js), so Home adds no SFMC calls when that is fresh.
// Sections and cards can be hidden, shown and reordered (Customize Home, user 2026-11-06);
// the layout stays in chrome.storage.local (utils/homeLayout.js) and is never sent.
import { computed, onMounted, onUnmounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { Loader2, RefreshCw, Workflow, Route, AlertTriangle, Eye, Bell, Play, Blocks, Footprints, MailCheck, Search, ExternalLink, Bookmark, Clock, Sparkles, CheckCircle2, Network, LayoutGrid, RotateCcw } from 'lucide-vue-next'
import Button from '@/components/ui/button/Button.vue'
import ReportErrorButton from '@/components/results/ReportErrorButton.vue'
import { useStack, whenStack } from '@/composables/useStack.js'
import { fetchCurrentBU } from '@/utils/sfmcApi.js'
import { summarizeAutomations, summarizeJourneys } from '@/utils/overview.js'
import { pageCacheKey, readPageCache } from '@/utils/pageCache.js'
import { preloadOverviews } from '@/utils/preloadOverviews.js'
import { WATCHES_KEY, NOTICES_KEY, watchHere, unreadCount } from '@/utils/watches.js'
import { readVisits, mostUsed, recentQueries, sqlLine } from '@/utils/home.js'
import { formatDateTime } from '@/utils/format.js'
import { openInSfmc } from '@/utils/sfmcLinks.js'
import { useAi } from '@/composables/useAi.js'
import { openPalette } from '@/composables/usePalette.js'
import { provideHomeLayout } from '@/composables/useHomeLayout.js'
import { coreOrigin } from '@/utils/sfmcHosts.js'

const router = useRouter()
const { stack, state } = useStack()
const isMac = /Mac/i.test(navigator.platform || '')
const home = provideHomeLayout()

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

const sfmcUrl = computed(() => (stack.value ? `${coreOrigin(stack.value)}/cloud/` : 'https://mc.exacttarget.com'))
// countBy (utils/summaries.js) gives [{ label, count }], most first.
const byStatus = (list) => (Array.isArray(list) ? list.map((x) => [x.label, x.count]) : Object.entries(list || {})).sort((a, b) => b[1] - a[1])
const runningCount = computed(() => byStatus(autos.value?.byStatus).filter(([s]) => /^running$/i.test(s)).reduce((t, [, n]) => t + n, 0))
// Good places to start (redesign, feedback #1031), by layout id (utils/homeLayout.js).
const STARTS = computed(() => ({
  runQuery: { to: '/queries/workspace', label: 'Run a query', desc: 'Write SQL against your data extensions and see the rows straight away.', icon: Play, tone: 'blue' },
  buildQuery: { to: '/queries/builder', label: 'Build a query', desc: 'Pick data extensions and fields, and let the builder write the SQL.', icon: Blocks, tone: 'blue' },
  contactJourneys: { to: '/contact-journeys', label: 'Find a contact in journeys', desc: 'See every journey a contact is in, and where they are now.', icon: Footprints, tone: 'orange' },
  emailValidation: { to: '/email-validation', label: 'Validate email addresses', desc: 'Check a list of addresses for syntax, domain and mailbox problems.', icon: MailCheck, tone: 'teal' },
  whereUsed: { to: '/where-used', label: 'Where used', desc: 'Find every query, automation and journey that touches a data extension.', icon: Network, tone: 'teal' },
  automationList: { to: '/automations', label: 'Automations', desc: autos.value ? `Status, schedules and last runs for all ${autos.value.total.toLocaleString()} automations.` : 'Status, schedules and last runs of your automations.', icon: Workflow, tone: 'purple' },
}))
const GLANCE_LABELS = { automations: 'Automations', journeys: 'Journeys', needsLook: 'Needs a look', watched: 'Watched here' }
const TONES = {
  blue: 'bg-[#EAF1FE] text-[#1D4ED8] dark:bg-blue-950/50 dark:text-blue-300',
  orange: 'bg-[#FFF1E7] text-[#C2410C] dark:bg-orange-950/50 dark:text-orange-300',
  teal: 'bg-[#E6F6F4] text-[#0F766E] dark:bg-teal-950/50 dark:text-teal-300',
  purple: 'bg-[#F3EEFF] text-[#6D28D9] dark:bg-violet-950/50 dark:text-violet-300',
  green: 'bg-[#E8F7EE] text-[#15803D] dark:bg-green-950/50 dark:text-green-300',
  red: 'bg-red-50 text-red-700 dark:bg-red-950/50 dark:text-red-300',
  sky: 'bg-[#E0F2FE] text-[#0369A1] dark:bg-sky-950/50 dark:text-sky-300',
}
// Status bar colours (the overview pages' statuses).
const STATUS_COLORS = [
  [/^running|building/i, '#0EA5E9'], [/^scheduled|^ready|^active/i, '#7C3AED'], [/^published|^live|^running/i, '#16A34A'],
  [/^paused|^inactive|^awaiting/i, '#F59E0B'], [/^error|^stopped|^failed/i, '#DC2626'], [/^draft|^new/i, '#9CA3AF'],
]
const statusColor = (label, journey = false) => {
  if (journey && /^published/i.test(label)) return '#16A34A'
  if (journey && /^stopped/i.test(label)) return '#DC2626'
  return (STATUS_COLORS.find(([re]) => re.test(String(label || ''))) || [null, '#64748B'])[1]
}
const bars = (list, journey) => {
  const rows = byStatus(list)
  const total = rows.reduce((t, [, n]) => t + n, 0) || 1
  return rows.map(([label, n]) => ({ label, n, pct: (n / total) * 100, color: statusColor(label, journey) }))
}
// Home search: the Ctrl+K palette with the text typed here. "Try" offers recent saved queries.
const homeSearch = ref('')
function searchAll(text = homeSearch.value) { openPalette(text) }
// One chip per name: two saved queries can share one (live test, 2026-11-08).
const tryChips = computed(() => [...new Set(queries.value.map((q) => q.name).filter(Boolean))].slice(0, 3))
// Describe the query you need (feedback #1029): opens Run Query with AI Assist asking.
const ai = useAi()
const aiAsk = ref('')
function askAi() {
  const text = aiAsk.value.trim()
  if (!text) return
  router.push({ path: '/queries/workspace', query: { ai: text } })
  aiAsk.value = ''
}
function openQuery(q) { router.push({ path: q.source === 'builder' ? '/queries/builder' : '/queries/workspace', query: { id: q.id } }) }
</script>

<template>
  <div class="h-full overflow-y-auto">
    <div class="max-w-[1180px] mx-auto px-4 sm:px-8 pt-6 pb-16 flex flex-col gap-5 text-sm">
      <!-- Search (redesign, feedback #1031) -->
      <section class="relative flex flex-col items-center gap-3.5 pt-6 pb-2 text-center">
        <div aria-hidden="true" class="absolute top-10 left-1/2 -translate-x-1/2 w-[640px] max-w-full h-44 rounded-full bg-primary/10 blur-[56px]" />
        <h1 class="relative m-0 text-[30px] leading-9 font-bold tracking-tight">Marketing Cloud Toolkit</h1>
        <p class="relative m-0 text-[15px] text-muted-foreground">
          Find anything<template v-if="bu"> in <span class="font-semibold text-foreground">{{ bu.name }}</span></template>: saved queries, emails, data extensions, automations and journeys.
        </p>
        <form class="relative w-full max-w-[720px] flex items-center gap-3 h-14 pl-5 pr-2.5 rounded-full border border-primary/25 bg-card shadow-[0_0_0_6px_hsl(var(--primary)/0.08),0_18px_40px_-24px_hsl(var(--primary)/0.6)]" role="search" @submit.prevent="searchAll()">
          <label for="home-search" class="sr-only">Search Marketing Cloud</label>
          <Search class="h-5 w-5 text-primary shrink-0" />
          <input id="home-search" v-model="homeSearch" type="text" placeholder="Search by name, key or SQL text" class="flex-1 min-w-0 border-0 outline-none bg-transparent text-base" />
          <kbd class="hidden sm:inline text-xs px-2 py-0.5 border border-border rounded-md text-muted-foreground font-sans">{{ isMac ? '⌘' : 'Ctrl' }} K</kbd>
          <button type="submit" class="h-10 px-4 rounded-full bg-primary text-primary-foreground font-semibold text-sm whitespace-nowrap hover:bg-primary/90">Search</button>
        </form>
        <div v-if="tryChips.length" class="relative flex flex-wrap items-center justify-center gap-2 text-[13px] text-muted-foreground">
          Try:
          <button v-for="c in tryChips" :key="c" type="button" class="h-[30px] px-3 rounded-full border border-border bg-card text-[13px] text-foreground/80 inline-flex items-center gap-1.5 hover:bg-accent" @click="searchAll(c)">
            <Bookmark class="h-3.5 w-3.5" /> {{ c }}
          </button>
        </div>
      </section>

      <SecretAlerts variant="home" />
      <QueryStudioNotice />

      <!-- Customize Home (user, 2026-11-06): hide, show and reorder sections and cards. Kept on this computer only. -->
      <div v-if="!home.customizing.value" class="flex justify-end -mb-2">
        <button type="button" class="h-8 px-3 rounded-full text-[13px] text-muted-foreground inline-flex items-center gap-1.5 hover:bg-accent hover:text-foreground" data-customize-home @click="home.customizing.value = true">
          <LayoutGrid class="h-4 w-4" /> Customize Home<template v-if="home.layout.value.hidden.length"> · {{ home.layout.value.hidden.length }} hidden</template>
        </button>
      </div>
      <div v-else class="sticky top-0 z-20 flex flex-wrap items-center gap-3 rounded-[14px] border border-primary/30 bg-card px-4 py-2.5 shadow-sm" role="region" aria-label="Customize Home" data-customize-bar>
        <LayoutGrid class="h-4 w-4 text-primary" />
        <span class="flex-1 min-w-0 text-[13px]">Drag sections and cards, or use the arrows, to reorder them. The eye hides or shows one. Saved on this computer.</span>
        <button type="button" class="h-8 px-3 rounded-full border border-border bg-card text-[13px] inline-flex items-center gap-1.5 hover:bg-accent disabled:opacity-50" :disabled="home.isDefault.value" data-reset-home @click="home.reset()"><RotateCcw class="h-3.5 w-3.5" /> Reset to default</button>
        <button type="button" class="h-8 px-4 rounded-full bg-primary text-primary-foreground text-[13px] font-semibold hover:bg-primary/90" data-customize-done @click="home.customizing.value = false">Done</button>
      </div>

      <p v-if="error" class="text-red-600 text-xs" role="alert">{{ error }}<ReportErrorButton /></p>

      <template v-for="sid in home.ids('sections')" :key="sid">
        <!-- Describe the query you need (AI, experimental) -->
        <HomeBlock v-if="sid === 'ai' && ai.shown.value" group="sections" id="ai" label="Describe the query you need" vertical>
          <form class="flex flex-wrap items-center gap-2 rounded-[14px] border border-border bg-card px-4 py-3" @submit.prevent="askAi">
            <label for="home-ai" class="flex flex-wrap items-center gap-1.5 font-medium">
              <Sparkles class="h-4 w-4 text-primary" /> Describe the query you need
              <span class="rounded bg-amber-200 text-amber-900 px-1.5 py-0.5 text-[10px] font-medium">Experimental</span>
            </label>
            <input id="home-ai" v-model="aiAsk" class="w-full sm:w-auto sm:flex-1 min-w-0 sm:min-w-60 h-9 rounded-lg border border-border bg-background px-3 text-sm" placeholder="For example: subscribers who opened an email in the last 30 days but never clicked" />
            <button type="submit" class="h-9 px-4 rounded-full border border-border bg-card font-medium inline-flex items-center gap-1.5 hover:bg-accent disabled:opacity-50" :disabled="!aiAsk.trim()"><Sparkles class="h-4 w-4 text-primary" /> Ask AI</button>
            <p class="basis-full m-0 text-xs text-muted-foreground">Opens Run Query and asks Gemini Nano in Chrome to write it. The model runs on this computer; nothing is sent over the network. You see the SQL before anything runs.</p>
          </form>
        </HomeBlock>

        <HomeBlock v-else-if="sid === 'connection'" group="sections" id="connection" label="Connection" vertical>
          <section class="flex flex-wrap items-center gap-x-5 gap-y-2 rounded-[14px] border border-border bg-card px-4 py-3">
            <span class="inline-flex items-center gap-1.5 whitespace-nowrap">
              <span class="h-2 w-2 rounded-full" :class="state === 'connected' ? 'bg-green-600' : state === 'detecting' ? 'bg-amber-400' : 'bg-red-500'" />
              <span class="font-semibold">{{ state === 'connected' ? 'Connected' : state === 'detecting' ? 'Looking for an SFMC session…' : 'Not connected' }}</span>
            </span>
            <span v-if="stack" class="text-muted-foreground">Stack <span class="font-semibold text-foreground">{{ stack }}</span></span>
            <span v-if="bu" class="text-muted-foreground">Business unit <span class="font-semibold text-foreground">{{ bu.name }}</span> <code class="font-mono text-xs text-muted-foreground">{{ bu.accountId }}</code></span>
            <span class="ml-auto flex flex-wrap items-center gap-3">
              <span v-if="savedAt" class="text-xs text-muted-foreground">Read {{ formatDateTime(new Date(savedAt).toISOString()) }}</span>
              <button class="h-[34px] px-3.5 rounded-full border border-border bg-card font-medium inline-flex items-center gap-1.5 hover:bg-accent disabled:opacity-50" :disabled="loading || !stack" @click="load({ fresh: true })">
                <Loader2 v-if="loading" class="h-4 w-4 animate-spin" /><RefreshCw v-else class="h-4 w-4" /> Refresh
              </button>
              <a :href="sfmcUrl" target="_blank" rel="noopener" class="inline-flex items-center gap-1 font-medium text-primary hover:underline" @click="openInSfmc($event, sfmcUrl)">
                {{ state === 'connected' ? 'Open Marketing Cloud' : 'Log in to Marketing Cloud' }} <ExternalLink class="h-3.5 w-3.5" />
              </a>
            </span>
            <p v-if="state === 'disconnected'" class="basis-full m-0 text-xs text-muted-foreground">Log in to Marketing Cloud in a tab of this browser, then come back: the Toolkit uses that session. Everything here is read-only.</p>
          </section>
        </HomeBlock>

        <!-- At a glance -->
        <HomeBlock v-else-if="sid === 'glance' && (home.customizing.value || home.ids('glance').length)" group="sections" id="glance" label="At a glance" vertical container>
          <div class="grid gap-3.5 grid-cols-[repeat(auto-fit,minmax(240px,1fr))]">
            <HomeBlock v-for="cid in home.ids('glance')" :key="cid" group="glance" :id="cid" :label="GLANCE_LABELS[cid]">
              <RouterLink v-if="cid === 'automations'" to="/automation-overview" class="h-full rounded-[14px] border border-border bg-card p-4 flex flex-col gap-2.5 min-w-0 hover:border-primary/40">
                <span class="flex items-center justify-between gap-2"><span class="text-[13px] text-muted-foreground">Automations</span><span class="h-[30px] w-[30px] rounded-xl flex items-center justify-center" :class="TONES.purple"><Workflow class="h-4 w-4" /></span></span>
                <span class="flex items-baseline gap-2"><span class="text-[30px] leading-[34px] font-bold tracking-tight tabular-nums">{{ autos ? autos.total.toLocaleString() : loading ? '…' : '—' }}</span><span v-if="autos" class="text-[13px] text-muted-foreground">{{ runningCount }} running now</span></span>
                <template v-if="autos">
                  <div class="flex h-2 rounded overflow-hidden gap-0.5" role="img" :aria-label="bars(autos.byStatus).map((b) => `${b.label} ${b.n}`).join(', ')">
                    <span v-for="b in bars(autos.byStatus)" :key="b.label" class="min-w-1" :style="{ width: `${b.pct}%`, background: b.color }" />
                  </div>
                  <div class="flex flex-wrap gap-x-2.5 gap-y-1"><span v-for="b in bars(autos.byStatus)" :key="b.label" class="inline-flex items-center gap-1 text-xs text-foreground/80"><span class="h-[7px] w-[7px] rounded-full" :style="{ background: b.color }" />{{ b.label }} <b class="text-foreground">{{ b.n }}</b></span></div>
                </template>
              </RouterLink>
              <RouterLink v-else-if="cid === 'journeys'" to="/journey-overview" class="h-full rounded-[14px] border border-border bg-card p-4 flex flex-col gap-2.5 min-w-0 hover:border-primary/40">
                <span class="flex items-center justify-between gap-2"><span class="text-[13px] text-muted-foreground">Journeys</span><span class="h-[30px] w-[30px] rounded-xl flex items-center justify-center" :class="TONES.orange"><Route class="h-4 w-4" /></span></span>
                <span class="flex items-baseline gap-2"><span class="text-[30px] leading-[34px] font-bold tracking-tight tabular-nums">{{ journeys ? journeys.total.toLocaleString() : loading ? '…' : '—' }}</span><span v-if="journeys" class="text-[13px] text-muted-foreground">{{ journeys.live }} live</span></span>
                <template v-if="journeys">
                  <div class="flex h-2 rounded overflow-hidden gap-0.5" role="img" :aria-label="bars(journeys.byStatus, true).map((b) => `${b.label} ${b.n}`).join(', ')">
                    <span v-for="b in bars(journeys.byStatus, true)" :key="b.label" class="min-w-1" :style="{ width: `${b.pct}%`, background: b.color }" />
                  </div>
                  <div class="flex flex-wrap gap-x-2.5 gap-y-1"><span v-for="b in bars(journeys.byStatus, true)" :key="b.label" class="inline-flex items-center gap-1 text-xs text-foreground/80"><span class="h-[7px] w-[7px] rounded-full" :style="{ background: b.color }" />{{ b.label }} <b class="text-foreground">{{ b.n }}</b></span></div>
                </template>
              </RouterLink>
              <RouterLink v-else-if="cid === 'needsLook'" to="/automation-overview" class="h-full rounded-[14px] border border-border bg-card p-4 flex flex-col gap-2.5 min-w-0 hover:border-primary/40">
                <span class="flex items-center justify-between gap-2"><span class="text-[13px] text-muted-foreground">Needs a look</span><span class="h-[30px] w-[30px] rounded-xl flex items-center justify-center" :class="autos?.attention.length ? TONES.red : TONES.green"><AlertTriangle v-if="autos?.attention.length" class="h-4 w-4" /><CheckCircle2 v-else class="h-4 w-4" /></span></span>
                <span class="flex items-baseline gap-2"><span class="text-[30px] leading-[34px] font-bold tracking-tight tabular-nums" :class="autos?.attention.length ? 'text-red-600' : ''">{{ autos ? autos.attention.length : loading ? '…' : '—' }}</span><span v-if="autos" class="text-[13px] text-muted-foreground">{{ autos.attention.length ? `${autos.failedLastRun} with a failed last run` : 'all clear' }}</span></span>
                <span v-if="autos && !autos.attention.length" class="text-xs text-foreground/80 leading-[18px]">No failed last runs, no automations in error, none running for more than 6 hours.</span>
                <ul v-else-if="autos" class="space-y-0.5 text-xs">
                  <li v-for="x in autos.attention.slice(0, 3)" :key="x.automation.id" class="flex gap-2 min-w-0"><span class="font-medium truncate">{{ x.automation.name }}</span><span class="text-red-600 shrink-0">{{ x.reason }}</span></li>
                  <li v-if="autos.attention.length > 3" class="text-primary">and {{ autos.attention.length - 3 }} more</li>
                </ul>
              </RouterLink>
              <RouterLink v-else-if="cid === 'watched'" to="/automation-overview" class="h-full rounded-[14px] border border-border bg-card p-4 flex flex-col gap-2.5 min-w-0 hover:border-primary/40">
                <span class="flex items-center justify-between gap-2"><span class="text-[13px] text-muted-foreground">Watched here</span><span class="h-[30px] w-[30px] rounded-xl flex items-center justify-center" :class="TONES.sky"><Eye class="h-4 w-4" /></span></span>
                <span class="flex items-baseline gap-2"><span class="text-[30px] leading-[34px] font-bold tracking-tight tabular-nums">{{ watched.length }}</span><span v-if="watchedNeedsLook.length" class="text-[13px] text-red-600">{{ watchedNeedsLook.length }} to check</span></span>
                <span class="flex items-start gap-1.5 text-xs text-foreground/80 leading-[18px]"><Bell class="h-3.5 w-3.5 mt-0.5 shrink-0" /> {{ unreadCount(notices) }} unread notice{{ unreadCount(notices) === 1 ? '' : 's' }}<template v-if="!watched.length"> · watch an automation or journey to get notified here</template></span>
                <ul v-if="watchedNeedsLook.length" class="space-y-0.5 text-xs">
                  <li v-for="w in watchedNeedsLook.slice(0, 3)" :key="w.id" class="flex gap-2 min-w-0"><span class="font-medium truncate">{{ w.name }}</span><span class="text-muted-foreground shrink-0">{{ w.notFound ? 'not found here' : w.error ? 'check failed' : `last run ${w.last?.lastRunStatus}` }}</span></li>
                </ul>
              </RouterLink>
            </HomeBlock>
          </div>
          <p v-if="loading && !autos && !journeys" class="flex items-center gap-2 text-xs text-muted-foreground"><Loader2 class="h-3.5 w-3.5 animate-spin" /> Reading automations and journeys…</p>
        </HomeBlock>

        <!-- Good places to start -->
        <HomeBlock v-else-if="sid === 'starts' && (home.customizing.value || home.ids('starts').length)" group="sections" id="starts" label="Good places to start" vertical container>
          <section class="flex flex-col gap-3">
            <h2 class="m-0 text-base font-semibold">Good places to start</h2>
            <div class="grid gap-3.5 grid-cols-[repeat(auto-fit,minmax(260px,1fr))]">
              <HomeBlock v-for="cid in home.ids('starts')" :key="cid" group="starts" :id="cid" :label="STARTS[cid].label">
                <RouterLink :to="STARTS[cid].to" class="h-full rounded-[14px] border border-border bg-card p-4 flex gap-3.5 items-start hover:border-primary/40">
                  <span class="h-10 w-10 shrink-0 rounded-xl flex items-center justify-center" :class="TONES[STARTS[cid].tone]"><component :is="STARTS[cid].icon" class="h-5 w-5" /></span>
                  <span class="flex flex-col gap-1 min-w-0"><span class="text-[15px] font-semibold">{{ STARTS[cid].label }}</span><span class="text-[13px] text-muted-foreground leading-[19px]">{{ STARTS[cid].desc }}</span></span>
                </RouterLink>
              </HomeBlock>
            </div>
          </section>
        </HomeBlock>

        <!-- Recent queries and Jump back in -->
        <HomeBlock v-else-if="sid === 'lists' && (home.customizing.value || home.ids('lists').length)" group="sections" id="lists" label="Recent queries and pages" vertical container>
          <div class="grid gap-5 items-start grid-cols-[repeat(auto-fit,minmax(min(400px,100%),1fr))]">
            <HomeBlock v-for="cid in home.ids('lists')" :key="cid" group="lists" :id="cid" :label="cid === 'recentQueries' ? 'Recent queries' : 'Jump back in'">
              <section v-if="cid === 'recentQueries'" class="rounded-[14px] border border-border bg-card overflow-hidden">
                <div class="flex items-center justify-between gap-2 px-4 py-3.5 border-b border-border/60">
                  <h2 class="m-0 text-base font-semibold">Recent queries</h2>
                  <RouterLink to="/queries/saved" class="text-[13px] font-semibold text-primary inline-flex items-center gap-1 hover:underline"><Bookmark class="h-3.5 w-3.5" /> All saved queries</RouterLink>
                </div>
                <p v-if="!queries.length" class="px-4 py-3.5 text-muted-foreground">No saved queries yet. Queries you run or save show here.</p>
                <div v-for="(q, i) in queries" :key="q.id" class="px-4 py-3.5 flex gap-3.5 items-start" :class="i ? 'border-t border-border/60' : ''">
                  <span class="h-9 w-9 shrink-0 rounded-xl flex items-center justify-center" :class="TONES.blue"><component :is="q.source === 'builder' ? Blocks : Bookmark" class="h-[18px] w-[18px]" /></span>
                  <div class="flex-1 min-w-0 flex flex-col gap-1.5">
                    <span class="flex flex-wrap items-center gap-2.5"><span class="text-[15px] font-semibold truncate">{{ q.name || sqlLine(q.sql, 50) }}</span><span class="inline-flex items-center gap-1 text-xs text-muted-foreground"><Clock class="h-3 w-3" /> {{ q.at ? formatDateTime(new Date(q.at).toISOString()) : '' }}</span></span>
                    <code class="block font-mono text-xs text-foreground/80 bg-background border border-border/60 rounded-lg px-2.5 py-2 truncate" :title="q.sql">{{ sqlLine(q.sql, 90) }}</code>
                  </div>
                  <div class="flex gap-1.5 shrink-0">
                    <button class="h-[34px] px-3.5 rounded-full border border-border bg-card font-medium inline-flex items-center gap-1.5 hover:bg-accent" :title="q.source === 'builder' ? 'Open in Query Builder' : 'Open in Run Query'" @click="openQuery(q)"><ExternalLink class="h-4 w-4" /> Open</button>
                  </div>
                </div>
              </section>
              <section v-else class="rounded-[14px] border border-border bg-card px-4 py-3.5 flex flex-col gap-3">
                <h2 class="m-0 text-base font-semibold">Jump back in</h2>
                <p v-if="!used.length" class="m-0 text-muted-foreground">The pages you open most will show here.</p>
                <div v-else class="flex flex-wrap gap-2">
                  <RouterLink v-for="p in used" :key="p.path" :to="p.path" class="h-9 px-3.5 rounded-full border border-border bg-card inline-flex items-center gap-2 hover:bg-accent"><component :is="p.icon" class="h-4 w-4" /> {{ p.name }}</RouterLink>
                </div>
                <span v-if="used.length" class="text-xs text-muted-foreground">Your most-used pages.</span>
              </section>
            </HomeBlock>
          </div>
        </HomeBlock>
      </template>
    </div>
  </div>
</template>
