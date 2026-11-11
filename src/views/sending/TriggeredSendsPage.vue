<script setup>
// Sending > Triggered sends (user, 2026-11-10): every triggered send definition with
// SFMC's counts for it (sent, queued, not sent, opens, clicks, bounces), so stuck queues
// and errors stand out. SOAP TriggeredSendDefinition + TriggeredSendSummary. Read-only.
import { computed, ref } from 'vue'
import { Loader2, RefreshCw } from 'lucide-vue-next'
import Button from '@/components/ui/button/Button.vue'
import SfmcErrorNotice from '@/components/results/SfmcErrorNotice.vue'
import DataTable from '@/components/results/DataTable.vue'
import DownloadMenu from '@/components/results/DownloadMenu.vue'
import StatusBadge from '@/components/results/StatusBadge.vue'
import { useStack, whenStack } from '@/composables/useStack.js'
import { searchError } from '@/utils/sfmcErrors.js'
import { fetchTriggeredSends, triggeredSendFlags } from '@/utils/messagingApi.js'
import { formatDateTime } from '@/utils/format.js'

const { stack } = useStack()
const list = ref(null)
const busy = ref(false)
const error = ref(null)
const hideDeleted = ref(true)
const onlyFlagged = ref(false)
async function load() {
  busy.value = true
  error.value = null
  try { list.value = await fetchTriggeredSends(stack.value) } catch (e) { error.value = searchError(e, 'read the triggered sends') } finally { busy.value = false }
}
whenStack(load)

const rows = computed(() => (list.value || [])
  .filter((t) => !hideDeleted.value || !/deleted|canceled|moved/i.test(t.status || ''))
  .map((t) => ({ ...t, id: t.key, flags: triggeredSendFlags(t).join('; '), modified: formatDateTime(t.modifiedDate), created: formatDateTime(t.createdDate) }))
  .filter((t) => !onlyFlagged.value || t.flags))
const counts = computed(() => {
  const all = list.value || []
  return { total: all.length, active: all.filter((t) => /active/i.test(t.status || '')).length, flagged: all.filter((t) => triggeredSendFlags(t).length).length }
})
const columns = [
  { key: 'name', label: 'Name' }, { key: 'status', label: 'Status' }, { key: 'flags', label: 'Needs a look' },
  { key: 'sent', label: 'Sent' }, { key: 'queued', label: 'Queued' }, { key: 'notSentError', label: 'Not sent (error)' },
  { key: 'notSentOptOut', label: 'Not sent (opted out)', hidden: true }, { key: 'notSentUndeliverable', label: 'Not sent (undeliverable)', hidden: true },
  { key: 'bounces', label: 'Bounces' }, { key: 'opens', label: 'Unique opens' }, { key: 'clicks', label: 'Unique clicks' }, { key: 'optOuts', label: 'Opt-outs', hidden: true },
  { key: 'subject', label: 'Subject', hidden: true }, { key: 'fromAddress', label: 'From', hidden: true }, { key: 'sendClassification', label: 'Send classification', hidden: true },
  { key: 'emailId', label: 'Email ID', hidden: true }, { key: 'key', label: 'External key', hidden: true }, { key: 'description', label: 'Description', hidden: true },
  { key: 'modified', label: 'Modified' }, { key: 'created', label: 'Created', hidden: true },
]
const getDoc = () => ({ title: 'Triggered sends', blocks: [{ type: 'table', columns: columns.map((c) => c.label), rows: rows.value.map((r) => columns.map((c) => String(r[c.key] ?? ''))) }] })
</script>

<template>
  <div class="p-4 space-y-4 max-w-7xl">
    <div class="flex flex-wrap items-center gap-2">
      <h1 class="text-lg font-semibold">Triggered sends</h1>
      <span class="text-xs text-muted-foreground">Triggered send definitions and SFMC's counts for each. Read only.</span>
      <div class="flex-1" />
      <DownloadMenu :get-doc="getDoc" file-name="triggered-sends" :disabled="!rows.length" />
      <Button variant="outline" size="sm" class="gap-1" :disabled="busy" @click="load"><Loader2 v-if="busy" class="h-3.5 w-3.5 animate-spin" /><RefreshCw v-else class="h-3.5 w-3.5" /> Refresh</Button>
    </div>
    <SfmcErrorNotice v-if="error" :error="error" :retrying="busy" @retry="load" />
    <section class="rounded-lg border border-border bg-card">
      <div class="flex flex-wrap items-center gap-3 px-3 py-2 border-b border-border text-xs">
        <span>{{ counts.total }} definitions, {{ counts.active }} active, <span :class="counts.flagged ? 'font-semibold text-amber-700 dark:text-amber-400' : ''">{{ counts.flagged }} need a look</span></span>
        <label class="flex items-center gap-1.5"><input v-model="hideDeleted" type="checkbox" /> Hide deleted, canceled and moved</label>
        <label class="flex items-center gap-1.5"><input v-model="onlyFlagged" type="checkbox" data-ts-flagged /> Only those that need a look</label>
        <span class="text-muted-foreground">Needs a look: messages queued, or not sent because of an error.</span>
      </div>
      <div v-if="busy && !list" class="flex items-center gap-2 p-4 text-sm text-muted-foreground"><Loader2 class="h-4 w-4 animate-spin" /> Reading the triggered sends…</div>
      <DataTable v-else :columns="columns" :rows="rows" storage-key="triggered-sends" empty-text="No triggered sends to show.">
        <template #cell-status="{ row }"><StatusBadge :status="row.status" /></template>
        <template #cell-flags="{ row }"><span class="text-amber-700 dark:text-amber-400">{{ row.flags }}</span></template>
      </DataTable>
    </section>
  </div>
</template>
