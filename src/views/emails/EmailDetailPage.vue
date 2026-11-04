<script setup>
// One captured email or CloudPage (kind prop, feedback #1045): its saved versions, a
// preview of each (scripts off), delete, Revert (puts a version back) and Restore by
// myself (the request to send yourself). From SFMC Query Saver's email page.
// Feedback #1046: Preview or Code for each version, and Compare with another version
// (code side by side with changes marked, or both previews next to each other).
import { computed, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ArrowLeft, RotateCcw, Check, AlertCircle, Loader2, Clock, FolderOpen, Trash2, ExternalLink, FileDown } from 'lucide-vue-next'
import SelfRestoreDialog from '@/components/results/SelfRestoreDialog.vue'
import CodeView from '@/components/results/CodeView.vue'
import DiffView from '@/components/results/DiffView.vue'
import { selfRestoreRequest } from '@/utils/selfRestore.js'
import { SAVED_ASSET_KINDS, isSavedAssetKey, versionSource, lineChanges } from '@/utils/savedAssets.js'
import { compile } from '@/utils/emailCompiler.js'
import { sfmcFetch, logInfo } from '@/utils/sfmcApi.js'
import { showToast } from '@/composables/useToast.js'

const props = defineProps({ kind: { type: String, default: 'email' } })
const K = computed(() => SAVED_ASSET_KINDS[props.kind] || SAVED_ASSET_KINDS.email)
const route = useRoute()
const router = useRouter()

const record = ref(null)
const loading = ref(true)
const selectedIdx = ref(0)
const revertState = ref({}) // versionId → 'confirm' | 'pending' | 'success' | { error }
const deletingVersionId = ref(null)

// Only a saved record's own key (email_<asset id> or cloudpage_<asset id>), never another storage key from the URL.
const emailId = computed(() => { const id = String(route.params.id || ''); return isSavedAssetKey(K.value.kind, id) ? id : '' })

const view = ref('preview') // preview | code
const compareId = ref('') // versionId to compare with, '' = none

function load() {
  loading.value = true
  selectedIdx.value = 0
  compareId.value = ''
  revertState.value = {}
  chrome.storage.local.get(emailId.value, (data) => {
    record.value = data?.[emailId.value] || null
    loading.value = false
  })
}
watch(emailId, (id) => { if (id) load() }, { immediate: true })

// Records captured before versions existed get one version from their own fields.
const versions = computed(() => {
  const r = record.value
  if (!r) return []
  if (r.versions?.length) return r.versions
  return [{
    versionId: `v_${r.timeStamp}`, savedAt: r.timeStamp, subject: r.subject || '', name: r.name || '',
    status: r.status || '', categoryName: r.categoryName || '', compileAsset: r.compileAsset || null,
    assetBody: null, stack: null,
  }]
})
const selectedVersion = computed(() => versions.value[selectedIdx.value] || null)
const sourceOf = (v) => (v ? versionSource(v, compile) : '')
const compiledHtml = computed(() => sourceOf(selectedVersion.value) || null)
const compareVersion = computed(() => versions.value.find((v) => v.versionId === compareId.value && v !== selectedVersion.value) || null)
// Older on the left, newer on the right, whichever was picked first.
const pair = computed(() => {
  const a = selectedVersion.value
  const b = compareVersion.value
  if (!a || !b) return null
  const older = versions.value.indexOf(a) > versions.value.indexOf(b) ? a : b
  const newer = older === a ? b : a
  return { older, newer, left: sourceOf(older), right: sourceOf(newer) }
})
const changes = computed(() => (pair.value ? lineChanges(pair.value.left, pair.value.right) : null))
// A code resource (CSS, JS, JSON, text) has no page to preview: show its code.
const codeOnly = computed(() => /coderesource/i.test(record.value?.assetTypeName || ''))
const codeLang = computed(() => (/json/i.test(record.value?.assetTypeName || '') ? 'json' : /javascript|js/i.test(record.value?.assetTypeName || '') ? 'javascript' : 'html'))
const effectiveView = computed(() => (codeOnly.value ? 'code' : view.value))
// Picking the version that is being compared against swaps the comparison off.
watch(selectedIdx, () => { if (compareVersion.value === null) compareId.value = '' })
function startCompare() {
  const i = selectedIdx.value
  const other = versions.value[i + 1] || versions.value[i - 1]
  compareId.value = other?.versionId || ''
}

const label = (v) => `v${versions.value.length - versions.value.indexOf(v)}`
const stateOf = (v) => revertState.value[v.versionId] || 'idle'
const setState = (v, s) => { revertState.value = { ...revertState.value, [v.versionId]: s } }

async function revert(version) {
  if (!version.assetBody || !version.stack) return
  setState(version, 'pending')
  // Back through the app that saved it (CloudPages saves go through cloud-pages.<stack>).
  const origin = version.saveOrigin && /^https:\/\/[a-z0-9-]+\.[a-z0-9]+\.marketingcloudapps\.com$/.test(version.saveOrigin) ? version.saveOrigin : `https://content-builder.${version.stack}.marketingcloudapps.com`
  const url = `${origin}/fuelapi/asset/v1/content/assets/${record.value.assetId}`
  logInfo(`Reverting "${record.value.name}" to ${label(version)} (saved ${formatDate(version.savedAt)})`)
  try {
    await sfmcFetch(url, 'PUT', version.assetBody)
    setState(version, 'success')
    showToast(`Reverted to ${label(version)}. ${K.value.reopen}`, 6000)
  } catch (e) {
    setState(version, { error: e.message })
  }
}

// Restore by myself (feedback #1045): the PUT that puts this version back, to send yourself.
const selfRestore = ref(null)
function openSelfRestore(version) {
  selfRestore.value = selfRestoreRequest({ kind: K.value.kind, id: record.value.assetId, name: record.value.name, versionLabel: label(version), savedAt: version.savedAt, body: version.assetBody })
}

async function deleteVersion(versionId) {
  if (!record.value) return
  const remaining = versions.value.filter((v) => v.versionId !== versionId)
  if (!remaining.length) {
    if (!confirm(`This is the last version. Delete this ${K.value.noun} from Marketing Cloud Toolkit? (Nothing changes in ${K.value.app}.)`)) return
    await new Promise((r) => chrome.storage.local.remove(emailId.value, r))
    showToast(`${K.value.noun[0].toUpperCase()}${K.value.noun.slice(1)} deleted.`)
    router.push(K.value.base)
    return
  }
  deletingVersionId.value = versionId
  const updated = { ...record.value, versions: remaining }
  if (selectedIdx.value >= remaining.length) selectedIdx.value = remaining.length - 1
  await new Promise((r) => chrome.storage.local.set({ [emailId.value]: updated }, r))
  record.value = updated
  deletingVersionId.value = null
}

function formatDate(ts) {
  if (!ts) return '-'
  return new Date(ts).toLocaleString(undefined, { month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit' })
}
const contentBuilderUrl = (stack) => `https://mc.${stack}.exacttarget.com/cloud/#app/${K.value.appPath}`
</script>

<template>
  <div class="h-full flex flex-col">
    <div v-if="loading" class="flex-1 flex items-center justify-center"><Loader2 class="h-6 w-6 animate-spin text-muted-foreground" /></div>

    <div v-else-if="!record" class="flex-1 flex flex-col items-center justify-center gap-3">
      <AlertCircle class="h-10 w-10 text-muted-foreground/40" />
      <p class="text-sm text-muted-foreground">This {{ K.noun }} is not saved in Marketing Cloud Toolkit.</p>
      <RouterLink :to="K.base" class="text-xs text-primary underline">Back to {{ K.nouns }}</RouterLink>
    </div>

    <template v-else>
      <div class="flex items-center gap-3 px-4 py-2 border-b border-border bg-card">
        <RouterLink :to="K.base" class="p-1.5 rounded-md text-muted-foreground hover:bg-accent" :title="`Back to ${K.nouns}`"><ArrowLeft class="h-4 w-4" /></RouterLink>
        <div class="flex-1 min-w-0">
          <h1 class="text-sm font-semibold truncate">{{ record.name }}</h1>
          <div class="flex items-center gap-2 mt-0.5 flex-wrap text-[11px] text-muted-foreground">
            <span v-if="record.categoryName" class="inline-flex items-center gap-1"><FolderOpen class="h-3 w-3" /> {{ record.categoryName }}</span>
            <span v-if="record.assetTypeDisplayName">{{ record.assetTypeDisplayName }}</span>
            <span v-if="record.memberId">MID {{ record.memberId }}</span>
            <span>Asset {{ record.assetId }}</span>
          </div>
        </div>
        <span class="text-[11px] font-medium bg-muted border border-border rounded-full px-2.5 py-0.5 text-muted-foreground">
          {{ versions.length }} {{ versions.length === 1 ? 'version' : 'versions' }}
        </span>
      </div>

      <div class="flex-1 flex min-h-0">
        <aside class="w-72 shrink-0 border-r border-border bg-card flex flex-col min-h-0" aria-label="Versions">
          <div class="px-4 py-2 border-b border-border text-[10px] font-bold text-muted-foreground uppercase tracking-wider">Version history</div>
          <div class="flex-1 overflow-y-auto">
            <div v-for="(version, idx) in versions" :key="version.versionId"
              class="border-b border-border last:border-0 border-l-2 cursor-pointer"
              :class="selectedIdx === idx ? 'bg-primary/5 border-l-primary' : 'hover:bg-muted/50 border-l-transparent'"
              :aria-current="selectedIdx === idx" @click="selectedIdx = idx">
              <div class="px-4 py-3">
                <div class="flex items-center gap-2 mb-1">
                  <span class="text-xs font-bold">{{ label(version) }}</span>
                  <span v-if="idx === 0" class="text-[9px] font-semibold text-emerald-700 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800 rounded-full px-1.5">Latest</span>
                  <span v-if="version.status" class="text-[9px] rounded-full px-1.5 border"
                    :class="version.status === 'Published' ? 'text-emerald-700 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/40 border-emerald-200 dark:border-emerald-800' : 'text-amber-700 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/40 border-amber-200 dark:border-amber-700'">{{ version.status }}</span>
                  <button class="ml-auto p-1 rounded text-muted-foreground/50 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-950/40"
                    :disabled="deletingVersionId === version.versionId" title="Delete this version" @click.stop="deleteVersion(version.versionId)">
                    <Loader2 v-if="deletingVersionId === version.versionId" class="h-3 w-3 animate-spin" /><Trash2 v-else class="h-3 w-3" />
                  </button>
                </div>
                <div class="flex items-center gap-1 text-[10px] text-muted-foreground mb-1.5"><Clock class="h-2.5 w-2.5" /> {{ formatDate(version.savedAt) }}</div>
                <p v-if="version.subject" class="text-[10px] text-foreground/70 line-clamp-2 mb-2 italic">"{{ version.subject }}"</p>

                <template v-if="idx !== 0">
                  <div v-if="version.assetBody && version.stack" @click.stop>
                    <button v-if="stateOf(version) === 'idle'"
                      class="flex items-center justify-center gap-1.5 w-full text-[10px] font-semibold px-2.5 py-1 rounded-md border border-primary/40 text-primary hover:bg-primary/10"
                      @click="setState(version, 'confirm')"><RotateCcw class="h-3 w-3" /> Revert to this version</button>
                    <button v-if="stateOf(version) === 'idle'" class="mt-1 flex items-center justify-center gap-1.5 w-full text-[10px] px-2.5 py-1 rounded-md border border-border text-muted-foreground hover:bg-accent"
                      title="Get the request that puts this version back, to send yourself with your own API access" data-self-restore-open @click="openSelfRestore(version)"><FileDown class="h-3 w-3" /> Restore by myself</button>
                    <div v-else-if="stateOf(version) === 'confirm'" class="rounded-md border border-amber-300 bg-amber-50 dark:bg-amber-950/40 dark:border-amber-700 p-2 text-[10px] text-amber-900 dark:text-amber-200">
                      <p>Replace the {{ K.noun }} in {{ K.app }} with {{ label(version) }}? The current content is kept here as the latest version.</p>
                      <div class="flex gap-1.5 mt-1.5">
                        <button class="flex-1 rounded bg-primary text-primary-foreground py-1 font-semibold" @click="revert(version)">Revert</button>
                        <button class="flex-1 rounded border border-border bg-background py-1" @click="setState(version, 'idle')">Cancel</button>
                      </div>
                    </div>
                    <div v-else-if="stateOf(version) === 'pending'" class="flex items-center justify-center gap-1.5 text-[10px] text-muted-foreground py-1"><Loader2 class="h-3 w-3 animate-spin" /> Reverting…</div>
                    <div v-else-if="stateOf(version) === 'success'" class="flex items-center justify-center gap-1.5 text-[10px] font-semibold text-emerald-700 dark:text-emerald-400 py-1 rounded-md bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800"><Check class="h-3 w-3" /> Reverted</div>
                    <div v-else-if="stateOf(version)?.error" class="flex flex-col gap-1">
                      <div class="flex items-start gap-1.5 text-[10px] text-red-700 dark:text-red-400 px-2.5 py-1.5 rounded-md bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-800" role="alert">
                        <AlertCircle class="h-3 w-3 shrink-0 mt-px" />
                        <span v-if="stateOf(version).error.includes('EBADCSRFTOKEN')">
                          The {{ K.app }} session expired. Open {{ K.app }} once, then try again.
                          <a :href="contentBuilderUrl(version.stack)" target="_blank" class="underline font-semibold inline-flex items-center gap-0.5">Open <ExternalLink class="h-2.5 w-2.5" /></a>
                        </span>
                        <span v-else class="wrap-break-word">{{ stateOf(version).error }}</span>
                      </div>
                      <button class="text-[10px] text-primary underline" @click="setState(version, 'idle')">Try again</button>
                    </div>
                  </div>
                  <p v-else class="text-[9px] text-muted-foreground/60 italic text-center">Revert unavailable (saved before versions were kept)</p>
                </template>
              </div>
            </div>
          </div>
        </aside>

        <section class="flex-1 flex flex-col min-w-0" aria-label="Preview and code">
          <div class="flex flex-wrap items-center gap-3 px-5 py-2 border-b border-border bg-card text-xs">
            <span class="font-semibold">{{ selectedVersion ? label(selectedVersion) : '' }} <span class="text-muted-foreground font-normal ml-1">{{ formatDate(selectedVersion?.savedAt) }}</span></span>
            <span v-if="selectedVersion?.subject && !compareVersion" class="text-muted-foreground truncate min-w-0">Subject: {{ selectedVersion.subject }}</span>
            <div class="flex-1" />
            <div v-if="!codeOnly" class="flex rounded-full border border-border p-0.5" role="tablist" aria-label="Show">
              <button v-for="t in [['preview', 'Preview'], ['code', 'Code']]" :key="t[0]" type="button" role="tab" :aria-selected="view === t[0]" :data-view="t[0]"
                class="h-6 px-3 rounded-full" :class="view === t[0] ? 'bg-primary text-primary-foreground' : 'hover:bg-accent'" @click="view = t[0]">{{ t[1] }}</button>
            </div>
            <label v-if="versions.length > 1" class="inline-flex items-center gap-1.5">
              <span class="text-muted-foreground">Compare with</span>
              <select v-model="compareId" class="h-7 rounded-md border border-border bg-background px-1.5" data-compare-select>
                <option value="">None</option>
                <option v-for="v in versions.filter((x) => x !== selectedVersion)" :key="v.versionId" :value="v.versionId">{{ label(v) }} · {{ formatDate(v.savedAt) }}</option>
              </select>
            </label>
            <button v-if="versions.length > 1 && !compareVersion" type="button" class="h-7 px-2 rounded-md border border-border hover:bg-accent" title="Compare with the version before (or after) this one" @click="startCompare">Compare</button>
          </div>

          <template v-if="pair">
            <div class="flex flex-wrap items-center gap-3 px-5 py-1.5 border-b border-border bg-muted/30 text-[11px]" data-compare-bar>
              <span><span class="font-semibold">{{ label(pair.older) }}</span> <span class="text-muted-foreground">{{ formatDate(pair.older.savedAt) }}</span> on the left, <span class="font-semibold">{{ label(pair.newer) }}</span> <span class="text-muted-foreground">{{ formatDate(pair.newer.savedAt) }}</span> on the right</span>
              <span v-if="changes && (changes.added || changes.removed)" class="tabular-nums"><span class="text-emerald-700 dark:text-emerald-400">+{{ changes.added }}</span> <span class="text-red-700 dark:text-red-400">-{{ changes.removed }}</span> lines</span>
              <span v-else class="text-muted-foreground">Same code</span>
              <span v-if="pair.older.subject !== pair.newer.subject && (pair.older.subject || pair.newer.subject)" class="text-muted-foreground truncate min-w-0">Subject: "{{ pair.older.subject || '' }}" to "{{ pair.newer.subject || '' }}"</span>
              <button type="button" class="ml-auto text-primary hover:underline" @click="compareId = ''">Stop comparing</button>
            </div>
            <div v-if="effectiveView === 'code'" class="flex-1 min-h-0 overflow-auto p-3 bg-muted/10" data-compare-code>
              <DiffView :key="`${pair.older.versionId}-${pair.newer.versionId}`" :left="pair.left" :right="pair.right" :lang="codeLang" />
            </div>
            <div v-else class="flex-1 min-h-0 grid grid-cols-2 gap-px bg-border" data-compare-preview>
              <div v-for="side in [['older', pair.left], ['newer', pair.right]]" :key="side[0]" class="flex flex-col min-h-0 bg-white">
                <div class="px-3 py-1 text-[11px] bg-card border-b border-border text-muted-foreground">{{ label(pair[side[0]]) }}</div>
                <iframe v-if="side[1]" :srcdoc="side[1]" sandbox class="flex-1 w-full border-0" :title="`${K.noun} preview, ${label(pair[side[0]])}`" />
                <div v-else class="flex-1 flex items-center justify-center text-sm text-muted-foreground bg-muted/20">No preview for this version.</div>
              </div>
            </div>
          </template>
          <div v-else-if="effectiveView === 'code'" class="flex-1 min-h-0 overflow-auto p-3 bg-muted/10" data-code-view>
            <CodeView v-if="compiledHtml" :code="compiledHtml" :lang="codeLang" max-height="none" />
            <div v-else class="h-full flex items-center justify-center text-sm text-muted-foreground">No code saved for this version.</div>
          </div>
          <div v-else class="flex-1 relative bg-white">
            <iframe v-if="compiledHtml" :srcdoc="compiledHtml" sandbox class="w-full h-full border-0" :title="`${K.noun} preview`" />
            <div v-else class="h-full flex items-center justify-center text-sm text-muted-foreground bg-muted/20">No preview for this version.</div>
          </div>
          <p v-if="effectiveView === 'preview' && compiledHtml" class="px-5 py-1 border-t border-border text-[11px] text-muted-foreground bg-card">Scripts and AMPscript do not run here, so a page built by script can look empty: see Code.</p>
        </section>
      </div>
    </template>
    <SelfRestoreDialog :open="!!selfRestore" :request="selfRestore" @close="selfRestore = null" />
  </div>
</template>
