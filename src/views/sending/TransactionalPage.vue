<script setup>
// Sending > Transactional messages (user, 2026-11-10): the Transactional Messaging API's
// send definitions (email and SMS) with each active one's queue, a definition's settings,
// a message's status by messageKey, and the email messages that were not sent. Read-only.
import { computed, ref } from 'vue'
import { Loader2, RefreshCw, Search, X } from 'lucide-vue-next'
import Button from '@/components/ui/button/Button.vue'
import SfmcErrorNotice from '@/components/results/SfmcErrorNotice.vue'
import DataTable from '@/components/results/DataTable.vue'
import DownloadMenu from '@/components/results/DownloadMenu.vue'
import StatusBadge from '@/components/results/StatusBadge.vue'
import CodeView from '@/components/results/CodeView.vue'
import { useStack, whenStack } from '@/composables/useStack.js'
import { withReconnect, searchError } from '@/utils/sfmcErrors.js'
import { fetchTmsDefinitions, fetchTmsDefinition, fetchTmsQueue, fetchTmsMessage, fetchTmsNotSent } from '@/utils/messagingApi.js'
import { formatDateTime } from '@/utils/format.js'
import { runInBatches } from '@/utils/batchRunner.js'

const { stack } = useStack()
const channel = ref('email')
const defs = ref({ email: null, sms: null })
const queues = ref({})
const busy = ref(false)
const error = ref(null)
const hideDeleted = ref(true)

async function load() {
  const s = stack.value
  busy.value = true
  error.value = null
  try {
    const [email, sms] = await Promise.all(['email', 'sms'].map((c) => withReconnect(s, () => fetchTmsDefinitions(s, c))))
    defs.value = { email, sms }
    queues.value = {}
    const active = [...email.map((d) => ['email', d]), ...sms.map((d) => ['sms', d])].filter(([, d]) => /active/i.test(d.status || ''))
    await runInBatches(active, 4, async ([c, d]) => {
      try { queues.value = { ...queues.value, [`${c}:${d.definitionKey}`]: await fetchTmsQueue(s, c, d.definitionKey) } } catch { /* queue unknown */ }
    })
  } catch (e) { error.value = searchError(e, 'read the transactional send definitions') } finally { busy.value = false }
}
whenStack(load)

const rows = computed(() => (defs.value[channel.value] || [])
  .filter((d) => !hideDeleted.value || !/deleted/i.test(d.status || ''))
  .map((d) => {
    const q = queues.value[`${channel.value}:${d.definitionKey}`]
    return { ...d, id: d.definitionKey, queued: q ? q.count : null, oldest: q && q.count ? Math.round((q.ageSeconds || 0) / 60) : null, created: formatDateTime(d.createdDate), modified: formatDateTime(d.modifiedDate) }
  }))
const columns = [
  { key: 'name', label: 'Name' }, { key: 'definitionKey', label: 'Definition key' }, { key: 'status', label: 'Status' },
  { key: 'queued', label: 'Queued' }, { key: 'oldest', label: 'Oldest (min)' }, { key: 'created', label: 'Created' }, { key: 'modified', label: 'Modified', hidden: true },
]
const getDoc = () => ({ title: `Transactional ${channel.value} definitions`, blocks: [{ type: 'table', columns: columns.map((c) => c.label), rows: rows.value.map((r) => columns.map((c) => String(r[c.key] ?? ''))) }] })

// One definition's settings.
const open = ref(null) // { channel, key, data | error }
async function openDef(r) {
  open.value = { channel: channel.value, key: r.definitionKey, name: r.name, loading: true }
  try { open.value = { ...open.value, loading: false, data: await fetchTmsDefinition(stack.value, channel.value, r.definitionKey) } } catch (e) { open.value = { ...open.value, loading: false, error: searchError(e, 'read the definition') } }
}
const defRows = computed(() => {
  const d = open.value?.data
  if (!d) return []
  return [
    ['Name', d.name], ['Definition key', d.definitionKey], ['Status', d.status], ['Description', d.description], ['Send classification', d.classification],
    ['Email (content customer key)', d.content?.customerKey], ['Subscriber data extension', d.subscriptions?.dataExtension], ['List', d.subscriptions?.list],
    ['Add subscribers', d.subscriptions?.autoAddSubscriber == null ? '' : d.subscriptions.autoAddSubscriber ? 'Yes' : 'No'],
    ['Update subscribers', d.subscriptions?.updateSubscriber == null ? '' : d.subscriptions.updateSubscriber ? 'Yes' : 'No'],
    ['Track links', d.options?.trackLinks == null ? '' : d.options.trackLinks ? 'Yes' : 'No'], ['Send logging', d.options?.isSendLogging == null ? '' : d.options.isSendLogging ? 'Yes' : 'No'],
    ['Journey', d.journey?.interactionKey || ''], ['Created', formatDateTime(d.createdDate)], ['Modified', formatDateTime(d.modifiedDate)], ['ID', d.definitionId],
  ].filter(([, v]) => v != null && v !== '')
})

// Message status by messageKey.
const msgChannel = ref('email')
const msgKey = ref('')
const msg = ref(null) // { loading } | { data } | { error }
async function lookUp() {
  const key = msgKey.value.trim()
  if (!key) return
  msg.value = { loading: true }
  try { msg.value = { data: await fetchTmsMessage(stack.value, msgChannel.value, key) } } catch (e) { msg.value = { error: e.notFound ? e.message : searchError(e, 'read the message status') } }
}

// Email messages not sent.
const notSent = ref(null)
const notSentBusy = ref(false)
const notSentError = ref(null)
async function loadNotSent() {
  notSentBusy.value = true
  notSentError.value = null
  try { notSent.value = (await fetchTmsNotSent(stack.value)).messages || [] } catch (e) { notSentError.value = searchError(e, 'read the messages not sent') } finally { notSentBusy.value = false }
}
const notSentColumns = computed(() => [...new Set((notSent.value || []).flatMap((m) => Object.keys(m)))].slice(0, 10).map((k) => ({ key: k, label: k })))
const notSentRows = computed(() => (notSent.value || []).map((m, i) => ({ id: i, ...Object.fromEntries(Object.entries(m).map(([k, v]) => [k, v && typeof v === 'object' ? JSON.stringify(v) : v])) })))
</script>

<template>
  <div class="p-4 space-y-4 max-w-7xl">
    <div class="flex flex-wrap items-center gap-2">
      <h1 class="text-lg font-semibold">Transactional messages</h1>
      <span class="text-xs text-muted-foreground">Transactional Messaging API send definitions. Read only: nothing is sent or changed.</span>
      <div class="flex-1" />
      <DownloadMenu :get-doc="getDoc" file-name="transactional-definitions" :disabled="!rows.length" />
      <Button variant="outline" size="sm" class="gap-1" :disabled="busy" @click="load"><Loader2 v-if="busy" class="h-3.5 w-3.5 animate-spin" /><RefreshCw v-else class="h-3.5 w-3.5" /> Refresh</Button>
    </div>
    <SfmcErrorNotice v-if="error" :error="error" :retrying="busy" @retry="load" />

    <section class="rounded-lg border border-border bg-card">
      <div class="flex flex-wrap items-center gap-3 px-3 py-2 border-b border-border text-xs">
        <div class="flex gap-0.5 border border-border rounded-md p-0.5" role="group" aria-label="Channel">
          <button v-for="c in ['email', 'sms']" :key="c" class="px-2 py-0.5 rounded" :class="channel === c ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-accent'" :aria-pressed="channel === c" @click="channel = c">
            {{ c === 'email' ? 'Email' : 'SMS' }} ({{ (defs[c] || []).length }})
          </button>
        </div>
        <label class="flex items-center gap-1.5"><input v-model="hideDeleted" type="checkbox" /> Hide deleted</label>
        <span class="text-muted-foreground">Queued: messages waiting to be sent for an active definition, and how old the oldest is. Click a row for its settings.</span>
      </div>
      <div v-if="busy && !defs.email" class="flex items-center gap-2 p-4 text-sm text-muted-foreground"><Loader2 class="h-4 w-4 animate-spin" /> Reading the definitions…</div>
      <DataTable v-else :columns="columns" :rows="rows" storage-key="tms-defs" empty-text="No transactional send definitions for this channel.">
        <template #cell-name="{ row }"><button class="text-primary hover:underline text-left" data-tms-open @click="openDef(row)">{{ row.name }}</button></template>
        <template #cell-status="{ row }"><StatusBadge :status="row.status" /></template>
        <template #cell-queued="{ row }"><span :class="row.queued > 0 ? 'font-semibold text-amber-700 dark:text-amber-400' : ''">{{ row.queued ?? '' }}</span></template>
      </DataTable>
    </section>

    <section v-if="open" class="rounded-lg border border-border bg-card p-3 text-xs" data-tms-definition>
      <div class="flex items-center gap-2 mb-2"><h2 class="text-sm font-semibold">{{ open.name }}</h2><span class="text-muted-foreground">{{ open.channel === 'email' ? 'Email' : 'SMS' }}</span><div class="flex-1" /><button class="p-1 rounded hover:bg-accent" aria-label="Close" @click="open = null"><X class="h-4 w-4" /></button></div>
      <div v-if="open.loading" class="flex items-center gap-2 text-muted-foreground"><Loader2 class="h-3.5 w-3.5 animate-spin" /> Reading…</div>
      <SfmcErrorNotice v-else-if="open.error" :error="open.error" />
      <dl v-else class="grid grid-cols-[minmax(9rem,14rem)_1fr] gap-x-4 gap-y-1"><template v-for="[k, v] in defRows" :key="k"><dt class="text-muted-foreground">{{ k }}</dt><dd class="wrap-break-word">{{ v }}</dd></template></dl>
    </section>

    <section class="rounded-lg border border-border bg-card p-3 text-xs space-y-2">
      <h2 class="text-sm font-semibold">Look up a message</h2>
      <p class="text-muted-foreground">The status of one message, by the messageKey given when it was sent.</p>
      <form class="flex flex-wrap items-center gap-2" @submit.prevent="lookUp">
        <select v-model="msgChannel" aria-label="Channel" class="h-8 rounded-md border border-border bg-background px-2"><option value="email">Email</option><option value="sms">SMS</option></select>
        <input v-model="msgKey" aria-label="messageKey" placeholder="messageKey" class="h-8 w-80 rounded-md border border-border bg-background px-2" />
        <Button type="submit" size="sm" class="gap-1" :disabled="!msgKey.trim() || msg?.loading"><Search class="h-3.5 w-3.5" /> Look up</Button>
      </form>
      <div v-if="msg?.loading" class="flex items-center gap-2 text-muted-foreground"><Loader2 class="h-3.5 w-3.5 animate-spin" /> Reading…</div>
      <p v-else-if="msg?.error && typeof msg.error === 'string'" class="text-muted-foreground" data-tms-message-none>{{ msg.error }}</p>
      <SfmcErrorNotice v-else-if="msg?.error" :error="msg.error" />
      <CodeView v-else-if="msg?.data" :code="JSON.stringify(msg.data, null, 2)" lang="json" max-height="260px" />
    </section>

    <section class="rounded-lg border border-border bg-card p-3 text-xs space-y-2">
      <div class="flex items-center gap-2"><h2 class="text-sm font-semibold">Email messages not sent</h2><div class="flex-1" />
        <Button variant="outline" size="sm" class="gap-1" :disabled="notSentBusy" data-tms-notsent @click="loadNotSent"><Loader2 v-if="notSentBusy" class="h-3.5 w-3.5 animate-spin" /> {{ notSent ? 'Read again' : 'Show' }}</Button></div>
      <p class="text-muted-foreground">Transactional emails SFMC did not send (for example an unsubscribed or held address), newest first, up to 100.</p>
      <SfmcErrorNotice v-if="notSentError" :error="notSentError" />
      <p v-else-if="notSent && !notSent.length" class="text-muted-foreground italic">None.</p>
      <DataTable v-else-if="notSent" :columns="notSentColumns" :rows="notSentRows" storage-key="tms-notsent" />
    </section>
  </div>
</template>
