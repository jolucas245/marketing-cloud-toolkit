<script setup>
// Setup > Business units (user, 2026-11-10): every business unit of the account with its
// MID, parent, active flag, type and dates, in tree order (children indented under their
// parent), so "which BU is MID x" is one search away. SOAP BusinessUnit with
// QueryAllAccounts, read through the shared cache in setupApi.js. Read-only.
import { computed, ref } from 'vue'
import { Loader2, RefreshCw } from 'lucide-vue-next'
import Button from '@/components/ui/button/Button.vue'
import SfmcErrorNotice from '@/components/results/SfmcErrorNotice.vue'
import DataTable from '@/components/results/DataTable.vue'
import DownloadMenu from '@/components/results/DownloadMenu.vue'
import { useStack, whenStack } from '@/composables/useStack.js'
import { searchError } from '@/utils/sfmcErrors.js'
import { loadBusinessUnits, businessUnitTree, accountTypeLabel, findBusinessUnit } from '@/utils/setupApi.js'
import { formatDateTime } from '@/utils/format.js'

const { stack } = useStack()
const list = ref(null)
const busy = ref(false)
const error = ref(null)
const hideInactive = ref(false)
const midQuery = ref('')
async function load(force = false) {
  busy.value = true
  error.value = null
  try { list.value = await loadBusinessUnits(stack.value, { force }) } catch (e) { error.value = searchError(e, 'read the business units') } finally { busy.value = false }
}
whenStack(() => load())

const rows = computed(() => businessUnitTree(list.value || [])
  .filter((b) => !hideInactive.value || b.active)
  .map((b) => ({
    ...b, id: b.mid, parent: b.parentId ? (b.parentName || String(b.parentId)) : 'Top level (enterprise)', status: b.active ? 'Active' : 'Inactive',
    type: accountTypeLabel(b.accountType), created: formatDateTime(b.createdDate), modified: formatDateTime(b.modifiedDate),
  })))
const summary = computed(() => {
  const all = list.value || []
  return { all: all.length, active: all.filter((b) => b.active).length }
})
// "Which BU is MID x": the unit with that MID and its path from the top.
const midMatch = computed(() => {
  const mid = String(midQuery.value || '').trim()
  if (!mid || !list.value) return null
  return findBusinessUnit(list.value, mid)
})
const columns = [
  { key: 'mid', label: 'MID' }, { key: 'name', label: 'Name' }, { key: 'parent', label: 'Parent' }, { key: 'parentId', label: 'Parent MID', hidden: true },
  { key: 'status', label: 'Status' }, { key: 'type', label: 'Type' }, { key: 'key', label: 'External key', hidden: true },
  { key: 'businessName', label: 'Business name', hidden: true },
  { key: 'created', label: 'Created', sortValue: (r) => r.createdDate }, { key: 'modified', label: 'Modified', sortValue: (r) => r.modifiedDate },
]
const getDoc = () => ({ title: 'Business units', blocks: [{ type: 'table', columns: columns.map((c) => c.label), rows: rows.value.map((r) => columns.map((c) => String(r[c.key] ?? ''))) }] })
</script>

<template>
  <div class="p-4 space-y-4 max-w-7xl">
    <div class="flex flex-wrap items-center gap-2">
      <h1 class="text-lg font-semibold">Business units</h1>
      <span class="text-xs text-muted-foreground">Every business unit of this Marketing Cloud account. Search by name or MID. Read only.</span>
      <div class="flex-1" />
      <DownloadMenu :get-doc="getDoc" file-name="business-units" :disabled="!rows.length" />
      <Button variant="outline" size="sm" class="gap-1" :disabled="busy" @click="load(true)"><Loader2 v-if="busy" class="h-3.5 w-3.5 animate-spin" /><RefreshCw v-else class="h-3.5 w-3.5" /> Refresh</Button>
    </div>
    <SfmcErrorNotice v-if="error" :error="error" :retrying="busy" @retry="load(true)" />
    <section v-if="list" class="rounded-lg border border-border bg-card px-3 py-2 text-xs flex flex-wrap items-center gap-2">
      <label for="bu-mid" class="font-semibold">Which business unit is MID</label>
      <input id="bu-mid" v-model="midQuery" data-bu-mid inputmode="numeric" placeholder="e.g. 510000123" class="h-7 w-40 rounded-md border border-input bg-background px-2" />
      <template v-if="midMatch">
        <span v-if="midMatch.unit" data-bu-mid-result>{{ midMatch.unit.name }} <span class="text-muted-foreground">({{ midMatch.unit.active ? 'Active' : 'Inactive' }}<template v-if="midMatch.path.length > 1">, {{ midMatch.path.map((b) => b.name).join(' > ') }}</template>)</span></span>
        <span v-else class="text-amber-700 dark:text-amber-400" data-bu-mid-result>No business unit with MID {{ midQuery.trim() }} in this account.</span>
      </template>
    </section>
    <section class="rounded-lg border border-border bg-card">
      <div class="flex flex-wrap items-center gap-3 px-3 py-2 border-b border-border text-xs">
        <span v-if="list">{{ summary.all }} business units ({{ summary.active }} active)</span>
        <label class="flex items-center gap-1.5"><input v-model="hideInactive" type="checkbox" data-bu-hide-inactive /> Hide inactive</label>
        <span class="text-muted-foreground">Children are indented under their parent; sorting a column drops the tree order until sorting is turned off.</span>
      </div>
      <div v-if="busy && !list" class="flex items-center gap-2 p-4 text-sm text-muted-foreground"><Loader2 class="h-4 w-4 animate-spin" /> Reading the business units…</div>
      <DataTable v-else :columns="columns" :rows="rows" storage-key="business-units" empty-text="No business units to show.">
        <template #cell-name="{ row }"><span :style="{ paddingLeft: `${row.depth * 1.25}rem` }" :class="row.depth ? '' : 'font-semibold'"><span v-if="row.depth" class="text-muted-foreground" aria-hidden="true">└ </span>{{ row.name }}</span></template>
        <template #cell-status="{ row }"><span :class="row.active ? '' : 'text-muted-foreground'">{{ row.status }}</span></template>
      </DataTable>
    </section>
  </div>
</template>
