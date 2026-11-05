<script setup>
// Content > Emails (feedback #1054): Content Builder folders on the left, emails in the
// open folder or matching a search in the middle, the picked email on the right with
// Preview, Text and Code, and Preview with data: pick a data extension and a row, then
// SFMC renders the email for that row (guide/v1 preview), or the Toolkit fills in the
// %%Field%% strings itself. Read only: nothing in SFMC changes.
import { computed, reactive, ref, watch } from 'vue'
import { Search, Loader2, Folder, FolderOpen, ChevronRight, ChevronDown, Mail, RefreshCw, Database, X } from 'lucide-vue-next'
import Button from '@/components/ui/button/Button.vue'
import Input from '@/components/ui/input/Input.vue'
import SfmcErrorNotice from '@/components/results/SfmcErrorNotice.vue'
import CodeView from '@/components/results/CodeView.vue'
import ReportErrorButton from '@/components/results/ReportErrorButton.vue'
import { useStack, whenStack } from '@/composables/useStack.js'
import { withReconnect, searchError } from '@/utils/sfmcErrors.js'
import { formatDateTime } from '@/utils/format.js'
import { searchDEsAllSources } from '@/utils/sfmcApi.js'
import { fetchDEFieldList } from '@/utils/deApi.js'
import { fetchRowsAt, ROWS_PAGE } from '@/utils/deRows.js'
import {
  fetchEmailFolders, clearEmailCaches, searchEmails, fetchEmailAsset, emailParts,
  fillPersonalization, previewWithData, EMAIL_PAGE_SIZE,
} from '@/utils/contentEmails.js'

const { stack } = useStack()

// ── Folders ──────────────────────────────────────────────
const children = reactive({}) // parentId → folder[]
const expanded = reactive(new Set())
const folderLoading = reactive(new Set())
const folderError = ref(null)
const currentFolder = ref(null) // { id, name }

async function loadChildren(parentId) {
  if (children[parentId] || folderLoading.has(parentId)) return
  folderLoading.add(parentId)
  try { children[parentId] = await withReconnect(stack.value, () => fetchEmailFolders(stack.value, parentId)) }
  catch (e) { folderError.value = e }
  finally { folderLoading.delete(parentId) }
}
function toggleFolder(f) {
  if (expanded.has(f.id)) expanded.delete(f.id)
  else { expanded.add(f.id); loadChildren(f.id) }
}
const visibleFolders = computed(() => {
  const out = []
  const walk = (pid, depth) => {
    for (const f of children[pid] || []) {
      out.push({ ...f, depth })
      if (expanded.has(f.id)) {
        if (folderLoading.has(f.id)) out.push({ id: `${f.id}:loading`, loading: true, depth: depth + 1 })
        walk(f.id, depth + 1)
      }
    }
  }
  walk('0', 0)
  return out
})
function openFolder(f) {
  currentFolder.value = { id: f.id, name: f.name }
  if (!expanded.has(f.id)) { expanded.add(f.id); loadChildren(f.id) }
  runSearch()
}

// ── Emails ───────────────────────────────────────────────
const text = ref('')
const emails = ref([])
const total = ref(0)
const pageNo = ref(1)
const loading = ref(false)
const loadingMore = ref(false)
const error = ref(null)
const searchedFor = ref(null) // what the list shows: { text, folder }
const searchAll = ref(false) // search every folder, not only the open one

async function runSearch() {
  if (!stack.value) { error.value = 'Not connected to Marketing Cloud. Log in to SFMC in this browser.'; return }
  const folderId = searchAll.value && text.value.trim() ? null : currentFolder.value?.id ?? null
  loading.value = true
  error.value = null
  try {
    const r = await withReconnect(stack.value, () => searchEmails(stack.value, { text: text.value, folderId, page: 1 }))
    emails.value = r.items
    total.value = r.total
    pageNo.value = 1
    searchedFor.value = { text: text.value.trim(), folder: folderId ? currentFolder.value?.name : null }
  } catch (e) {
    error.value = searchError(e, 'search emails')
  } finally { loading.value = false }
}
async function loadMore() {
  const folderId = searchAll.value && text.value.trim() ? null : currentFolder.value?.id ?? null
  loadingMore.value = true
  try {
    const r = await searchEmails(stack.value, { text: searchedFor.value?.text || '', folderId, page: pageNo.value + 1 })
    emails.value = [...emails.value, ...r.items]
    pageNo.value += 1
  } catch (e) { error.value = searchError(e, 'load more emails') }
  finally { loadingMore.value = false }
}
function refresh() {
  clearEmailCaches()
  for (const k of Object.keys(children)) delete children[k]
  expanded.clear()
  loadChildren('0')
  runSearch()
}

// ── The picked email ─────────────────────────────────────
const picked = ref(null) // row
const asset = ref(null)
const parts = ref(null)
const assetLoading = ref(false)
const assetError = ref('')
const view = ref('preview') // preview | text | code

async function pick(row) {
  picked.value = row
  asset.value = null
  parts.value = null
  assetError.value = ''
  dataPreview.value = null
  dataError.value = ''
  assetLoading.value = true
  try {
    const a = await withReconnect(stack.value, () => fetchEmailAsset(stack.value, row.id))
    if (picked.value?.id !== row.id) return
    asset.value = a
    parts.value = emailParts(a)
  } catch (e) {
    assetError.value = `Could not read the email: ${e.message}`
  } finally { assetLoading.value = false }
}

// ── Preview with data ────────────────────────────────────
const dataOpen = ref(false)
const deQuery = ref('')
const deResults = ref([])
const deSearching = ref(false)
const de = ref(null)
const deFields = ref([])
const rows = ref([])
const rowsLoading = ref(false)
const rowIndex = ref(0)
const keyField = ref('')
const dataPreview = ref(null) // { html, subject, how: 'sfmc' | 'local', filled, missing }
const dataBusy = ref(false)
const dataError = ref('')

let deTimer = null
watch(deQuery, (q) => {
  clearTimeout(deTimer)
  if (!q.trim()) { deResults.value = []; return }
  deTimer = setTimeout(async () => {
    deSearching.value = true
    try { deResults.value = ((await searchDEsAllSources(stack.value, q.trim(), 25))?.items || []).slice(0, 25) }
    catch (e) { dataError.value = `DE search failed: ${e.message}` }
    finally { deSearching.value = false }
  }, 300)
})

const KEY_NAME_RE = /^(subscriber_?key|contact_?key|subscriberid)$/i
const EMAIL_NAME_RE = /e-?mail/i
async function pickDE(d) {
  de.value = d
  deResults.value = []
  deQuery.value = ''
  rows.value = []
  rowIndex.value = 0
  dataError.value = ''
  rowsLoading.value = true
  try {
    deFields.value = await fetchDEFieldList(stack.value, d.id)
    const names = deFields.value.map((f) => f.name)
    keyField.value = names.find((n) => KEY_NAME_RE.test(n)) || deFields.value.find((f) => f.isPrimaryKey)?.name
      || names.find((n) => EMAIL_NAME_RE.test(n)) || names[0] || ''
    const key = d.customerKey || d.key
    if (!key) throw new Error('SFMC sent no customer key for this data extension, which reading its rows needs')
    const r = await fetchRowsAt(stack.value, key, 0, ROWS_PAGE, names)
    rows.value = r.rows
    if (!r.rows.length) dataError.value = 'This data extension has no rows.'
  } catch (e) {
    dataError.value = `Could not read the data extension: ${e.message}`
  } finally { rowsLoading.value = false }
}
const row = computed(() => rows.value[rowIndex.value] || null)
const rowLabel = (r, i) => {
  const v = keyField.value ? r[keyField.value] : Object.values(r)[0]
  return `${i + 1}. ${v ?? ''}`
}

async function previewInSfmc() {
  if (!picked.value || !de.value || !row.value) return
  dataBusy.value = true
  dataError.value = ''
  try {
    const r = await previewWithData(stack.value, {
      legacyId: picked.value.legacyId, deId: de.value.id, deKey: de.value.customerKey || de.value.key,
      subscriberKey: keyField.value ? row.value[keyField.value] : null, rowNumber: rowIndex.value + 1,
    })
    dataPreview.value = { html: r.html, subject: r.subject, how: 'sfmc' }
    view.value = 'preview'
  } catch (e) {
    dataError.value = `SFMC did not render the preview: ${e.message}. Fill in here shows the email with this row's values for %%Field%% strings (other AMPscript stays as written).`
  } finally { dataBusy.value = false }
}
function previewLocally() {
  if (!parts.value || !row.value) return
  const h = fillPersonalization(parts.value.html, row.value)
  const s = fillPersonalization(parts.value.subject, row.value)
  dataPreview.value = { html: h.html, subject: s.html, how: 'local', filled: [...new Set([...h.filled, ...s.filled])], missing: [...new Set([...h.missing, ...s.missing])] }
  view.value = 'preview'
}
function clearData() { dataPreview.value = null }

const shownHtml = computed(() => dataPreview.value?.html ?? parts.value?.html ?? '')
const shownSubject = computed(() => dataPreview.value?.subject ?? parts.value?.subject ?? '')

whenStack(() => { loadChildren('0'); runSearch() })
</script>

<template>
  <div class="h-full flex flex-col bg-background text-sm" data-email-browser>
    <div class="flex flex-wrap items-center gap-2 px-5 py-3 border-b border-border">
      <h1 class="text-lg font-semibold mr-2">Emails</h1>
      <form class="flex items-center gap-2 flex-1 min-w-[16rem]" @submit.prevent="runSearch">
        <div class="relative flex-1">
          <Search class="h-4 w-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <Input v-model="text" class="pl-9 rounded-full" placeholder="Name, subject line or customer key" aria-label="Search emails" data-email-search />
        </div>
        <label v-if="currentFolder" class="flex items-center gap-1.5 text-xs text-muted-foreground whitespace-nowrap">
          <input v-model="searchAll" type="checkbox" /> All folders
        </label>
        <Button type="submit" :disabled="loading"><Loader2 v-if="loading" class="h-4 w-4 animate-spin" /><Search v-else class="h-4 w-4" /> Search</Button>
      </form>
      <Button variant="outline" title="Read folders and emails again" @click="refresh"><RefreshCw class="h-4 w-4" /> Refresh</Button>
    </div>

    <div class="flex-1 min-h-0 grid [grid-template-columns:minmax(200px,260px)_minmax(260px,360px)_1fr] max-[900px]:grid-cols-1 max-[900px]:overflow-y-auto">
      <!-- Folders -->
      <nav class="border-r border-border overflow-y-auto p-2" aria-label="Content Builder folders" data-email-folders>
        <button type="button" class="w-full flex items-center gap-1.5 rounded px-2 py-1 text-left" :class="!currentFolder ? 'bg-primary/10 text-primary font-medium' : 'hover:bg-accent'" @click="currentFolder = null; runSearch()">
          <Mail class="h-4 w-4" /> All emails
        </button>
        <div v-for="f in visibleFolders" :key="f.id" :style="{ paddingLeft: `${f.depth * 14}px` }">
          <div v-if="f.loading" class="flex items-center gap-1 px-2 py-1 text-xs text-muted-foreground"><Loader2 class="h-3 w-3 animate-spin" /> Loading</div>
          <div v-else class="flex items-center rounded" :class="currentFolder?.id === f.id ? 'bg-primary/10 text-primary font-medium' : 'hover:bg-accent'">
            <button type="button" class="p-1" :aria-label="expanded.has(f.id) ? `Close ${f.name}` : `Open ${f.name}`" @click="toggleFolder(f)">
              <ChevronDown v-if="expanded.has(f.id)" class="h-3.5 w-3.5" /><ChevronRight v-else class="h-3.5 w-3.5" />
            </button>
            <button type="button" class="flex-1 flex items-center gap-1.5 py-1 pr-2 text-left truncate" :data-folder="f.id" @click="openFolder(f)">
              <FolderOpen v-if="currentFolder?.id === f.id" class="h-4 w-4 shrink-0" /><Folder v-else class="h-4 w-4 shrink-0" />
              <span class="truncate">{{ f.name }}</span>
            </button>
          </div>
        </div>
        <div v-if="folderLoading.has('0')" class="flex items-center gap-1 px-2 py-1 text-xs text-muted-foreground"><Loader2 class="h-3 w-3 animate-spin" /> Loading folders</div>
        <SfmcErrorNotice v-if="folderError" :error="folderError" class="mt-2" @retry="folderError = null; loadChildren('0')" />
      </nav>

      <!-- Emails -->
      <section class="border-r border-border overflow-y-auto" aria-label="Emails" data-email-list>
        <div class="px-3 py-2 text-xs text-muted-foreground border-b border-border">
          <template v-if="searchedFor">
            {{ total.toLocaleString() }} email(s)<template v-if="searchedFor.folder"> in {{ searchedFor.folder }}</template><template v-if="searchedFor.text"> matching "{{ searchedFor.text }}"</template>
          </template>
          <template v-else-if="loading">Searching</template>
        </div>
        <SfmcErrorNotice v-if="error" :error="error" :retrying="loading" class="m-3" @retry="runSearch" />
        <button v-for="e in emails" :key="e.id" type="button" class="w-full text-left px-3 py-2 border-b border-border" :class="picked?.id === e.id ? 'bg-primary/10' : 'hover:bg-accent'" :data-email-row="e.id" @click="pick(e)">
          <div class="font-medium truncate">{{ e.name }}</div>
          <div class="text-xs text-muted-foreground truncate">{{ e.subject || 'No subject line' }}</div>
          <div class="text-[11px] text-muted-foreground truncate">{{ e.folderName }} · {{ e.type }} · {{ formatDateTime(e.modifiedDate) }}</div>
        </button>
        <div v-if="searchedFor && !emails.length && !loading && !error" class="p-4 text-muted-foreground">No emails here.</div>
        <div v-if="emails.length < total" class="p-3">
          <Button variant="outline" class="w-full" :disabled="loadingMore" @click="loadMore"><Loader2 v-if="loadingMore" class="h-4 w-4 animate-spin" /> Load {{ EMAIL_PAGE_SIZE }} more</Button>
        </div>
      </section>

      <!-- The email -->
      <section class="min-w-0 flex flex-col overflow-y-auto" aria-label="Email preview" data-email-detail>
        <div v-if="!picked" class="m-auto text-muted-foreground p-6 text-center">Pick an email to see it.</div>
        <template v-else>
          <div class="px-4 py-3 border-b border-border space-y-1">
            <div class="font-semibold text-base">{{ picked.name }}</div>
            <div class="text-xs text-muted-foreground">Subject: <span class="text-foreground" data-email-subject>{{ shownSubject || 'none' }}</span></div>
            <div v-if="parts?.preheader" class="text-xs text-muted-foreground">Preheader: {{ parts.preheader }}</div>
            <div class="text-[11px] text-muted-foreground">{{ picked.type }} · key {{ picked.customerKey }} · ID {{ picked.id }}<template v-if="picked.legacyId"> · email ID {{ picked.legacyId }}</template></div>
            <div class="flex flex-wrap items-center gap-1.5 pt-1">
              <button v-for="v in [['preview', 'Preview'], ['text', 'Text'], ['code', 'Code']]" :key="v[0]" type="button"
                class="h-7 px-3 rounded-full border text-xs" :class="view === v[0] ? 'bg-primary text-primary-foreground border-primary' : 'border-border hover:bg-accent'" @click="view = v[0]">{{ v[1] }}</button>
              <button type="button" class="h-7 px-3 rounded-full border text-xs inline-flex items-center gap-1" :class="dataOpen ? 'bg-primary/10 border-primary text-primary' : 'border-border hover:bg-accent'" data-preview-data-toggle @click="dataOpen = !dataOpen">
                <Database class="h-3.5 w-3.5" /> Preview with data
              </button>
            </div>
          </div>

          <div v-if="dataOpen" class="px-4 py-3 border-b border-border bg-primary/5 space-y-2" data-preview-data>
            <div v-if="!de" class="relative">
              <Input v-model="deQuery" class="h-8 rounded-full text-sm" placeholder="Search a data extension by name" aria-label="Data extension for the preview" />
              <div v-if="deQuery.trim()" class="absolute z-10 mt-1 w-full max-h-60 overflow-y-auto rounded-lg border border-border bg-card shadow">
                <div v-if="deSearching" class="p-2 text-xs text-muted-foreground"><Loader2 class="h-3 w-3 animate-spin inline" /> Searching</div>
                <button v-for="d in deResults" :key="d.id" type="button" class="w-full text-left px-2 py-1 text-xs hover:bg-accent" @click="pickDE(d)">{{ d.name }}</button>
                <div v-if="!deSearching && !deResults.length" class="p-2 text-xs text-muted-foreground italic">No matches</div>
              </div>
            </div>
            <template v-else>
              <div class="flex flex-wrap items-center gap-2 text-xs">
                <span class="font-semibold">{{ de.name }}</span>
                <button type="button" class="text-muted-foreground hover:text-foreground inline-flex items-center gap-0.5" @click="de = null; rows = []; dataPreview = null"><X class="h-3 w-3" /> Change</button>
                <span v-if="rowsLoading" class="text-muted-foreground"><Loader2 class="h-3 w-3 animate-spin inline" /> Reading rows</span>
              </div>
              <div v-if="rows.length" class="flex flex-wrap items-center gap-2">
                <label class="text-xs">Row
                  <select v-model.number="rowIndex" class="h-8 ml-1 rounded-full border border-border bg-card px-2 text-xs max-w-[16rem]" aria-label="Row for the preview">
                    <option v-for="(r, i) in rows" :key="i" :value="i">{{ rowLabel(r, i) }}</option>
                  </select>
                </label>
                <label class="text-xs">Subscriber key field
                  <select v-model="keyField" class="h-8 ml-1 rounded-full border border-border bg-card px-2 text-xs" aria-label="Subscriber key field">
                    <option v-for="f in deFields" :key="f.name" :value="f.name">{{ f.name }}</option>
                  </select>
                </label>
                <Button size="sm" :disabled="dataBusy || !parts" data-preview-sfmc @click="previewInSfmc"><Loader2 v-if="dataBusy" class="h-3.5 w-3.5 animate-spin" /> Preview in SFMC</Button>
                <Button size="sm" variant="outline" :disabled="!parts" data-preview-local @click="previewLocally">Fill in here</Button>
                <Button v-if="dataPreview" size="sm" variant="ghost" @click="clearData">Show without data</Button>
              </div>
              <p class="text-[11px] text-muted-foreground">Preview in SFMC renders the email for this row as a send would (AMPscript included); it uses the first {{ ROWS_PAGE }} rows of the data extension. Fill in here only replaces %%Field%% strings with the row's values.</p>
            </template>
            <div v-if="dataError" class="text-xs text-red-700 dark:text-red-300 flex flex-wrap items-center gap-2">{{ dataError }} <ReportErrorButton :error="dataError" /></div>
            <div v-if="dataPreview" class="text-xs" data-preview-how>
              <template v-if="dataPreview.how === 'sfmc'">Showing SFMC's preview for row {{ rowIndex + 1 }}.</template>
              <template v-else>Showing the email with row {{ rowIndex + 1 }} filled in here: {{ dataPreview.filled.length ? dataPreview.filled.join(', ') : 'no %%Field%% strings matched' }}.<template v-if="dataPreview.missing.length"> Not in the data extension: {{ dataPreview.missing.join(', ') }}.</template></template>
            </div>
          </div>

          <div v-if="assetLoading" class="p-6 text-muted-foreground"><Loader2 class="h-4 w-4 animate-spin inline" /> Reading the email</div>
          <div v-else-if="assetError" class="p-4 text-red-700 dark:text-red-300 flex items-center gap-2">{{ assetError }} <ReportErrorButton :error="assetError" /></div>
          <template v-else-if="parts">
            <div v-if="view === 'preview'" class="flex-1 min-h-[480px] p-3 flex flex-col gap-1">
              <iframe :srcdoc="shownHtml" sandbox="" class="flex-1 w-full rounded-lg border border-border bg-white" title="Email preview" data-email-frame />
              <p class="text-[11px] text-muted-foreground">Scripts do not run in the preview. Without data, AMPscript shows as written.</p>
            </div>
            <pre v-else-if="view === 'text'" class="flex-1 m-3 p-3 rounded-lg border border-border whitespace-pre-wrap text-xs">{{ parts.text || 'No text version.' }}</pre>
            <div v-else class="flex-1 min-h-[480px] p-3"><CodeView :code="shownHtml" lang="html" /></div>
          </template>
        </template>
      </section>
    </div>
  </div>
</template>
