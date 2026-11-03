<script setup>
// Saved queries: captured from Query Studio, added by hand, imported, or saved from
// the Workspace and Query Builder (from SFMC Query Saver's main page).
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import { Search, Plus, Download, Upload, Trash2, Star, Rows3, LayoutGrid, X, Play, Blocks, MoreHorizontal, ChevronDown } from 'lucide-vue-next'
import QueryCard from '@/components/cards/QueryCard.vue'
import QueryRow from '@/components/saved/QueryRow.vue'
import QueryDetailsPanel from '@/components/saved/QueryDetailsPanel.vue'
import { matchesQuerySearch } from '@/components/saved/queryMeta.js'
import AddQueryModal from '@/components/modals/AddQueryModal.vue'
import Button from '@/components/ui/button/Button.vue'
import { groupByDate } from '@/utils/dateGroups.js'
import { queriesToCsv, csvToQueryRecords, csvFileName } from '@/utils/queryCsv.js'
import { saveTextFile, readFileText } from '@/utils/download.js'
import { useStoredSetting } from '@/composables/useStoredSetting.js'
import { showToast } from '@/composables/useToast.js'
import { useStack } from '@/composables/useStack.js'
import { fetchCurrentBU } from '@/utils/sfmcApi.js'

const router = useRouter()

const queries = ref([])
const search = ref('')
const activeDateFilter = ref(null)
const activeBuFilters = ref(new Set())
const favouritesOnly = ref(false)
const { value: cardSize } = useStoredSetting('cardSize', 'compact', (v) => (v === 'large' ? 'large' : 'compact'))
// List (default) or the older card grid.
const { value: viewMode } = useStoredSetting('toolkit_savedQueriesView', 'list', (v) => (v === 'cards' ? 'cards' : 'list'))

const showAddModal = ref(false)
// The query open in the details panel; looked up by id so it follows reloads.
const previewId = ref(null)
const previewCard = computed(() => (previewId.value && queries.value.find((q) => q.id === previewId.value)) || null)
const deleteMode = ref(false)
const selectedIds = ref(new Set())
const csvInput = ref(null)

// ── Data ─────────────────────────────────────────────────
function loadData() {
  return new Promise((resolve) => {
    chrome.storage.local.get(null, (raw) => {
      queries.value = Object.values(raw || {})
        // Workspace panels that were never typed in are stored too; they aren't saved queries.
        .filter((v) => v && typeof v.queryText === 'string' && String(v.id || '').startsWith('sql_') &&
          (v.queryText.trim() || v.runs?.length))
        .map((v) => ({
          id: v.id,
          queryText: v.queryText || v.runs?.[0]?.queryText || '',
          timeStamp: v.timeStamp,
          url: v.url,
          name: v.name,
          isFavourite: !!v.isFavourite,
          businessUnit: v.businessUnit || null,
          source: v.source || null,
        }))
        .sort((a, b) => b.timeStamp - a.timeStamp)
      resolve()
    })
  })
}

// New captures (Query Studio, another tab) show up without a reload.
let reloadTimer = null
function onStorageChange(changes, area) {
  if (area !== 'local' || !Object.keys(changes).some((k) => k.startsWith('sql_'))) return
  clearTimeout(reloadTimer)
  reloadTimer = setTimeout(loadData, 300)
}
onMounted(() => { loadData(); chrome.storage.onChanged.addListener(onStorageChange) })
onUnmounted(() => chrome.storage.onChanged.removeListener(onStorageChange))

// ── Current business unit first (feedback #49) ────────────
// When the business unit you are logged in to is known and has saved queries, only
// its queries are shown; Show all (remembered) lists every business unit again.
const SHOW_ALL_KEY = 'toolkit_savedQueries_allBUs'
const { stack } = useStack()
const currentBU = ref(null)
const showAllBUs = ref((() => { try { return localStorage.getItem(SHOW_ALL_KEY) === '1' } catch { return false } })())
const autoBU = ref(false) // the BU filter was set from the current BU, not by hand
function applyCurrentBU() {
  if (showAllBUs.value || !currentBU.value || activeBuFilters.value.size) return
  if (!queries.value.some((q) => q.businessUnit?.name === currentBU.value)) return
  activeBuFilters.value = new Set([currentBU.value])
  autoBU.value = true
}
watch(stack, async (s) => {
  if (!s) return
  try { currentBU.value = (await fetchCurrentBU(s))?.name || null } catch { currentBU.value = null }
  if (autoBU.value) { activeBuFilters.value = new Set(); autoBU.value = false }
  applyCurrentBU()
}, { immediate: true })
watch(queries, applyCurrentBU)
function setShowAll(all) {
  showAllBUs.value = all
  try { localStorage.setItem(SHOW_ALL_KEY, all ? '1' : '0') } catch { /* storage blocked */ }
  if (all) { activeBuFilters.value = new Set(); autoBU.value = false } else applyCurrentBU()
}
function onBuFilterChange(set) {
  activeBuFilters.value = set
  autoBU.value = false
}
const currentBUCount = computed(() => queries.value.filter((q) => q.businessUnit?.name === currentBU.value).length)

// ── Filters and groups ───────────────────────────────────
const buOptions = computed(() => {
  const map = new Map()
  for (const q of queries.value) {
    const bu = q.businessUnit
    if (!bu?.name) continue
    const entry = map.get(bu.name) || { name: bu.name, accountId: bu.accountId, count: 0 }
    entry.count++
    map.set(bu.name, entry)
  }
  return [...map.values()].sort((a, b) => a.name.localeCompare(b.name))
})

const filtered = computed(() => queries.value.filter((q) =>
  (!activeBuFilters.value.size || activeBuFilters.value.has(q.businessUnit?.name)) &&
  (!favouritesOnly.value || q.isFavourite) &&
  matchesQuerySearch(q, search.value)))

// Business unit picker: one business unit, or all of them.
const buFilter = computed({
  get: () => (activeBuFilters.value.size === 1 ? [...activeBuFilters.value][0] : ''),
  set: (name) => onBuFilterChange(name ? new Set([name]) : new Set()),
})

// Each date group is split by business unit when it holds more than one.
const allGroups = computed(() => groupByDate(filtered.value).map((g) => {
  const byBu = new Map()
  const noBu = []
  for (const q of g.items) {
    const name = q.businessUnit?.name
    if (name) { if (!byBu.has(name)) byBu.set(name, []); byBu.get(name).push(q) } else noBu.push(q)
  }
  const split = byBu.size > 1 || (byBu.size === 1 && noBu.length > 0)
  return {
    ...g,
    buGroups: split
      ? [...byBu].map(([name, items]) => ({ name, items })).concat(noBu.length ? [{ name: null, items: noBu }] : [])
      : [{ name: null, items: g.items }],
  }
}))
const dateOptions = computed(() => allGroups.value.map((g) => ({ key: g.key, label: g.label, count: g.items.length })))
// A picked date group that no longer has queries falls back to Any time.
watch(dateOptions, (opts) => {
  if (activeDateFilter.value !== null && !opts.some((o) => o.key === activeDateFilter.value)) activeDateFilter.value = null
})
const shownCount = computed(() => visibleIds.value.length)
function clearFilters() {
  favouritesOnly.value = false
  search.value = ''
  onBuFilterChange(new Set())
  activeDateFilter.value = null
}const displayGroups = computed(() => (activeDateFilter.value === null
  ? allGroups.value
  : allGroups.value.filter((g) => g.key === activeDateFilter.value)))
const visibleIds = computed(() => displayGroups.value.flatMap((g) => g.items.map((q) => q.id)))

// ── Actions ──────────────────────────────────────────────
async function toggleFavourite(id) {
  const q = queries.value.find((x) => x.id === id)
  if (!q) return
  const data = await new Promise((r) => chrome.storage.local.get(id, r))
  if (!data[id]) return
  q.isFavourite = !q.isFavourite
  chrome.storage.local.set({ [id]: { ...data[id], isFavourite: q.isFavourite } })
}

function openPreview(id) {
  previewId.value = previewId.value === id ? null : id
}
function openBuilder(card) {
  previewId.value = null
  router.push({ path: '/queries/builder', query: { sql: card.queryText } })
}

// More menu (add, export, import, delete).
const moreOpen = ref(false)
const moreRoot = ref(null)
function onDocClick(e) { if (moreOpen.value && !moreRoot.value?.contains(e.target)) moreOpen.value = false }
onMounted(() => document.addEventListener('mousedown', onDocClick))
onUnmounted(() => document.removeEventListener('mousedown', onDocClick))
function moreAction(fn) { moreOpen.value = false; fn() }

function openEditor(id) {
  previewId.value = null
  const q = queries.value.find((x) => x.id === id)
  router.push({ path: q?.source === 'builder' ? '/queries/builder' : '/queries/workspace', query: { id } })
}

function toggleDeleteMode() {
  deleteMode.value = !deleteMode.value
  if (deleteMode.value) previewId.value = null
  selectedIds.value = new Set()
}
function toggleSelect(id) {
  const next = new Set(selectedIds.value)
  next.has(id) ? next.delete(id) : next.add(id)
  selectedIds.value = next
}
function toggleSelectAll() {
  selectedIds.value = selectedIds.value.size === visibleIds.value.length ? new Set() : new Set(visibleIds.value)
}
async function deleteSelected() {
  const ids = [...selectedIds.value]
  if (!ids.length) return
  if (ids.includes(previewId.value)) previewId.value = null
  await new Promise((r) => chrome.storage.local.remove(ids, r))
  await loadData()
  deleteMode.value = false
  selectedIds.value = new Set()
  showToast(`Deleted ${ids.length} ${ids.length === 1 ? 'query' : 'queries'}.`)
}

async function exportCsv() {
  const raw = await new Promise((r) => chrome.storage.local.get(null, r))
  const records = Object.entries(raw).filter(([k]) => k.startsWith('sql_')).map(([, v]) => v)
  await saveTextFile(queriesToCsv(records), csvFileName(), 'text/csv', 'CSV file')
}

async function importCsv(event) {
  const file = event.target.files?.[0]
  event.target.value = ''
  if (!file) return
  const entries = csvToQueryRecords(await readFileText(file))
  const count = Object.keys(entries).length
  if (!count) { showToast('No queries found in that CSV.'); return }
  await new Promise((r) => chrome.storage.local.set(entries, r))
  await loadData()
  showToast(`Imported ${count} ${count === 1 ? 'query' : 'queries'}.`)
}

async function onSaved(result) {
  showAddModal.value = false
  await loadData()
  showToast(result === false ? 'Could not save. Please try again.' : 'Query saved.')
}
</script>

<template>
  <div class="h-full flex flex-col bg-background">
    <!-- Toolbar -->
    <div class="flex flex-wrap items-center gap-2.5 px-5 py-3 border-b border-border bg-card">
      <template v-if="!deleteMode">
        <div class="flex items-center gap-2.5 h-[38px] px-4 flex-1 basis-56 max-w-[340px] min-w-0 rounded-full border border-primary/25 bg-card ring-4 ring-primary/5 focus-within:border-primary/60">
          <Search class="h-4 w-4 shrink-0 text-primary" aria-hidden="true" />
          <label for="sq-search" class="sr-only">Search name, SQL or bu:name</label>
          <input id="sq-search" v-model="search" type="search" placeholder="Search name, SQL or bu:name"
            class="flex-1 min-w-0 border-0 bg-transparent text-sm text-foreground outline-none placeholder:text-muted-foreground"
            @keyup.esc="search = ''" />
        </div>
        <button type="button" class="inline-flex items-center gap-1.5 h-[38px] px-3.5 rounded-full border text-sm font-medium transition-colors"
          :class="favouritesOnly ? 'bg-amber-50 border-amber-400 text-amber-800 dark:bg-amber-950/40 dark:border-amber-700 dark:text-amber-400' : 'bg-card border-border text-foreground hover:bg-accent'"
          :aria-pressed="favouritesOnly" @click="favouritesOnly = !favouritesOnly">
          <Star class="h-3.5 w-3.5" :fill="favouritesOnly ? 'currentColor' : 'none'" /> Favourites
        </button>
        <label for="sq-date" class="sr-only">Saved</label>
        <select id="sq-date" v-model="activeDateFilter" class="h-[38px] px-3 rounded-full border border-border bg-card text-sm text-foreground">
          <option :value="null">Any time</option>
          <option v-for="o in dateOptions" :key="o.key" :value="o.key">{{ o.label }} ({{ o.count }})</option>
        </select>
        <template v-if="buOptions.length">
          <label for="sq-bu" class="sr-only">Business unit</label>
          <select id="sq-bu" v-model="buFilter" class="h-[38px] px-3 rounded-full border border-border bg-card text-sm text-foreground max-w-[220px]">
            <option value="">All business units</option>
            <option v-for="b in buOptions" :key="b.name" :value="b.name">{{ b.name }} ({{ b.count }})</option>
          </select>
        </template>
        <div role="group" aria-label="View" class="inline-flex p-[3px] rounded-full border border-border bg-card">
          <button v-for="v in [['list', 'List'], ['cards', 'Cards']]" :key="v[0]" type="button"
            class="h-[30px] px-3 rounded-full text-[13px] transition-colors"
            :class="viewMode === v[0] ? 'bg-primary text-primary-foreground font-semibold' : 'text-foreground/80 font-medium hover:bg-accent'"
            :aria-pressed="viewMode === v[0]" @click="viewMode = v[0]">{{ v[1] }}</button>
        </div>
        <button v-if="viewMode === 'cards'" type="button"
          class="inline-flex items-center gap-1.5 h-[38px] px-3.5 rounded-full border border-border bg-card text-sm text-foreground hover:bg-accent"
          :title="cardSize === 'large' ? 'Show smaller cards' : 'Show larger cards with more of the SQL'"
          @click="cardSize = cardSize === 'large' ? 'compact' : 'large'">
          <LayoutGrid v-if="cardSize === 'large'" class="h-3.5 w-3.5" /><Rows3 v-else class="h-3.5 w-3.5" />
          {{ cardSize === 'large' ? 'Compact cards' : 'Large cards' }}
        </button>

        <span class="ml-auto flex flex-wrap items-center gap-2">
          <button type="button" class="inline-flex items-center gap-1.5 h-[38px] px-4 rounded-full bg-primary text-primary-foreground text-sm font-semibold hover:bg-primary/90"
            @click="router.push('/queries/workspace')"><Play class="h-3.5 w-3.5" /> Run a query</button>
          <button type="button" class="inline-flex items-center gap-1.5 h-[38px] px-3.5 rounded-full border border-border bg-card text-sm font-medium text-foreground hover:bg-accent"
            @click="router.push('/queries/builder')"><Blocks class="h-3.5 w-3.5" /> Query Builder</button>
          <div ref="moreRoot" class="relative">
            <button type="button" class="inline-flex items-center gap-1.5 h-[38px] px-3.5 rounded-full border border-border bg-card text-sm font-medium text-foreground hover:bg-accent"
              aria-haspopup="menu" :aria-expanded="moreOpen" @click="moreOpen = !moreOpen" @keydown.esc="moreOpen = false">
              <MoreHorizontal class="h-4 w-4" /> More <ChevronDown class="h-3.5 w-3.5" />
            </button>
            <div v-if="moreOpen" role="menu" class="absolute right-0 top-full mt-1.5 z-30 w-56 rounded-xl border border-border bg-card p-1 shadow-lg" @keydown.esc="moreOpen = false">
              <button role="menuitem" type="button" class="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-sm text-foreground hover:bg-accent" @click="moreAction(() => (showAddModal = true))">
                <Plus class="h-4 w-4 text-muted-foreground" /> Add a query</button>
              <button role="menuitem" type="button" class="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-sm text-foreground hover:bg-accent" @click="moreAction(exportCsv)">
                <Download class="h-4 w-4 text-muted-foreground" /> Export queries to CSV</button>
              <button role="menuitem" type="button" class="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-sm text-foreground hover:bg-accent" @click="moreAction(() => csvInput?.click())">
                <Upload class="h-4 w-4 text-muted-foreground" /> Import queries from CSV</button>
              <div class="my-1 h-px bg-border" />
              <button role="menuitem" type="button" class="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-sm text-red-600 dark:text-red-400 hover:bg-accent disabled:opacity-50 disabled:pointer-events-none"
                :disabled="!queries.length" @click="moreAction(toggleDeleteMode)">
                <Trash2 class="h-4 w-4" /> Select queries to delete</button>
            </div>
          </div>
          <input ref="csvInput" type="file" accept=".csv,text/csv,text/plain" class="hidden" @change="importCsv" />
        </span>
      </template>
      <template v-else>
        <label class="flex items-center gap-2 text-sm">
          <input type="checkbox" class="h-4 w-4 accent-primary" :checked="selectedIds.size > 0 && selectedIds.size === visibleIds.length"
            :indeterminate="selectedIds.size > 0 && selectedIds.size < visibleIds.length" @change="toggleSelectAll" />
          Select all shown ({{ visibleIds.length }})
        </label>
        <div class="flex-1" />
        <Button variant="destructive" size="sm" class="h-9 rounded-full px-4 text-sm" :disabled="!selectedIds.size" @click="deleteSelected">
          <Trash2 class="h-3.5 w-3.5 mr-1" /> Delete ({{ selectedIds.size }})
        </Button>
        <Button variant="outline" size="sm" class="h-9 rounded-full px-4 text-sm" @click="toggleDeleteMode"><X class="h-3.5 w-3.5 mr-1" /> Cancel</Button>
      </template>
    </div>

    <div class="relative flex-1 min-h-0 flex">
      <div class="flex-1 min-w-0 overflow-y-auto p-5 flex flex-col gap-3">
        <div v-if="autoBU && activeBuFilters.size === 1" class="flex flex-wrap items-center gap-2 rounded-xl border border-primary/30 bg-primary/5 px-3.5 py-2.5 text-sm">
          <span class="flex-1">Showing the {{ currentBUCount }} queries from <strong>{{ currentBU }}</strong>, the business unit you are logged in to.</span>
          <button class="text-primary hover:underline" @click="setShowAll(true)">Show all business units</button>
        </div>
        <div v-else-if="showAllBUs && currentBU && currentBUCount && !activeBuFilters.size" class="flex flex-wrap items-center gap-2 rounded-xl border border-border bg-card px-3.5 py-2.5 text-sm text-muted-foreground">
          <span class="flex-1">Showing every business unit.</span>
          <button class="text-primary hover:underline" @click="setShowAll(false)">Only {{ currentBU }}</button>
        </div>

        <div v-if="!queries.length" class="flex flex-col items-center gap-3 py-16 text-center">
          <p class="text-base font-semibold">No queries saved yet</p>
          <p class="text-sm text-muted-foreground max-w-sm">Run a query in SFMC Query Studio and it appears here. You can also add one, import a CSV, or import a Query Saver backup in Settings.</p>
          <Button class="mt-2 rounded-full" @click="showAddModal = true">Add a query</Button>
        </div>

        <div v-else-if="!displayGroups.length" class="flex flex-col items-center gap-3 py-12 text-center">
          <p class="text-sm font-semibold">Nothing matches these filters</p>
          <button class="text-sm text-primary underline" @click="clearFilters">Clear filters</button>
        </div>

        <section v-for="group in displayGroups" :key="group.key" class="flex flex-col gap-3 mb-2">
          <div class="flex items-center gap-2.5">
            <h2 class="text-xs font-bold uppercase tracking-wider text-muted-foreground">{{ group.label }}</h2>
            <span class="text-xs font-semibold rounded-md bg-muted px-2 py-0.5 text-foreground/80 tabular-nums">{{ group.items.length }}</span>
            <div class="flex-1 h-px bg-border" />
          </div>
          <div v-for="bu in group.buGroups" :key="bu.name || '_'" class="flex flex-col gap-2">
            <div v-if="group.buGroups.length > 1" class="flex items-center gap-1.5">
              <span class="text-[11px] font-semibold text-primary bg-primary/10 rounded-md px-2 py-px">{{ bu.name || 'No business unit' }}</span>
              <span class="text-[11px] text-muted-foreground tabular-nums">{{ bu.items.length }}</span>
            </div>
            <div v-if="viewMode === 'list'" class="rounded-[14px] border border-border bg-card overflow-hidden">
              <QueryRow v-for="q in bu.items" :key="q.id" :query="q" :active="previewId === q.id"
                :delete-mode="deleteMode" :is-selected="selectedIds.has(q.id)"
                @open="openPreview" @toggle-select="toggleSelect" @toggle-favourite="toggleFavourite" />
            </div>
            <div v-else class="flex flex-wrap gap-4 items-start">
              <QueryCard v-for="q in bu.items" :key="q.id" v-bind="q" :size="cardSize" :active="previewId === q.id"
                :delete-mode="deleteMode" :is-selected="selectedIds.has(q.id)"
                @toggle-select="toggleSelect" @toggle-favourite="toggleFavourite" @open-preview="openPreview" />
            </div>
          </div>
        </section>

        <p v-if="displayGroups.length" class="m-0 text-xs text-muted-foreground">
          {{ shownCount }} saved {{ shownCount === 1 ? 'query' : 'queries' }} shown<template v-if="shownCount !== queries.length"> of {{ queries.length }}</template>.
        </p>
      </div>

      <!-- Details: beside the list on wide windows, over it on narrow ones. -->
      <QueryDetailsPanel v-if="previewCard && !deleteMode" :key="previewCard.id" :card="previewCard"
        class="absolute inset-0 z-20 lg:static lg:z-auto lg:w-[min(640px,48%)] lg:shrink-0 border-l border-border"
        @open-editor="openEditor" @open-builder="openBuilder" @toggle-favourite="toggleFavourite" @close="previewId = null" />
    </div>

    <AddQueryModal v-if="showAddModal" @save="onSaved" @validation-error="showToast('Enter a name and the SQL first.')" @close="showAddModal = false" />
  </div>
</template>
