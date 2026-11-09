<script setup>
// Emails saved in Content Builder, captured with every version (from SFMC Query
// Saver's Emails tab), and CloudPages the same way (kind prop, feedback #1045). Turn
// capturing on or off in Settings.
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import { Search, Star, Trash2, X, Settings as SettingsIcon } from 'lucide-vue-next'
import EmailCard from '@/components/cards/EmailCard.vue'
import Button from '@/components/ui/button/Button.vue'
import { groupByDate } from '@/utils/dateGroups.js'
import { useStoredSetting } from '@/composables/useStoredSetting.js'
import { showToast } from '@/composables/useToast.js'
import { SAVED_ASSET_KINDS, SAVE_FAILED_KEY, recordCompileAsset } from '@/utils/savedAssets.js'
import ContentTabs from '@/components/content/ContentTabs.vue'

const props = defineProps({ kind: { type: String, default: 'email' } })
// Reactive: /emails and /cloudpages/saved share this component, and Vue reuses the
// instance when moving between them.
const K = computed(() => SAVED_ASSET_KINDS[props.kind] || SAVED_ASSET_KINDS.email)

const router = useRouter()
const emails = ref([])
const search = ref('')
const favouritesOnly = ref(false)
const deleteMode = ref(false)
const selectedIds = ref(new Set())
const { value: emailSaverEnabled } = useStoredSetting(SAVED_ASSET_KINDS.email.setting, true, (v) => v !== false)
const { value: cloudPageSaverEnabled } = useStoredSetting(SAVED_ASSET_KINDS.cloudpage.setting, true, (v) => v !== false)
const saverEnabled = computed(() => (K.value.kind === 'cloudpage' ? cloudPageSaverEnabled.value : emailSaverEnabled.value))

function loadData() {
  return new Promise((resolve) => {
    chrome.storage.local.get(null, (raw) => {
      emails.value = Object.entries(raw || {})
        .filter(([k, v]) => k.startsWith(K.value.prefix) && v?.assetId != null)
        .map(([, v]) => ({
          id: v.id,
          assetId: v.assetId,
          name: v.name,
          subject: v.subject || '',
          status: v.status || '',
          assetTypeDisplayName: v.assetTypeDisplayName || '',
          categoryName: v.categoryName || '',
          timeStamp: v.versions?.[0]?.savedAt || v.timeStamp,
          ownerName: v.ownerName || '',
          isFavourite: !!v.isFavourite,
          compileAsset: recordCompileAsset(v),
          versionCount: v.versions?.length || 1,
        }))
        .sort((a, b) => b.timeStamp - a.timeStamp)
      resolve()
    })
  })
}

// A save the service worker could not keep because Chrome's 10 MB was full (feedback #1086).
const notKept = ref(null)
function loadNotKept() {
  try {
    chrome.storage.session?.get(SAVE_FAILED_KEY, (r) => { notKept.value = r?.[SAVE_FAILED_KEY] || null })
  } catch { notKept.value = null }
}
const notKeptHere = computed(() => (notKept.value && notKept.value.kind === K.value.kind ? notKept.value : null))
function dismissNotKept() {
  notKept.value = null
  try { chrome.storage.session?.remove(SAVE_FAILED_KEY) } catch { /* nothing to clear */ }
}

let reloadTimer = null
function onStorageChange(changes, area) {
  if (area === 'session' && SAVE_FAILED_KEY in changes) { notKept.value = changes[SAVE_FAILED_KEY].newValue || null; return }
  if (area !== 'local' || !Object.keys(changes).some((k) => k.startsWith(K.value.prefix))) return
  clearTimeout(reloadTimer)
  reloadTimer = setTimeout(loadData, 300)
}
onMounted(() => { loadData(); loadNotKept(); chrome.storage.onChanged.addListener(onStorageChange) })
watch(() => props.kind, () => { search.value = ''; selectedIds.value = new Set(); deleteMode.value = false; loadData() })
onUnmounted(() => chrome.storage.onChanged.removeListener(onStorageChange))

const filtered = computed(() => {
  const q = search.value.trim().toLowerCase()
  return emails.value.filter((e) => (!favouritesOnly.value || e.isFavourite) &&
    (!q || [e.name, e.subject, e.categoryName, String(e.assetId)].some((x) => (x || '').toLowerCase().includes(q))))
})
const groups = computed(() => groupByDate(filtered.value))
const visibleIds = computed(() => filtered.value.map((e) => e.id))

async function toggleFavourite(id) {
  const e = emails.value.find((x) => x.id === id)
  const data = await new Promise((r) => chrome.storage.local.get(id, r))
  if (!e || !data[id]) return
  e.isFavourite = !e.isFavourite
  chrome.storage.local.set({ [id]: { ...data[id], isFavourite: e.isFavourite } })
}

function toggleDeleteMode() { deleteMode.value = !deleteMode.value; selectedIds.value = new Set() }
function toggleSelect(id) {
  const next = new Set(selectedIds.value)
  next.has(id) ? next.delete(id) : next.add(id)
  selectedIds.value = next
}
function toggleSelectAll() {
  selectedIds.value = selectedIds.value.size === visibleIds.value.length ? new Set() : new Set(visibleIds.value)
}
async function deleteSelected() {
  const ids = [...selectedIds.value]
  if (!ids.length) return
  await new Promise((r) => chrome.storage.local.remove(ids, r))
  await loadData()
  toggleDeleteMode()
  showToast(`Deleted ${ids.length} ${ids.length === 1 ? K.value.noun : K.value.nouns} from Marketing Cloud Toolkit.`)
}
</script>

<template>
  <div class="h-full flex flex-col">
    <div class="flex flex-wrap items-center gap-2 px-4 py-2 border-b border-border bg-card">
      <ContentTabs :section="K.kind === 'cloudpage' ? 'cloudpages' : 'emails'" />
      <template v-if="!deleteMode">
        <div class="relative">
          <Search class="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
          <input v-model="search" type="search" placeholder="Search name, subject, folder or asset ID"
            class="h-8 w-72 rounded-md border border-border bg-background pl-7 pr-2 text-xs" @keyup.esc="search = ''" />
        </div>
        <button class="flex items-center gap-1.5 h-8 px-2.5 rounded-md border text-xs font-medium"
          :class="favouritesOnly ? 'bg-amber-50 border-amber-300 text-amber-700 dark:bg-amber-950/40 dark:border-amber-700 dark:text-amber-400' : 'border-border text-muted-foreground hover:bg-accent'"
          :aria-pressed="favouritesOnly" @click="favouritesOnly = !favouritesOnly">
          <Star class="h-3.5 w-3.5" :fill="favouritesOnly ? 'currentColor' : 'none'" /> Favourites
        </button>
        <div class="flex-1" />
        <span class="text-xs" :class="saverEnabled ? 'text-muted-foreground' : 'text-amber-700 dark:text-amber-400'">
          {{ saverEnabled ? 'Saving new versions' : 'Saving versions is off' }}
        </span>
        <Button variant="ghost" size="icon" class="h-8 w-8" :title="`${K.title} settings`" @click="router.push('/settings')"><SettingsIcon class="h-4 w-4" /></Button>
        <Button variant="ghost" size="icon" class="h-8 w-8 hover:text-red-600" :title="`Select ${K.nouns} to delete`" :disabled="!emails.length" @click="toggleDeleteMode"><Trash2 class="h-4 w-4" /></Button>
      </template>
      <template v-else>
        <label class="flex items-center gap-2 text-xs">
          <input type="checkbox" :checked="selectedIds.size > 0 && selectedIds.size === visibleIds.length"
            :indeterminate="selectedIds.size > 0 && selectedIds.size < visibleIds.length" @change="toggleSelectAll" />
          Select all shown ({{ visibleIds.length }})
        </label>
        <span class="text-xs text-muted-foreground">Deletes the saved versions here only, not the {{ K.nouns }} in {{ K.app }}.</span>
        <div class="flex-1" />
        <Button variant="destructive" size="sm" class="h-8 text-xs" :disabled="!selectedIds.size" @click="deleteSelected"><Trash2 class="h-3.5 w-3.5 mr-1" /> Delete ({{ selectedIds.size }})</Button>
        <Button variant="outline" size="sm" class="h-8 text-xs" @click="toggleDeleteMode"><X class="h-3.5 w-3.5 mr-1" /> Cancel</Button>
      </template>
    </div>

    <div v-if="notKeptHere" data-save-not-kept class="flex flex-wrap items-start gap-2 px-4 py-2 border-b border-amber-300 bg-amber-50 text-xs text-amber-900 dark:bg-amber-950/40 dark:border-amber-700 dark:text-amber-200">
      <p class="flex-1 min-w-[16rem]">
        The save of <strong>{{ notKeptHere.name }}</strong> on {{ new Date(notKeptHere.at).toLocaleString() }} was not kept: the Toolkit's storage in Chrome (10 MB) is full.
        New saves are kept again once there is room. Delete {{ K.nouns }} or versions you no longer need here, or see what uses the space in Settings &gt; Storage.
      </p>
      <button type="button" class="underline" data-save-not-kept-delete @click="deleteMode || toggleDeleteMode()">Select {{ K.nouns }} to delete</button>
      <button type="button" class="underline" @click="router.push('/settings')">Settings</button>
      <button type="button" class="underline" data-save-not-kept-dismiss @click="dismissNotKept">Dismiss</button>
    </div>

    <div class="flex-1 min-h-0 overflow-y-auto p-6">
      <div v-if="!emails.length" class="flex flex-col items-center gap-3 py-16 text-center">
        <p class="text-lg font-semibold">No {{ K.nouns }} saved yet</p>
        <p class="text-sm text-muted-foreground max-w-sm">
          Save {{ K.kind === 'email' ? 'an email' : 'a CloudPage' }} in {{ K.app }} and it appears here, with every version you save after that.
          <template v-if="!saverEnabled"> Saving versions is turned off in Settings.</template>
        </p>
      </div>
      <div v-else-if="!groups.length" class="flex flex-col items-center gap-3 py-12 text-center">
        <p class="text-sm font-semibold">Nothing matches</p>
        <button class="text-xs text-primary underline" @click="search = ''; favouritesOnly = false">Clear filters</button>
      </div>
      <section v-for="group in groups" :key="group.key" class="mb-7">
        <div class="flex items-center gap-2 mb-3">
          <h2 class="text-[11px] font-bold text-muted-foreground uppercase tracking-wider">{{ group.label }}</h2>
          <span class="text-[11px] text-muted-foreground bg-muted rounded-full px-2 tabular-nums">{{ group.items.length }}</span>
          <div class="flex-1 h-px bg-border" />
        </div>
        <div class="flex flex-wrap gap-4 items-start">
          <EmailCard v-for="e in group.items" :key="e.id" v-bind="e" :delete-mode="deleteMode" :is-selected="selectedIds.has(e.id)"
            @toggle-select="toggleSelect" @toggle-favourite="toggleFavourite" @open="router.push(`${K.base}/${encodeURIComponent($event)}`)" />
        </div>
      </section>
    </div>
  </div>
</template>
