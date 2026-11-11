<script setup>
// Sending > Event notifications (user, 2026-11-10): the Event Notification Service (ENS)
// callbacks and subscriptions registered in this business unit, every event type a
// subscription can ask for (from Salesforce's documentation: SFMC has no API listing
// them), and a sample CloudPage that can serve as a callback URL. Read-only: callbacks
// and subscriptions are created with the user's own API integration, not here.
import { computed, ref } from 'vue'
import { Loader2, RefreshCw, ExternalLink, Copy, Check } from 'lucide-vue-next'
import Button from '@/components/ui/button/Button.vue'
import SfmcErrorNotice from '@/components/results/SfmcErrorNotice.vue'
import DataTable from '@/components/results/DataTable.vue'
import StatusBadge from '@/components/results/StatusBadge.vue'
import CodeView from '@/components/results/CodeView.vue'
import { useStack, whenStack } from '@/composables/useStack.js'
import { withReconnect, searchError } from '@/utils/sfmcErrors.js'
import { fetchEns } from '@/utils/messagingApi.js'
import { ENS_EVENT_GROUPS, ENS_DOCS, ENS_SAMPLE_PAGE, ENS_SAMPLE_DES, ENS_VERIFY_CURL, ensEventInfo } from '@/data/ensEvents.js'
import { showToast } from '@/composables/useToast.js'

const { stack } = useStack()
const data = ref(null)
const busy = ref(false)
const error = ref(null)
async function load() {
  const s = stack.value
  busy.value = true
  error.value = null
  try { data.value = await withReconnect(s, () => fetchEns(s)) } catch (e) { error.value = searchError(e, 'read the event notification callbacks') } finally { busy.value = false }
}
whenStack(load)

const subsByCallback = computed(() => {
  const m = new Map()
  for (const s of data.value?.subscriptions || []) m.set(s.callbackId, [...(m.get(s.callbackId) || []), s])
  return m
})
const callbackRows = computed(() => (data.value?.callbacks || []).map((c) => ({ ...c, id: c.callbackId, subscriptions: (subsByCallback.value.get(c.callbackId) || []).length, retry: c.retryConfig?.enabled === false ? 'Off' : 'On' })))
const callbackColumns = [
  { key: 'callbackName', label: 'Callback' }, { key: 'url', label: 'URL' }, { key: 'status', label: 'Status' }, { key: 'statusReason', label: 'Reason' },
  { key: 'maxBatchSize', label: 'Batch size' }, { key: 'retry', label: 'Retries' }, { key: 'subscriptions', label: 'Subscriptions' }, { key: 'callbackId', label: 'Callback ID', hidden: true },
]
const subRows = computed(() => (data.value?.subscriptions || []).map((s) => ({ ...s, id: s.subscriptionId, events: (s.eventCategoryTypes || []).join(', '), filterText: (s.filters || []).filter(Boolean).join('; ') })))
const subColumns = [
  { key: 'subscriptionName', label: 'Subscription' }, { key: 'callbackName', label: 'Callback' }, { key: 'events', label: 'Event types' },
  { key: 'filterText', label: 'Filters' }, { key: 'status', label: 'Status' }, { key: 'statusReason', label: 'Reason', hidden: true }, { key: 'subscriptionId', label: 'Subscription ID', hidden: true },
]
// Which documented types are subscribed to by at least one active subscription.
const subscribed = computed(() => new Set((data.value?.subscriptions || []).filter((s) => /active/i.test(s.status || '')).flatMap((s) => (s.eventCategoryTypes || []).map((t) => t.toLowerCase()))))
const unknownTypes = computed(() => [...new Set((data.value?.subscriptions || []).flatMap((s) => s.eventCategoryTypes || []))].filter((t) => !ensEventInfo(t)))

async function copy(text, what) {
  try { await navigator.clipboard.writeText(text); showToast(`${what} copied.`) } catch { showToast('Could not copy.') }
}
const docUrl = (slug) => `https://developer.salesforce.com/docs/marketing/marketing-cloud/guide/${slug}.html`
</script>

<template>
  <div class="p-4 space-y-4 max-w-7xl">
    <div class="flex flex-wrap items-center gap-2">
      <h1 class="text-lg font-semibold">Event notifications</h1>
      <span class="text-xs text-muted-foreground">Event Notification Service (ENS) callbacks and subscriptions in this business unit. Read only.</span>
      <div class="flex-1" />
      <a :href="ENS_DOCS" target="_blank" rel="noopener" class="inline-flex items-center gap-1 text-xs text-primary hover:underline">ENS documentation <ExternalLink class="h-3 w-3" /></a>
      <Button variant="outline" size="sm" class="gap-1" :disabled="busy" @click="load"><Loader2 v-if="busy" class="h-3.5 w-3.5 animate-spin" /><RefreshCw v-else class="h-3.5 w-3.5" /> Refresh</Button>
    </div>
    <SfmcErrorNotice v-if="error" :error="error" :retrying="busy" @retry="load" />

    <section class="rounded-lg border border-border bg-card">
      <h2 class="px-3 py-2 border-b border-border text-sm font-semibold">Callbacks ({{ callbackRows.length }})</h2>
      <div v-if="busy && !data" class="flex items-center gap-2 p-4 text-sm text-muted-foreground"><Loader2 class="h-4 w-4 animate-spin" /> Reading…</div>
      <DataTable v-else :columns="callbackColumns" :rows="callbackRows" storage-key="ens-callbacks" empty-text="No callbacks registered in this business unit.">
        <template #cell-status="{ row }"><StatusBadge :status="row.status" /></template>
        <template #cell-url="{ row }"><span class="font-mono break-all">{{ row.url }}</span></template>
      </DataTable>
    </section>

    <section class="rounded-lg border border-border bg-card">
      <h2 class="px-3 py-2 border-b border-border text-sm font-semibold">Subscriptions ({{ subRows.length }})</h2>
      <DataTable v-if="data" :columns="subColumns" :rows="subRows" storage-key="ens-subscriptions" empty-text="No subscriptions.">
        <template #cell-status="{ row }"><StatusBadge :status="row.status" /></template>
        <template #cell-events="{ row }">
          <span class="flex flex-wrap gap-1"><span v-for="t in row.eventCategoryTypes || []" :key="t" class="rounded bg-muted px-1.5 py-px font-mono text-[11px]" :title="ensEventInfo(t)?.desc || 'Not in the documented list'">{{ t }}</span></span>
        </template>
      </DataTable>
      <p v-if="unknownTypes.length" class="px-3 py-2 text-xs text-muted-foreground">Not in the documented list: {{ unknownTypes.join(', ') }}.</p>
    </section>

    <section class="rounded-lg border border-border bg-card p-3 text-xs space-y-3" data-ens-types>
      <h2 class="text-sm font-semibold">Event types a subscription can ask for</h2>
      <p class="text-muted-foreground">From Salesforce's documentation (SFMC has no API that lists them). A tick means an active subscription in this business unit receives it. Filters: the data items a subscription filter can use for that type (for example <span class="font-mono">definitionKey=welcome</span>).</p>
      <div v-for="g in ENS_EVENT_GROUPS" :key="g.title">
        <h3 class="font-semibold mb-1">{{ g.title }} <a :href="docUrl(g.doc)" target="_blank" rel="noopener" class="font-normal text-primary hover:underline">docs</a></h3>
        <table class="w-full">
          <tbody>
            <tr v-for="[name, desc, filters] in g.events" :key="name" class="border-t border-border">
              <td class="py-1 pr-2 w-6 text-emerald-600"><Check v-if="subscribed.has(name.toLowerCase())" class="h-3.5 w-3.5" aria-label="Subscribed" /></td>
              <td class="py-1 pr-3 font-mono whitespace-nowrap">{{ name }}</td>
              <td class="py-1 pr-3">{{ desc }}</td>
              <td class="py-1 text-muted-foreground">{{ filters }}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </section>

    <section class="rounded-lg border border-border bg-card p-3 text-xs space-y-3" data-ens-sample>
      <h2 class="text-sm font-semibold">Sample callback page</h2>
      <p>A CloudPage that can be registered as a callback URL. It stores the verification key and every notification in two data extensions. The Toolkit does not create it: copy it into Content Builder.</p>
      <ol class="list-decimal pl-5 space-y-1">
        <li>Create the data extensions: <span v-for="d in ENS_SAMPLE_DES" :key="d.name" class="block"><span class="font-mono">{{ d.name }}</span>: {{ d.fields }}</span></li>
        <li>In CloudPages, create a <b>JSON Code Resource</b>, paste the code below and publish it. Its URL has no query string, which ENS needs.</li>
        <li>With your own API integration (Event Notifications Callbacks: Create), register the URL (<span class="font-mono">POST /platform/v1/ens-callbacks</span>) and save the <b>signatureKey</b> in the answer: SFMC shows it only once.</li>
        <li>SFMC posts a single-use verification key to the page right away; it lands in <span class="font-mono">ENS_Verification</span>. Send it back to verify the callback:</li>
      </ol>
      <div class="relative"><CodeView :code="ENS_VERIFY_CURL" lang="text" max-height="140px" /><button class="absolute top-1 right-1 p-1 rounded bg-card hover:bg-accent" title="Copy" @click="copy(ENS_VERIFY_CURL, 'Command')"><Copy class="h-3.5 w-3.5" /></button></div>
      <ol start="5" class="list-decimal pl-5 space-y-1"><li>Create a subscription (<span class="font-mono">POST /platform/v1/ens-subscriptions</span>) with the event types you want. It then shows above.</li></ol>
      <div class="relative"><CodeView :code="ENS_SAMPLE_PAGE" lang="javascript" max-height="420px" /><button class="absolute top-1 right-1 p-1 rounded bg-card hover:bg-accent" title="Copy" data-ens-copy-sample @click="copy(ENS_SAMPLE_PAGE, 'Sample page')"><Copy class="h-3.5 w-3.5" /></button></div>
      <ul class="list-disc pl-5 space-y-1 text-muted-foreground">
        <li>ENS waits up to 3 seconds for a 2xx answer, then retries up to three times and keeps trying deferred batches for up to 7 days. Keep the page fast; it only stores what arrives.</li>
        <li>Every notification carries an <span class="font-mono">x-sfmc-ens-signature</span> header (HMAC-SHA256 of the body with the callback's signature key, base64). Server-side JavaScript in a CloudPage has no HMAC function, so the page stores the header with the batch's first event for checking elsewhere. Do not act on a notification you cannot check.</li>
        <li>ENS delivers each event at least once: the same event can arrive twice.</li>
        <li>Not run by the Toolkit or tested in SFMC: check it in a test business unit first.</li>
      </ul>
    </section>
  </div>
</template>
