<script>
// The last report per stack, kept for this app tab so leaving the page does not throw
// away a long read.
const reports = new Map() // stack → { items, total, capped, stopped, at }
const usageData = new Map() // stack → { value, savedAt }
</script>

<script setup>
// Content > Clean-up report (API idea 18, from Mathes, 2026-11-11). Read only: no delete
// or move here; every item links to Content Builder. Logic and assumptions:
// utils/contentCleanup.js. The "Used by" hint for content blocks comes only from the
// Where used saved Content Builder data (utils/usage/), never claimed for anything else.
import { computed, ref, watch } from 'vue'
import { Loader2, RefreshCw, ExternalLink, Network, Square, Info } from 'lucide-vue-next'
import Button from '@/components/ui/button/Button.vue'
import ProgressBar from '@/components/ui/ProgressBar.vue'
import SfmcErrorNotice from '@/components/results/SfmcErrorNotice.vue'
import DataTable from '@/components/results/DataTable.vue'
import DownloadMenu from '@/components/results/DownloadMenu.vue'
import { useStack } from '@/composables/useStack.js'
import { useUsage } from '@/composables/useUsage.js'
import { searchError, withReconnect } from '@/utils/sfmcErrors.js'
import { formatDateTime } from '@/utils/format.js'
import { fetchCurrentBU } from '@/utils/sfmcApi.js'
import { contentBuilderUrl } from '@/utils/recycleBin.js'
import { loadSaved } from '@/utils/usage/store.js'
import { preloadUsageSource } from '@/utils/usage/index.js'
import {
  fetchCleanupAssets, countByType, countByKind, largestFiles, staleItems, duplicateGroups, copyNamed, blockUsage,
  formatBytes, usageTarget, KIND_LABELS, STALE_MONTHS, DEFAULT_STALE_MONTHS, MAX_ASSETS, LARGEST_LIMIT,
} from '@/utils/contentCleanup.js'

const { stack } = useStack()
const usage = useUsage()
const tab = ref('types') // types | largest | stale | duplicates
const months = ref(DEFAULT_STALE_MONTHS)

const report = ref(null)
const busy = ref(false)
const error = ref(null)
const progress = ref({ done: 0, total: 0 })
let stopFlag = false

function showStored() {
  report.value = reports.get(stack.value) || null
  usageSaved.value = usageData.get(stack.value) || null
}
watch(stack, showStored)

async function read() {
  const s = stack.value
  if (!s || busy.value) return
  busy.value = true
  error.value = null
  stopFlag = false
  progress.value = { done: 0, total: 0 }
  try {
    const r = await withReconnect(s, () => fetchCleanupAssets(s, { onProgress: (done, total) => { progress.value = { done, total } }, shouldStop: () => stopFlag }))
    const rec = { ...r, at: Date.now() }
    reports.set(s, rec)
    if (s === stack.value) report.value = rec
    await lookForUsageData(s)
  } catch (e) { error.value = searchError(e, 'read Content Builder') } finally { busy.value = false }
}
const stop = () => { stopFlag = true }

// ── Where used data (content blocks only) ─────────────────
const usageSaved = ref(null)
const usageBusy = ref(false)
const usageProgress = ref({ done: 0, total: 0 })
const usageError = ref('')
const buOf = async (s) => String((await fetchCurrentBU(s).catch(() => null))?.accountId ?? 'unknown')
async function lookForUsageData(s) {
  const saved = await loadSaved(`${s}:${await buOf(s)}:assets`).catch(() => null)
  if (saved) { usageData.set(s, saved); if (s === stack.value) usageSaved.value = saved }
}
async function loadUsageData() {
  const s = stack.value
  usageBusy.value = true
  usageError.value = ''
  try {
    const r = await preloadUsageSource(s, await buOf(s), 'assets', { progress: (done, total) => { usageProgress.value = { done, total } } })
    const rec = { value: r.value, savedAt: Date.now() }
    usageData.set(s, rec)
    if (s === stack.value) usageSaved.value = rec
  } catch (e) { usageError.value = e?.message || String(e) } finally { usageBusy.value = false }
}

showStored()

// ── Rows ─────────────────────────────────────────────────
const items = computed(() => report.value?.items || [])
const kinds = computed(() => countByKind(items.value))
const typeRows = computed(() => countByType(items.value).map((t) => ({ ...t, id: `${t.typeId}|${t.type}`, kindText: KIND_LABELS[t.kind] || t.kind, sizeText: t.size ? formatBytes(t.size) : '' })))
const typeColumns = [
  { key: 'type', label: 'Asset type' }, { key: 'kindText', label: 'Kind' },
  { key: 'count', label: 'Items', sortValue: (r) => r.count }, { key: 'sizeText', label: 'File size', sortValue: (r) => r.size },
  { key: 'typeId', label: 'Type ID', hidden: true },
]

const asRow = (a) => ({ ...a, kindText: KIND_LABELS[a.kind] || a.kind, modified: formatDateTime(a.modifiedDate), sizeText: formatBytes(a.size), dims: a.width && a.height ? `${a.width} x ${a.height}` : '' })
const largestRows = computed(() => largestFiles(items.value).map(asRow))
const largestColumns = [
  { key: 'name', label: 'Name' }, { key: 'type', label: 'Type' }, { key: 'sizeText', label: 'Size', sortValue: (r) => r.size },
  { key: 'dims', label: 'Dimensions' }, { key: 'folder', label: 'Folder' }, { key: 'modified', label: 'Last modified', sortValue: (r) => r.modifiedDate },
  { key: 'key', label: 'Customer key', hidden: true }, { key: 'id', label: 'ID', hidden: true }, { key: 'actions', label: '' },
]

const usageMap = computed(() => (usageSaved.value ? blockUsage(staleItems(items.value, months.value).filter((a) => a.kind === 'block'), usageSaved.value.value?.items) : null))
const staleRows = computed(() => staleItems(items.value, months.value).map((a) => {
  const n = a.kind === 'block' && usageMap.value ? usageMap.value.get(a.id) : null
  return { ...asRow(a), usedBy: n, usedByText: n == null ? '' : n === 0 ? 'None found' : `${n} ${n === 1 ? 'item' : 'items'}` }
}))
const staleColumns = computed(() => [
  { key: 'name', label: 'Name' }, { key: 'kindText', label: 'Kind' }, { key: 'type', label: 'Type' }, { key: 'folder', label: 'Folder' },
  { key: 'modified', label: 'Last modified', sortValue: (r) => r.modifiedDate }, { key: 'modifiedBy', label: 'Modified by' },
  ...(usageSaved.value ? [{ key: 'usedByText', label: 'Used by (Where used data)', sortValue: (r) => r.usedBy ?? -1 }] : []),
  { key: 'key', label: 'Customer key', hidden: true }, { key: 'id', label: 'ID', hidden: true }, { key: 'actions', label: '' },
])

const dupGroups = computed(() => duplicateGroups(items.value))
const dupRows = computed(() => dupGroups.value.flatMap((g) => g.items.map((a) => ({ ...asRow(a), group: `${g.name} (${g.items.length})` }))))
const copyRows = computed(() => copyNamed(items.value).map(asRow))
const dupColumns = [
  { key: 'group', label: 'Same name' }, { key: 'kindText', label: 'Kind' }, { key: 'type', label: 'Type' }, { key: 'folder', label: 'Folder' },
  { key: 'modified', label: 'Last modified', sortValue: (r) => r.modifiedDate }, { key: 'sizeText', label: 'Size', sortValue: (r) => r.size ?? -1, hidden: true },
  { key: 'key', label: 'Customer key', hidden: true }, { key: 'id', label: 'ID', hidden: true }, { key: 'actions', label: '' },
]
const copyColumns = [
  { key: 'name', label: 'Name' }, { key: 'kindText', label: 'Kind' }, { key: 'type', label: 'Type' }, { key: 'folder', label: 'Folder' },
  { key: 'modified', label: 'Last modified', sortValue: (r) => r.modifiedDate },
  { key: 'key', label: 'Customer key', hidden: true }, { key: 'id', label: 'ID', hidden: true }, { key: 'actions', label: '' },
]

const TABS = computed(() => [
  ['types', 'By type', typeRows.value.length],
  ['largest', 'Largest files', largestRows.value.length],
  ['stale', 'Not modified', staleRows.value.length],
  ['duplicates', 'Duplicates and copies', dupRows.value.length + copyRows.value.length],
])

const whereUsed = (row) => { const t = usageTarget(row); if (t) usage.start(stack.value, t) }
const cbUrl = computed(() => contentBuilderUrl(stack.value))

const table = (columns, rows) => {
  const cols = columns.filter((c) => c.label)
  return { type: 'table', columns: cols.map((c) => c.label), rows: rows.map((r) => cols.map((c) => String(r[c.key] ?? ''))) }
}
const getDoc = () => ({
  title: 'Content Builder clean-up report',
  blocks: [
    { type: 'p', text: `${items.value.length} items read${report.value?.capped ? ` (capped at ${MAX_ASSETS.toLocaleString()})` : ''}. Read only: nothing was changed. "Unused" is not claimed for any item.` },
    { type: 'h', text: 'By type' }, table(typeColumns, typeRows.value),
    { type: 'h', text: `Largest files (top ${LARGEST_LIMIT})` }, table(largestColumns, largestRows.value),
    { type: 'h', text: `Templates and content blocks not modified in ${months.value} months` }, table(staleColumns.value, staleRows.value),
    { type: 'h', text: 'Same-name duplicates' }, table(dupColumns, dupRows.value),
    { type: 'h', text: 'Names ending in copy' }, table(copyColumns, copyRows.value),
  ],
})
</script>

<template>
  <div class="p-4 space-y-4 max-w-7xl" data-content-cleanup>
    <div class="flex flex-wrap items-center gap-2">
      <h1 class="text-lg font-semibold">Clean-up report</h1>
      <span class="text-xs text-muted-foreground">What could be tidied in Content Builder. Read only: delete or move items in Content Builder.</span>
      <div class="flex-1" />
      <DownloadMenu :get-doc="getDoc" file-name="content-cleanup-report" :disabled="!items.length" />
      <Button v-if="busy" variant="outline" size="sm" class="gap-1" data-stop @click="stop"><Square class="h-3.5 w-3.5" /> Stop</Button>
      <Button size="sm" class="gap-1" :disabled="busy || !stack" data-read @click="read"><Loader2 v-if="busy" class="h-3.5 w-3.5 animate-spin" /><RefreshCw v-else class="h-3.5 w-3.5" /> {{ report ? 'Read again' : 'Read Content Builder' }}</Button>
    </div>

    <div class="rounded-lg border border-border bg-muted/40 p-3 text-xs space-y-1" data-unused-note>
      <p class="flex items-start gap-1.5"><Info class="h-3.5 w-3.5 mt-0.5 shrink-0" /><span>This report does not say whether an item is unused. SFMC has no way to ask where an image, file or template is used. Only emails and content blocks are covered by Where used, and only content blocks get a "Used by" hint here, from the Where used data. Check before deleting anything.</span></p>
      <p class="text-muted-foreground">Reads up to {{ MAX_ASSETS.toLocaleString() }} items, 250 at a time. Nothing is read until you press Read Content Builder.</p>
    </div>

    <SfmcErrorNotice v-if="error" :error="error" :retrying="busy" @retry="read" />
    <ProgressBar v-if="busy" :value="progress.done" :max="progress.total" show-count label="Reading Content Builder" data-progress />

    <template v-if="report">
      <div class="flex flex-wrap gap-2 text-xs" data-kind-counts>
        <span v-for="(label, k) in KIND_LABELS" :key="k" class="rounded-md border border-border px-2 py-1"><span class="font-semibold">{{ (kinds[k] || 0).toLocaleString() }}</span> {{ label }}</span>
        <span class="text-muted-foreground self-center">{{ items.length.toLocaleString() }} items, read {{ formatDateTime(new Date(report.at).toISOString()) }}<template v-if="report.capped">; capped, {{ report.total.toLocaleString() }} in Content Builder</template><template v-if="report.stopped">; stopped early</template></span>
      </div>

      <nav class="flex flex-wrap gap-1 border-b border-border" role="tablist" aria-label="Report parts">
        <button v-for="[k, l, n] in TABS" :key="k" type="button" role="tab" :aria-selected="tab === k" :data-cleanup-tab="k"
          class="-mb-px inline-flex h-10 items-center gap-1.5 border-b-2 px-3 text-sm" :class="tab === k ? 'border-primary font-semibold' : 'border-transparent text-muted-foreground hover:text-foreground'" @click="tab = k">
          {{ l }}<span class="rounded-full bg-muted px-1.5 text-xs text-muted-foreground">{{ n }}</span>
        </button>
      </nav>

      <section v-if="tab === 'types'" class="rounded-lg border border-border bg-card">
        <DataTable :columns="typeColumns" :rows="typeRows" storage-key="content-cleanup-types" empty-text="No items." />
      </section>

      <section v-else-if="tab === 'largest'" class="rounded-lg border border-border bg-card">
        <p class="px-3 py-2 text-xs text-muted-foreground border-b border-border">The {{ LARGEST_LIMIT }} largest items with a file size, worked out from what was read (SFMC cannot sort by file size).</p>
        <DataTable :columns="largestColumns" :rows="largestRows" storage-key="content-cleanup-largest" empty-text="No items with a file size.">
          <template #cell-actions="{ row }">
            <span class="inline-flex gap-2 text-xs whitespace-nowrap">
              <a v-if="row.fileUrl" :href="row.fileUrl" target="_blank" rel="noopener" class="text-primary hover:underline">View file</a>
              <a :href="cbUrl" target="_blank" rel="noopener" class="inline-flex items-center gap-0.5 text-primary hover:underline" data-cb-link>Content Builder <ExternalLink class="h-3 w-3" /></a>
            </span>
          </template>
        </DataTable>
      </section>

      <section v-else-if="tab === 'stale'" class="rounded-lg border border-border bg-card">
        <div class="flex flex-wrap items-center gap-3 px-3 py-2 border-b border-border text-xs">
          <label class="flex items-center gap-1.5">Templates and content blocks not modified in
            <select v-model.number="months" class="h-7 rounded-md border border-border bg-background px-1" data-months>
              <option v-for="m in STALE_MONTHS" :key="m" :value="m">{{ m }} months</option>
            </select>
          </label>
          <div class="flex-1" />
          <template v-if="usageSaved">
            <span class="text-muted-foreground">Used by: Where used data from {{ formatDateTime(new Date(usageSaved.savedAt).toISOString()) }}<template v-if="usageSaved.value?.capped"> (capped, counts may be low)</template>.</span>
          </template>
          <Button v-if="!usageBusy" variant="outline" size="sm" class="gap-1" data-load-usage @click="loadUsageData"><Network class="h-3.5 w-3.5" /> {{ usageSaved ? 'Update Where used data' : 'Add Used by from Where used' }}</Button>
          <ProgressBar v-else :value="usageProgress.done" :max="usageProgress.total" show-count label="Where used: Content Builder" class="w-64" />
        </div>
        <p v-if="usageError" class="px-3 py-2 text-xs text-destructive">Where used data could not be read: {{ usageError }}</p>
        <p v-if="usageSaved" class="px-3 py-2 text-xs text-muted-foreground border-b border-border">Used by counts emails, templates, blocks and CloudPages that name the block in AMPscript (ContentBlockByKey, ByID, ByName) or place it in a slot. "None found" means none in that data, not that the block is unused (for example, a journey or another business unit may still use it). Templates have no such check.</p>
        <DataTable :columns="staleColumns" :rows="staleRows" storage-key="content-cleanup-stale" empty-text="Every template and content block was modified in this period.">
          <template #cell-actions="{ row }">
            <span class="inline-flex gap-2 text-xs whitespace-nowrap">
              <button v-if="row.kind === 'block'" type="button" class="inline-flex items-center gap-0.5 text-primary hover:underline" data-where-used @click="whereUsed(row)"><Network class="h-3 w-3" /> Where used</button>
              <a :href="cbUrl" target="_blank" rel="noopener" class="inline-flex items-center gap-0.5 text-primary hover:underline" data-cb-link>Content Builder <ExternalLink class="h-3 w-3" /></a>
            </span>
          </template>
        </DataTable>
      </section>

      <template v-else>
        <section class="rounded-lg border border-border bg-card">
          <p class="px-3 py-2 text-xs text-muted-foreground border-b border-border">Two or more items of the same kind with the same name (case ignored), in any folder.</p>
          <DataTable :columns="dupColumns" :rows="dupRows" storage-key="content-cleanup-dups" empty-text="No same-name duplicates.">
            <template #cell-actions="{ row }">
              <span class="inline-flex gap-2 text-xs whitespace-nowrap">
                <button v-if="row.kind === 'block' || row.kind === 'email'" type="button" class="inline-flex items-center gap-0.5 text-primary hover:underline" data-where-used @click="whereUsed(row)"><Network class="h-3 w-3" /> Where used</button>
                <a :href="cbUrl" target="_blank" rel="noopener" class="inline-flex items-center gap-0.5 text-primary hover:underline" data-cb-link>Content Builder <ExternalLink class="h-3 w-3" /></a>
              </span>
            </template>
          </DataTable>
        </section>
        <section class="rounded-lg border border-border bg-card">
          <p class="px-3 py-2 text-xs text-muted-foreground border-b border-border">Names ending in "copy" (also "copy 2", "(copy)" and "Copy of ...").</p>
          <DataTable :columns="copyColumns" :rows="copyRows" storage-key="content-cleanup-copies" empty-text="No names ending in copy.">
            <template #cell-actions="{ row }">
              <span class="inline-flex gap-2 text-xs whitespace-nowrap">
                <button v-if="row.kind === 'block' || row.kind === 'email'" type="button" class="inline-flex items-center gap-0.5 text-primary hover:underline" data-where-used @click="whereUsed(row)"><Network class="h-3 w-3" /> Where used</button>
                <a :href="cbUrl" target="_blank" rel="noopener" class="inline-flex items-center gap-0.5 text-primary hover:underline" data-cb-link>Content Builder <ExternalLink class="h-3 w-3" /></a>
              </span>
            </template>
          </DataTable>
        </section>
      </template>
    </template>
  </div>
</template>
