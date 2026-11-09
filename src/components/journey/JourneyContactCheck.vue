<script setup>
// "Is a contact in this journey?" on a journey's page (feedback #1088): a few contact
// keys checked against this journey only, across its versions. Nothing is read until
// Check. Per key: contactMembership (in it now, which version) and the contact's
// journey history in the period, kept to this journey (utils/journeyPaths.js).
import { computed, ref } from 'vue'
import { Loader2, Search, ExternalLink } from 'lucide-vue-next'
import Button from '@/components/ui/button/Button.vue'
import ProgressBar from '@/components/ui/ProgressBar.vue'
import { withReconnect, searchError } from '@/utils/sfmcErrors.js'
import { fetchContactHistory, RANGES } from '@/utils/contactJourneys.js'
import { parseContactKeys, fetchMembershipMany, contactInJourney, journeyMatcher, MAX_CHECK_KEYS } from '@/utils/journeyPaths.js'
import { formatDateTime } from '@/utils/format.js'

const props = defineProps({
  stack: { type: String, default: '' },
  journey: { type: Object, required: true },
  versions: { type: Array, default: () => [] },
})

const text = ref('')
const days = ref(30)
const busy = ref(false)
const done = ref(0)
const total = ref(0)
const error = ref('')
const results = ref([])
const membershipError = ref('')
let generation = 0

const keys = computed(() => parseContactKeys(text.value))
const tooMany = computed(() => keys.value.length > MAX_CHECK_KEYS)

async function check() {
  const list = keys.value
  if (!list.length) { error.value = 'Enter at least one Contact Key.'; return }
  if (list.length > MAX_CHECK_KEYS) { error.value = `Check at most ${MAX_CHECK_KEYS} contact keys at a time.`; return }
  const gen = ++generation
  const stack = props.stack
  const matcher = journeyMatcher(props.journey, props.versions)
  error.value = ''
  membershipError.value = ''
  results.value = []
  busy.value = true
  done.value = 0
  total.value = list.length + 1
  let memberships = []
  try {
    memberships = (await withReconnect(stack, () => fetchMembershipMany(stack, list))).memberships
  } catch (e) {
    membershipError.value = searchError(e, 'read which journeys the contacts are in now').message
  }
  if (gen !== generation) return
  done.value = 1
  const out = []
  for (const key of list) {
    let row
    try {
      const h = await withReconnect(stack, () => fetchContactHistory(stack, key, { days: days.value }))
      row = contactInJourney({ contactKey: key, memberships, items: h.items, matcher })
    } catch (e) {
      row = { ...contactInJourney({ contactKey: key, memberships, items: [], matcher }), historyError: e.message || String(e) }
    }
    if (gen !== generation) return
    out.push(row)
    results.value = [...out]
    done.value++
  }
  busy.value = false
}

function clear() {
  generation++
  busy.value = false
  results.value = []
  error.value = ''
  membershipError.value = ''
}

const linkFor = (key) => ({ path: '/contact-journeys', query: { key, jid: props.journey.id || '', jkey: props.journey.key || '', jname: props.journey.name || '', jversion: String(props.journey.version ?? '') } })
const inNowText = (r) => (membershipError.value ? 'Unknown' : r.inNow ? 'Yes' : 'No')
const periodLabel = computed(() => RANGES.find((r) => r.days === days.value)?.label.toLowerCase() || '')
</script>

<template>
  <section class="rounded-lg border border-border bg-card p-3 space-y-3 text-xs" data-contact-check>
    <p class="text-muted-foreground max-w-3xl">Check one or more contacts against this journey only, in any of its versions: in it now, which version, the last step in the period and when they entered. Read-only; nothing is read until you press Check.</p>
    <form class="flex flex-wrap items-end gap-3" @submit.prevent="check">
      <label class="flex flex-col gap-0.5">Contact Keys (one per line, or separated by commas; up to {{ MAX_CHECK_KEYS }})
        <textarea v-model="text" rows="3" class="w-80 max-w-full rounded-md border border-border bg-background px-2 py-1 font-mono text-xs" aria-label="Contact Keys" data-check-keys />
      </label>
      <label class="flex flex-col gap-0.5">History period
        <select v-model.number="days" class="h-8 rounded-md border border-border bg-background px-2" aria-label="History period">
          <option v-for="r in RANGES" :key="r.days" :value="r.days">{{ r.label }}</option>
        </select>
      </label>
      <Button size="sm" class="h-8 text-xs" type="submit" :disabled="busy || !keys.length || tooMany || !stack" data-check-run>
        <Loader2 v-if="busy" class="h-3.5 w-3.5 mr-1 animate-spin" /><Search v-else class="h-3.5 w-3.5 mr-1" /> Check
      </Button>
      <Button v-if="results.length || busy" variant="outline" size="sm" class="h-8 text-xs" type="button" data-check-clear @click="clear">Clear</Button>
    </form>
    <p v-if="tooMany" class="text-amber-700 dark:text-amber-400">{{ keys.length }} keys: check at most {{ MAX_CHECK_KEYS }} at a time, or use Contact journeys for one contact at a time.</p>
    <p v-if="error" class="text-red-600" role="alert">{{ error }}</p>
    <ProgressBar v-if="busy" :value="done" :max="total" label="Checking" show-count aria-label="Checking contacts" />
    <p v-if="membershipError" class="text-red-600" role="alert">{{ membershipError }} The history below still shows the steps in the period.</p>
    <div v-if="results.length" class="overflow-x-auto">
      <table class="w-full text-left" data-check-results>
        <thead class="text-muted-foreground">
          <tr><th class="py-1 pr-3 font-medium">Contact Key</th><th class="py-1 pr-3 font-medium">In this journey now</th><th class="py-1 pr-3 font-medium">Version</th><th class="py-1 pr-3 font-medium">Last step ({{ periodLabel }})</th><th class="py-1 pr-3 font-medium">Entered</th><th class="py-1 font-medium" /></tr>
        </thead>
        <tbody>
          <tr v-for="r in results" :key="r.contactKey" class="border-t border-border align-top" :data-check-row="r.contactKey">
            <td class="py-1 pr-3 font-mono break-all">{{ r.contactKey }}</td>
            <td class="py-1 pr-3" :class="r.inNow ? 'text-green-700 dark:text-green-400 font-medium' : ''" data-in-now>{{ inNowText(r) }}</td>
            <td class="py-1 pr-3">{{ r.versions.length ? r.versions.join(', ') : '' }}</td>
            <td class="py-1 pr-3" data-last-step>
              <template v-if="r.historyError"><span class="text-red-600">Could not read the history: {{ r.historyError }}</span></template>
              <template v-else-if="r.lastStep">{{ r.lastStep }}<span v-if="r.lastStatus" class="text-muted-foreground"> · {{ r.lastStatus }}</span><span v-if="r.left" class="text-muted-foreground"> · left the journey</span><span v-if="r.failed" class="text-red-600"> · {{ r.failed }} failed</span><span v-if="r.entries > 1" class="text-muted-foreground"> · {{ r.entries }} entries</span></template>
              <span v-else class="text-muted-foreground">No steps in this journey in the period</span>
            </td>
            <td class="py-1 pr-3 whitespace-nowrap">{{ r.entered ? formatDateTime(r.entered) : '' }}</td>
            <td class="py-1"><RouterLink :to="linkFor(r.contactKey)" class="inline-flex items-center gap-1 text-primary hover:underline whitespace-nowrap" data-check-link>Contact journeys <ExternalLink class="h-3 w-3" /></RouterLink></td>
          </tr>
        </tbody>
      </table>
    </div>
  </section>
</template>
