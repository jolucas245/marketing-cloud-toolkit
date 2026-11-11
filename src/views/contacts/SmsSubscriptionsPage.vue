<script setup>
// Contacts > SMS subscriptions (API idea 17, user 2026-11-11): MobileConnect subscription
// status per short code and keyword for up to 500 mobile numbers or subscriber keys.
// REST POST sms/v1/contacts/subscriptions (a lookup; utils/smsSubscriptions.js). Without
// MobileConnect SFMC refuses the call and the page says so in a note. Phone numbers stay
// on this page: they are not stored, not logged and not put in the address bar.
// Read-only: nothing is changed in SFMC.
import { computed, ref } from 'vue'
import { Loader2, Search, Info } from 'lucide-vue-next'
import Button from '@/components/ui/button/Button.vue'
import SfmcErrorNotice from '@/components/results/SfmcErrorNotice.vue'
import DataTable from '@/components/results/DataTable.vue'
import DownloadMenu from '@/components/results/DownloadMenu.vue'
import { useStack } from '@/composables/useStack.js'
import { searchError } from '@/utils/sfmcErrors.js'
import { parseLookupInput, lookupSmsSubscriptions, statusWords, SMS_LOOKUP_LIMIT } from '@/utils/smsSubscriptions.js'
import { formatDateTime } from '@/utils/format.js'

const { stack } = useStack()
const text = ref('')
const mode = ref('auto') // auto | mobile | key
const busy = ref(false)
const error = ref(null)
const result = ref(null) // { kind, rows, notFound, invalid, over } | { refused, status }

const parsed = computed(() => parseLookupInput(text.value, mode.value))

async function lookUp() {
  const p = parsed.value
  if (!p.values.length || !stack.value) return
  busy.value = true
  error.value = null
  result.value = null
  try {
    const r = await lookupSmsSubscriptions(stack.value, p.kind, p.values)
    result.value = { ...r, kind: p.kind, invalid: p.invalid, over: p.over, asked: p.values.length }
  } catch (e) { error.value = searchError(e, 'look up the SMS subscriptions') } finally { busy.value = false }
}

const rows = computed(() => (result.value?.rows || []).map((r, i) => ({
  ...r, id: i, statusText: statusWords(r.status), optIn: formatDateTime(r.optInDate) || r.optInDate, optOut: formatDateTime(r.optOutDate) || r.optOutDate,
})))
const columns = [
  { key: 'mobileNumber', label: 'Mobile number' }, { key: 'subscriberKey', label: 'Subscriber key' },
  { key: 'shortCode', label: 'Short code' }, { key: 'keyword', label: 'Keyword' }, { key: 'statusText', label: 'Status' },
  { key: 'optIn', label: 'Opted in', sortValue: (r) => r.optInDate }, { key: 'optOut', label: 'Opted out', sortValue: (r) => r.optOutDate },
  { key: 'status', label: 'Status as SFMC sends it', hidden: true },
]
function getDoc() {
  return {
    title: 'SMS subscriptions',
    blocks: [
      { type: 'table', columns: columns.map((c) => c.label), rows: rows.value.map((r) => columns.map((c) => String(r[c.key] ?? ''))) },
      ...(result.value?.notFound?.length ? [{ type: 'h', level: 2, text: 'No subscription found' }, { type: 'p', text: result.value.notFound.join(', ') }] : []),
    ],
  }
}
</script>

<template>
  <div class="p-4 space-y-4 max-w-7xl">
    <div class="flex flex-wrap items-center gap-2">
      <h1 class="text-lg font-semibold">SMS subscriptions</h1>
      <span class="text-xs text-muted-foreground">Which MobileConnect short codes and keywords a number or subscriber is opted in to. Read only.</span>
      <div class="flex-1" />
      <DownloadMenu :get-doc="getDoc" file-name="sms-subscriptions" :disabled="!result || !result.rows" />
    </div>

    <form class="space-y-2 text-xs" @submit.prevent="lookUp">
      <textarea v-model="text" rows="4" aria-label="Mobile numbers or subscriber keys" :placeholder="`Mobile numbers with the country code (15551234567) or subscriber keys, one per line, up to ${SMS_LOOKUP_LIMIT}`"
        class="w-full max-w-2xl rounded-md border border-border bg-background p-2 font-mono" data-sms-text />
      <div class="flex flex-wrap items-center gap-2">
        <div class="flex gap-0.5 border border-border rounded-md p-0.5" role="group" aria-label="Look up by">
          <button v-for="[k, l] in [['auto', 'Detect'], ['mobile', 'Mobile numbers'], ['key', 'Subscriber keys']]" :key="k" type="button" class="px-2 py-0.5 rounded"
            :class="mode === k ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-accent'" :aria-pressed="mode === k" @click="mode = k">{{ l }}</button>
        </div>
        <Button type="submit" size="sm" class="gap-1" :disabled="busy || !parsed.values.length || !stack" data-sms-search>
          <Loader2 v-if="busy" class="h-3.5 w-3.5 animate-spin" /><Search v-else class="h-3.5 w-3.5" /> Look up
        </Button>
        <span v-if="parsed.values.length" class="text-muted-foreground">{{ parsed.values.length }} {{ parsed.kind === 'mobile' ? 'mobile numbers' : 'subscriber keys' }}</span>
        <span v-if="parsed.invalid.length" class="text-amber-700 dark:text-amber-400">{{ parsed.invalid.length }} not a mobile number in country-code format, left out</span>
        <span v-if="parsed.over" class="text-amber-700 dark:text-amber-400">{{ parsed.over }} over the limit of {{ SMS_LOOKUP_LIMIT }}, left out</span>
      </div>
    </form>

    <SfmcErrorNotice v-if="error" :error="error" :retrying="busy" @retry="lookUp" />

    <p v-if="result?.refused" class="flex items-start gap-1.5 rounded-md border border-sky-200 bg-sky-50 dark:border-sky-900 dark:bg-sky-950/40 p-2 text-xs text-sky-900 dark:text-sky-200" data-sms-refused>
      <Info class="h-3.5 w-3.5 mt-0.5 shrink-0" />
      SFMC did not answer the SMS lookup{{ result.status ? ` (${result.status})` : '' }}. This account or business unit probably has no MobileConnect, or your user may not read it. Nothing is wrong with the Toolkit or your session.
    </p>

    <template v-else-if="result">
      <section class="rounded-lg border border-border bg-card">
        <h2 class="px-3 py-2 border-b border-border text-sm font-semibold">Subscriptions <span class="font-normal text-xs text-muted-foreground">{{ rows.length }}</span></h2>
        <DataTable :columns="columns" :rows="rows" storage-key="sms-subscriptions" empty-text="No SMS subscriptions for these entries." />
      </section>
      <p v-if="result.notFound.length" class="text-xs text-muted-foreground" data-sms-not-found>
        No subscription found for {{ result.notFound.length }} of {{ result.asked }}: {{ result.notFound.slice(0, 20).join(', ') }}{{ result.notFound.length > 20 ? ', ...' : '' }}
      </p>
      <p class="flex items-start gap-1.5 text-xs text-muted-foreground"><Info class="h-3.5 w-3.5 mt-0.5 shrink-0" /> Opted out or no subscription on a keyword means MobileConnect sends for that keyword skip the number. Numbers are matched as SFMC stores them: country code first, no plus sign or spaces.</p>
    </template>
  </div>
</template>
