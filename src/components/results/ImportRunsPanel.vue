<script setup>
// Last runs of one import activity (user, 2026-11-10), shown in its ActivityCard. Reads
// SOAP ImportResultsSummary for the import's CustomerKey over the last 90 days, only when
// asked (an automation page can show many cards). Read-only.
import { ref } from 'vue'
import { Loader2 } from 'lucide-vue-next'
import { RouterLink } from 'vue-router'
import { useStack } from '@/composables/useStack.js'
import { fetchImportResults, importResultFlags, formatDuration } from '@/utils/setupApi.js'
import { formatDateTime } from '@/utils/format.js'

const props = defineProps({ importKey: { type: String, required: true } })
const { stack } = useStack()
const runs = ref(null)
const busy = ref(false)
const error = ref('')
async function load() {
  busy.value = true
  error.value = ''
  try { runs.value = (await fetchImportResults(stack.value, { key: props.importKey, days: 90 })).slice(0, 5) } catch (e) { error.value = e.message || String(e) } finally { busy.value = false }
}
</script>

<template>
  <div data-import-runs>
    <div class="flex items-center gap-2">
      <span class="text-muted-foreground">Recent runs</span>
      <button v-if="!runs" class="text-primary hover:underline disabled:opacity-60" :disabled="busy" @click="load">
        <Loader2 v-if="busy" class="inline h-3 w-3 animate-spin" /> {{ busy ? 'Reading' : 'Show the last 5 runs' }}
      </button>
      <RouterLink to="/import-results" class="text-primary hover:underline">All import results</RouterLink>
    </div>
    <p v-if="error" class="mt-1 text-amber-700 dark:text-amber-400">Could not read the runs: {{ error }}</p>
    <p v-else-if="runs && !runs.length" class="mt-1 text-muted-foreground">No runs in the last 90 days.</p>
    <div v-else-if="runs" class="mt-1 overflow-x-auto">
      <table class="w-full border border-border">
        <thead><tr class="bg-muted/40 text-left"><th v-for="c in ['Start', 'Status', 'Duration', 'Total', 'Successful', 'Duplicated', 'Errors']" :key="c" class="px-2 py-1 font-semibold">{{ c }}</th></tr></thead>
        <tbody>
          <tr v-for="r in runs" :key="r.id" class="border-t border-border" :class="importResultFlags(r).length ? 'text-amber-700 dark:text-amber-400' : ''">
            <td class="px-2 py-1">{{ formatDateTime(r.start) }}</td><td class="px-2 py-1">{{ r.status }}</td><td class="px-2 py-1">{{ formatDuration(r.durationSec) }}</td>
            <td class="px-2 py-1">{{ r.total ?? '' }}</td><td class="px-2 py-1">{{ r.successful ?? '' }}</td><td class="px-2 py-1">{{ r.duplicated ?? '' }}</td><td class="px-2 py-1">{{ r.errors ?? '' }}</td>
          </tr>
        </tbody>
      </table>
    </div>
  </div>
</template>
