<script setup>
// Data > Recycle bin (user, 2026-11-10): deleted data extensions (Contact Builder's
// Recycle Bin) and deleted Content Builder items, read only. Restoring happens in SFMC,
// so each tab links there. ?tab=content (and &type=emails) opens the Content Builder tab,
// as the Emails page links it. Calls and their live checks: utils/recycleBin.js.
import { computed, ref, watch } from 'vue'
import { useRoute } from 'vue-router'
import { Loader2, RefreshCw, ExternalLink, Search } from 'lucide-vue-next'
import Button from '@/components/ui/button/Button.vue'
import SfmcErrorNotice from '@/components/results/SfmcErrorNotice.vue'
import DataTable from '@/components/results/DataTable.vue'
import DownloadMenu from '@/components/results/DownloadMenu.vue'
import { useStack, whenStack } from '@/composables/useStack.js'
import { searchError } from '@/utils/sfmcErrors.js'
import { formatDateTime } from '@/utils/format.js'
import {
  fetchDeletedDEs, fetchDeletedContent, recoverableText, filterContent, groupCounts, clearRecycleBinCache,
  CONTENT_TYPE_GROUPS, RECOVERABLE_DAYS, contactBuilderRecycleUrl, contentBuilderUrl,
} from '@/utils/recycleBin.js'

const { stack } = useStack()
const route = useRoute()
const tab = ref('des') // des | content
const typeGroup = ref('all')
const text = ref('')
const includeShared = ref(false)

// The page is kept alive or reopened with a different query: follow ?tab= and ?type=.
function fromQuery() {
  if (route.path !== '/recycle-bin') return
  if (route.query.tab === 'content') tab.value = 'content'
  else if (route.query.tab === 'des') tab.value = 'des'
  const t = String(route.query.type || '')
  if (CONTENT_TYPE_GROUPS.some((g) => g.id === t)) typeGroup.value = t
}
fromQuery()
watch(() => [route.query.tab, route.query.type], fromQuery)

const des = ref(null)
const desBusy = ref(false)
const desError = ref(null)
async function loadDEs(fresh = false) {
  desBusy.value = true
  desError.value = null
  try {
    if (fresh) clearRecycleBinCache()
    des.value = await fetchDeletedDEs(stack.value)
  } catch (e) { desError.value = searchError(e, 'read the Contact Builder Recycle Bin') } finally { desBusy.value = false }
}

const content = ref(null)
const contentBusy = ref(false)
const contentError = ref(null)
async function loadContent() {
  contentBusy.value = true
  contentError.value = null
  try { content.value = await fetchDeletedContent(stack.value, { includeShared: includeShared.value }) } catch (e) { contentError.value = searchError(e, 'read the Content Builder Recycle Bin') } finally { contentBusy.value = false }
}
watch(includeShared, () => loadContent())
whenStack(() => { loadDEs(); loadContent() })
const refresh = () => (tab.value === 'des' ? loadDEs(true) : loadContent())

// ── Rows ─────────────────────────────────────────────────
const deRows = computed(() => (des.value?.items || []).map((d) => ({
  ...d, recoverable: recoverableText(d.recoverableDays), deleted: formatDateTime(d.deletedDate), created: formatDateTime(d.createdDate),
  rows: d.rowCount == null ? '' : Number(d.rowCount).toLocaleString(), fields: d.fieldCount ?? '', sendableText: d.sendable ? 'Yes' : 'No',
})))
const deColumns = [
  { key: 'name', label: 'Name' }, { key: 'originalPath', label: 'Original path' },
  { key: 'recoverable', label: 'Recoverable for', sortValue: (r) => r.recoverableDays ?? -1 },
  { key: 'deleted', label: 'Deleted', sortValue: (r) => r.deletedDate }, { key: 'deletedBy', label: 'Deleted by' },
  { key: 'rows', label: 'Rows', sortValue: (r) => Number(r.rowCount ?? -1) }, { key: 'fields', label: 'Fields', hidden: true },
  { key: 'key', label: 'External key' }, { key: 'sendableText', label: 'Sendable', hidden: true },
  { key: 'created', label: 'Created', hidden: true, sortValue: (r) => r.createdDate }, { key: 'createdBy', label: 'Created by', hidden: true },
  { key: 'description', label: 'Description', hidden: true }, { key: 'id', label: 'ID', hidden: true },
]
const expiringSoon = computed(() => (des.value?.items || []).filter((d) => d.recoverableDays != null && d.recoverableDays <= 3).length)

const counts = computed(() => groupCounts(content.value?.items || []))
const contentRows = computed(() => filterContent(content.value?.items || [], { group: typeGroup.value, text: text.value }).map((c) => ({
  ...c, created: formatDateTime(c.createdDate), modified: formatDateTime(c.modifiedDate),
})))
const contentColumns = [
  { key: 'name', label: 'Name' }, { key: 'type', label: 'Type' }, { key: 'folder', label: 'Folder' },
  { key: 'modified', label: 'Last modified', sortValue: (r) => r.modifiedDate }, { key: 'modifiedBy', label: 'Last modified by' },
  { key: 'key', label: 'Customer key' }, { key: 'created', label: 'Created', hidden: true, sortValue: (r) => r.createdDate },
  { key: 'createdBy', label: 'Created by', hidden: true }, { key: 'owner', label: 'Owner', hidden: true }, { key: 'id', label: 'ID', hidden: true },
]

const table = (columns, rows) => ({ type: 'table', columns: columns.map((c) => c.label), rows: rows.map((r) => columns.map((c) => String(r[c.key] ?? ''))) })
const getDoc = () => (tab.value === 'des'
  ? { title: 'Recycle bin: data extensions', blocks: [{ type: 'p', text: `Deleted data extensions can be restored in Contact Builder for ${RECOVERABLE_DAYS} days after deletion.` }, table(deColumns, deRows.value)] }
  : { title: 'Recycle bin: Content Builder', blocks: [{ type: 'p', text: 'Last modified is the last change before the item was deleted; SFMC does not give the deletion date.' }, table(contentColumns, contentRows.value)] })
const busy = computed(() => (tab.value === 'des' ? desBusy.value : contentBusy.value))
const shownRows = computed(() => (tab.value === 'des' ? deRows.value : contentRows.value))
</script>

<template>
  <div class="p-4 space-y-4 max-w-7xl" data-recycle-bin>
    <div class="flex flex-wrap items-center gap-2">
      <h1 class="text-lg font-semibold">Recycle bin</h1>
      <span class="text-xs text-muted-foreground">What was deleted in this business unit. Read only: restore items in SFMC.</span>
      <div class="flex-1" />
      <DownloadMenu :get-doc="getDoc" :file-name="tab === 'des' ? 'recycle-bin-data-extensions' : 'recycle-bin-content'" :disabled="!shownRows.length" />
      <Button variant="outline" size="sm" class="gap-1" :disabled="busy" @click="refresh"><Loader2 v-if="busy" class="h-3.5 w-3.5 animate-spin" /><RefreshCw v-else class="h-3.5 w-3.5" /> Refresh</Button>
    </div>

    <nav class="flex gap-1 border-b border-border" role="tablist" aria-label="Recycle bins">
      <button v-for="[k, l, n] in [['des', 'Data extensions', des?.count], ['content', 'Content Builder', content?.count]]" :key="k" type="button" role="tab" :aria-selected="tab === k" :data-recycle-tab="k"
        class="-mb-px inline-flex h-10 items-center gap-1.5 border-b-2 px-3 text-sm" :class="tab === k ? 'border-primary font-semibold' : 'border-transparent text-muted-foreground hover:text-foreground'" @click="tab = k">
        {{ l }}<span v-if="n != null" class="rounded-full bg-muted px-1.5 text-xs text-muted-foreground">{{ n }}</span>
      </button>
    </nav>

    <!-- Data extensions -->
    <section v-if="tab === 'des'" class="rounded-lg border border-border bg-card">
      <div class="flex flex-wrap items-center gap-3 px-3 py-2 border-b border-border text-xs">
        <span v-if="des">{{ des.count }} deleted data extensions<template v-if="expiringSoon">, <span class="font-semibold text-amber-700 dark:text-amber-400">{{ expiringSoon }} recoverable for 3 days or less</span></template></span>
        <span class="text-muted-foreground">Contact Builder keeps a deleted data extension for {{ RECOVERABLE_DAYS }} days. Deleted is when it went to the Recycle Bin.</span>
        <div class="flex-1" />
        <a :href="contactBuilderRecycleUrl(stack)" target="_blank" rel="noopener" class="inline-flex items-center gap-1 text-primary hover:underline" data-open-contact-builder><ExternalLink class="h-3.5 w-3.5" /> Open in Contact Builder to restore</a>
      </div>
      <SfmcErrorNotice v-if="desError" :error="desError" :retrying="desBusy" class="m-3" @retry="loadDEs(true)" />
      <div v-if="desBusy && !des" class="flex items-center gap-2 p-4 text-sm text-muted-foreground"><Loader2 class="h-4 w-4 animate-spin" /> Reading the Recycle Bin…</div>
      <DataTable v-else :columns="deColumns" :rows="deRows" storage-key="recycle-bin-des" empty-text="The Recycle Bin has no data extensions.">
        <template #cell-recoverable="{ row }"><span :class="row.recoverableDays != null && row.recoverableDays <= 3 ? 'font-semibold text-amber-700 dark:text-amber-400' : ''">{{ row.recoverable }}</span></template>
      </DataTable>
    </section>

    <!-- Content Builder -->
    <section v-else class="rounded-lg border border-border bg-card">
      <div class="flex flex-wrap items-center gap-3 px-3 py-2 border-b border-border text-xs">
        <div class="flex gap-0.5 border border-border rounded-md p-0.5" role="group" aria-label="Type">
          <button v-for="g in CONTENT_TYPE_GROUPS" :key="g.id" type="button" class="px-2 py-0.5 rounded" :data-type-group="g.id"
            :class="typeGroup === g.id ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-accent'" :aria-pressed="typeGroup === g.id" @click="typeGroup = g.id">{{ g.label }} <span class="opacity-75">{{ counts[g.id] || 0 }}</span></button>
        </div>
        <div class="relative">
          <Search class="h-3.5 w-3.5 absolute left-2 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <input v-model="text" type="search" class="h-7 rounded-md border border-border bg-background pl-7 pr-2 text-xs" placeholder="Name, key, type or folder" aria-label="Search deleted content" />
        </div>
        <label class="flex items-center gap-1.5" title="Content Builder's Recycle Bin shows only this business unit's items; this adds items shared with it"><input v-model="includeShared" type="checkbox" data-include-shared /> Include shared items</label>
        <div class="flex-1" />
        <a :href="contentBuilderUrl(stack)" target="_blank" rel="noopener" class="inline-flex items-center gap-1 text-primary hover:underline" data-open-content-builder><ExternalLink class="h-3.5 w-3.5" /> Open in Content Builder to restore</a>
      </div>
      <p class="px-3 py-2 text-xs text-muted-foreground border-b border-border">SFMC does not give the date an item was deleted. Last modified is the last change before it went to the Recycle Bin. Restore from the Recycle Bin in Content Builder.</p>
      <SfmcErrorNotice v-if="contentError" :error="contentError" :retrying="contentBusy" class="m-3" @retry="loadContent" />
      <div v-if="contentBusy && !content" class="flex items-center gap-2 p-4 text-sm text-muted-foreground"><Loader2 class="h-4 w-4 animate-spin" /> Reading the Recycle Bin…</div>
      <DataTable v-else :columns="contentColumns" :rows="contentRows" storage-key="recycle-bin-content" empty-text="No deleted items to show." />
    </section>
  </div>
</template>
