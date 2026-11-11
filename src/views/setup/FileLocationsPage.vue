<script setup>
// Setup > File locations (API idea 20, from Mathes, 2026-11-11). Read only. The list and
// what is assumed about it: utils/fileLocations.js. Activities that use each location
// come from the Where used lists (imports, file transfers, data extracts): saved data is
// shown at once, and Find activities brings it up to date (reads only).
import { computed, ref } from 'vue'
import { Loader2, RefreshCw, ExternalLink, Network, Search, ChevronRight, ChevronDown } from 'lucide-vue-next'
import Button from '@/components/ui/button/Button.vue'
import ProgressBar from '@/components/ui/ProgressBar.vue'
import SfmcErrorNotice from '@/components/results/SfmcErrorNotice.vue'
import DownloadMenu from '@/components/results/DownloadMenu.vue'
import { useStack, whenStack } from '@/composables/useStack.js'
import { useUsage } from '@/composables/useUsage.js'
import { searchError, withReconnect } from '@/utils/sfmcErrors.js'
import { formatDateTime } from '@/utils/format.js'
import { fetchCurrentBU } from '@/utils/sfmcApi.js'
import { loadSaved } from '@/utils/usage/store.js'
import { preloadUsageSource } from '@/utils/usage/index.js'
import { fetchFileLocations, activitiesByLocation } from '@/utils/fileLocations.js'

const SOURCES = [['imports', 'Import activities'], ['filetransfers', 'File Transfer activities'], ['dataextracts', 'Data Extract activities']]

const { stack } = useStack()
const usage = useUsage()
const locations = ref(null)
const busy = ref(false)
const error = ref(null)
const text = ref('')
const open = ref(new Set())

async function load() {
  const s = stack.value
  busy.value = true
  error.value = null
  try {
    locations.value = await withReconnect(s, () => fetchFileLocations(s))
    await loadSavedLists(s)
  } catch (e) { error.value = searchError(e, 'read the file locations') } finally { busy.value = false }
}

// ── Activities (Where used lists) ─────────────────────────
const lists = ref({})
const listsAt = ref(null)
const finding = ref(false)
const findStep = ref({ label: '', done: 0, total: 0 })
const findError = ref('')
const buOf = async (s) => String((await fetchCurrentBU(s).catch(() => null))?.accountId ?? 'unknown')
async function loadSavedLists(s) {
  const bu = await buOf(s)
  const out = {}
  let at = null
  for (const [id] of SOURCES) {
    const saved = await loadSaved(`${s}:${bu}:${id}`).catch(() => null)
    if (saved) { out[id] = saved.value; at = at == null ? saved.savedAt : Math.min(at, saved.savedAt) }
  }
  lists.value = out
  listsAt.value = Object.keys(out).length ? at : null
}
async function findActivities() {
  const s = stack.value
  finding.value = true
  findError.value = ''
  try {
    const bu = await buOf(s)
    const out = { ...lists.value }
    for (const [id, label] of SOURCES) {
      findStep.value = { label, done: 0, total: 0 }
      try {
        out[id] = (await preloadUsageSource(s, bu, id, { progress: (done, total) => { findStep.value = { label, done, total } } })).value
      } catch (e) { findError.value = [findError.value, `${label}: ${e?.message || e}`].filter(Boolean).join('; ') }
    }
    lists.value = out
    listsAt.value = Date.now()
  } finally { finding.value = false }
}
const haveLists = computed(() => Object.keys(lists.value).length > 0)
const byLocation = computed(() => activitiesByLocation(locations.value || [], lists.value, stack.value))

whenStack(load)

// ── Rows ─────────────────────────────────────────────────
const shown = computed(() => {
  const t = text.value.trim().toLowerCase()
  return (locations.value || []).filter((l) => !t || [l.name, l.type, l.path, l.url, l.key].some((v) => String(v || '').toLowerCase().includes(t)))
})
function toggle(id) {
  const s = new Set(open.value)
  if (s.has(id)) s.delete(id); else s.add(id)
  open.value = s
}
const whereUsed = (l) => usage.start(stack.value, { kind: 'location', location: l.raw })

const getDoc = () => ({
  title: 'File locations',
  blocks: [
    { type: 'p', text: 'File locations of this business unit. Passwords and keys are never included.' },
    { type: 'table', columns: ['Name', 'Type', 'Path', 'URL', 'External key', 'Activities'], rows: shown.value.map((l) => [l.name, l.type, String(l.path ?? ''), l.url, l.key, haveLists.value ? (byLocation.value.get(l.id) || []).map((a) => `${a.type}: ${a.name}`).join('; ') : '']) },
  ],
})
</script>

<template>
  <div class="p-4 space-y-4 max-w-7xl" data-file-locations>
    <div class="flex flex-wrap items-center gap-2">
      <h1 class="text-lg font-semibold">File locations</h1>
      <span class="text-xs text-muted-foreground">Where imports, extracts and file transfers read and write files. Read only; passwords and keys are never shown.</span>
      <div class="flex-1" />
      <DownloadMenu :get-doc="getDoc" file-name="file-locations" :disabled="!shown.length" />
      <Button variant="outline" size="sm" class="gap-1" :disabled="busy" @click="load"><Loader2 v-if="busy" class="h-3.5 w-3.5 animate-spin" /><RefreshCw v-else class="h-3.5 w-3.5" /> Refresh</Button>
    </div>

    <SfmcErrorNotice v-if="error" :error="error" :retrying="busy" @retry="load" />

    <section class="rounded-lg border border-border bg-card">
      <div class="flex flex-wrap items-center gap-3 px-3 py-2 border-b border-border text-xs">
        <div class="relative">
          <Search class="h-3.5 w-3.5 absolute left-2 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <input v-model="text" type="search" class="h-7 rounded-md border border-border bg-background pl-7 pr-2 text-xs" placeholder="Name, type, path or URL" aria-label="Search file locations" />
        </div>
        <span v-if="locations" class="text-muted-foreground">{{ locations.length }} file locations</span>
        <div class="flex-1" />
        <span v-if="listsAt && !finding" class="text-muted-foreground" data-lists-at>Activities from Where used data of {{ formatDateTime(new Date(listsAt).toISOString()) }}</span>
        <ProgressBar v-if="finding" :value="findStep.done" :max="findStep.total" show-count :label="findStep.label" class="w-72" />
        <Button v-else variant="outline" size="sm" class="gap-1" :disabled="!locations?.length" data-find-activities @click="findActivities"><Network class="h-3.5 w-3.5" /> {{ haveLists ? 'Update activities' : 'Find activities' }}</Button>
      </div>
      <p v-if="findError" class="px-3 py-2 text-xs text-destructive">{{ findError }}</p>
      <p v-if="!haveLists && locations?.length" class="px-3 py-2 text-xs text-muted-foreground border-b border-border">Find activities reads the Import, File Transfer and Data Extract activity lists (as Where used does) to show which use each location. Data extracts usually write to the Safehouse and name no location.</p>

      <div v-if="busy && !locations" class="flex items-center gap-2 p-4 text-sm text-muted-foreground"><Loader2 class="h-4 w-4 animate-spin" /> Reading file locations…</div>
      <div v-else-if="locations && !shown.length" class="p-4 text-sm text-muted-foreground">No file locations to show.</div>
      <table v-else-if="locations" class="w-full text-sm">
        <thead class="text-xs text-muted-foreground text-left">
          <tr class="border-b border-border"><th class="w-6" /><th class="px-2 py-1.5 font-medium">Name</th><th class="px-2 py-1.5 font-medium">Type</th><th class="px-2 py-1.5 font-medium">Path</th><th class="px-2 py-1.5 font-medium">URL</th><th class="px-2 py-1.5 font-medium">Activities</th><th /></tr>
        </thead>
        <tbody>
          <template v-for="l in shown" :key="l.id">
            <tr class="border-b border-border align-top" :data-location="l.id">
              <td class="pl-2 py-1.5"><button type="button" class="text-muted-foreground" :aria-expanded="open.has(l.id)" :aria-label="`Details of ${l.name}`" @click="toggle(l.id)"><ChevronDown v-if="open.has(l.id)" class="h-4 w-4" /><ChevronRight v-else class="h-4 w-4" /></button></td>
              <td class="px-2 py-1.5 font-medium">{{ l.name || l.id }}<div v-if="l.key" class="text-xs text-muted-foreground font-mono">{{ l.key }}</div></td>
              <td class="px-2 py-1.5">{{ l.type }}</td>
              <td class="px-2 py-1.5 font-mono text-xs break-all">{{ l.path }}</td>
              <td class="px-2 py-1.5 font-mono text-xs break-all">{{ l.url }}</td>
              <td class="px-2 py-1.5 text-xs">
                <template v-if="haveLists">{{ (byLocation.get(l.id) || []).length || 'None found' }}</template>
                <span v-else class="text-muted-foreground">Not looked up</span>
              </td>
              <td class="px-2 py-1.5 text-right"><button type="button" class="inline-flex items-center gap-0.5 text-xs text-primary hover:underline" title="Activities and the automations that run them" @click="whereUsed(l)"><Network class="h-3 w-3" /> Where used</button></td>
            </tr>
            <tr v-if="open.has(l.id)" class="border-b border-border bg-muted/30">
              <td />
              <td colspan="6" class="px-2 py-2 text-xs space-y-2">
                <div v-if="l.description">{{ l.description }}</div>
                <ul v-if="(byLocation.get(l.id) || []).length" class="space-y-1" data-location-activities>
                  <li v-for="a in byLocation.get(l.id)" :key="`${a.typeId}:${a.id}`" class="flex flex-wrap items-center gap-2">
                    <span class="rounded bg-muted px-1.5">{{ a.type }}</span>
                    <a v-if="a.href" :href="a.href" target="_blank" rel="noopener" class="text-primary hover:underline inline-flex items-center gap-0.5">{{ a.name }} <ExternalLink class="h-3 w-3" /></a>
                    <span v-else>{{ a.name }}</span>
                    <span v-if="a.detail" class="text-muted-foreground font-mono">{{ a.detail }}</span>
                  </li>
                </ul>
                <div v-else-if="haveLists" class="text-muted-foreground">No Import, File Transfer or Data Extract activity names this location in the Where used data.</div>
                <details>
                  <summary class="cursor-pointer text-muted-foreground">Record from SFMC (passwords and keys removed)</summary>
                  <pre class="mt-1 max-h-64 overflow-auto rounded bg-background p-2 font-mono">{{ JSON.stringify(l.raw, null, 2) }}</pre>
                </details>
              </td>
            </tr>
          </template>
        </tbody>
      </table>
    </section>
  </div>
</template>
