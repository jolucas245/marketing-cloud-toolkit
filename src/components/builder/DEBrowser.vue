<script setup>
import ReportErrorButton from '@/components/results/ReportErrorButton.vue'
import { ref, computed, watch } from 'vue'
import { ChevronRight, ChevronDown, Database, Search, Loader2, Folder } from 'lucide-vue-next'
import {
  loadRootSections, loadFolderContents, getDataViewNodes, debouncedSearchDEs,
} from '../../utils/deCatalog.js'
import DETreeNode from './DETreeNode.vue'
import SfmcErrorNotice from '../results/SfmcErrorNotice.vue'
import { withReconnect, searchError as describeError } from '../../utils/sfmcErrors.js'

const props = defineProps({
  stack: { type: String, default: null },
  // Ids of the tables already in the query, marked "in query" in the lists.
  selectedIds: { type: Array, default: () => [] },
  // Pickers that need a real data extension leave the data views out (feedback #1055).
  hideDataViews: { type: Boolean, default: false },
})
const inQuery = computed(() => new Set(props.selectedIds.map(String)))

const emit = defineEmits(['select-de'])

const roots = ref([])
const dataViews = ref(getDataViewNodes())
const expanded = ref(new Set())
const loadingFolders = ref(new Set())
const folderChildren = ref({}) // folderId -> nodes[]
const searchQuery = ref('')
const searchResults = ref([])
const searching = ref(false)
const searchError = ref('')
const showDataViews = ref(true)
const rootsError = ref(null)
const loadingRoots = ref(false)

// Failing to read the folders used to leave the tree empty (feedback #93).
async function loadRoots() {
  if (!props.stack) return
  loadingRoots.value = true
  rootsError.value = null
  try {
    roots.value = await withReconnect(props.stack, () => loadRootSections(props.stack))
  } catch (e) {
    roots.value = []
    rootsError.value = describeError(e, 'read the data extension folders')
  } finally {
    loadingRoots.value = false
  }
}

watch(() => props.stack, loadRoots, { immediate: true })

function toggleExpand(node) {
  const key = String(node.id)
  if (expanded.value.has(key)) {
    expanded.value.delete(key)
    expanded.value = new Set(expanded.value)
    return
  }
  expanded.value.add(key)
  expanded.value = new Set(expanded.value)
  if (node.type === 'folder' && !folderChildren.value[key]) {
    loadChildren(node)
  }
}

async function loadChildren(node) {
  const key = String(node.id)
  loadingFolders.value.add(key)
  loadingFolders.value = new Set(loadingFolders.value)
  try {
    folderChildren.value[key] = await loadFolderContents(props.stack, node)
    folderChildren.value = { ...folderChildren.value }
  } finally {
    loadingFolders.value.delete(key)
    loadingFolders.value = new Set(loadingFolders.value)
  }
}

function onSearchInput() {
  if (!props.stack || !searchQuery.value.trim()) {
    searchResults.value = []
    return
  }
  searching.value = true
  // Data views are not data extensions, so SFMC's DE search never returns them
  // (feedback #137: _ChatMessagingSubscription); match them by name here.
  const dvMatches = () => {
    const q = searchQuery.value.trim().toLowerCase()
    if (props.hideDataViews) return []
    return q ? dataViews.value.filter((n) => n.name.toLowerCase().includes(q)) : []
  }
  searchResults.value = dvMatches()
  debouncedSearchDEs(props.stack, searchQuery.value, (items, error) => {
    // DEs already shown in opened folders count too (feedback #89: a DE in the tree
    // the search did not return).
    const q = searchQuery.value.trim().toLowerCase()
    const ids = new Set(items.map((d) => String(d.id)))
    const inTree = Object.values(folderChildren.value).flat()
      .filter((n) => n?.type === 'de' && String(n.name || '').toLowerCase().includes(q) && !ids.has(String(n.id)))
    searchResults.value = [...dvMatches(), ...items, ...inTree]
    searchError.value = searchResults.value.length ? '' : (error || '')
    searching.value = false
  })
}

function selectDe(node) {
  emit('select-de', node)
}

function onDeDragStart(e, node) {
  try {
    e.dataTransfer.setData('application/x-sfmc-de', JSON.stringify(node))
    e.dataTransfer.effectAllowed = 'copy'
  } catch { /* ignore */ }
}

function badgeClass(sourceType) {
  const map = {
    folder: 'bg-blue-50 text-blue-700 dark:bg-blue-950 dark:text-blue-300',
    shared: 'bg-violet-50 text-violet-700 dark:bg-violet-950 dark:text-violet-300',
    sync: 'bg-teal-50 text-teal-700 dark:bg-teal-950 dark:text-teal-300',
    salesforce: 'bg-orange-50 text-orange-700 dark:bg-orange-950 dark:text-orange-300',
    dataview: 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300',
    search: 'bg-amber-50 text-amber-800 dark:bg-amber-950 dark:text-amber-300',
  }
  return map[sourceType] || 'bg-muted text-muted-foreground'
}

</script>

<template>
  <aside class="de-browser flex flex-col h-full border-r border-border bg-card" aria-label="Data sources">
    <div class="p-3 shrink-0">
      <label for="qb-src" class="sr-only">Search DEs and data views</label>
      <div class="flex items-center gap-2.5 h-[38px] px-4 rounded-full border border-border bg-card focus-within:border-primary/50 focus-within:ring-4 focus-within:ring-primary/10">
        <Search class="h-4 w-4 shrink-0 text-muted-foreground" />
        <input id="qb-src" v-model="searchQuery" type="text" class="flex-1 min-w-0 bg-transparent border-0 outline-none text-sm placeholder:text-muted-foreground" placeholder="Search DEs and data views" @input="onSearchInput" />
      </div>
    </div>

    <div class="flex-1 overflow-y-auto px-2 pb-3 text-[13px]">
      <div v-if="searchQuery.trim()" class="flex flex-col gap-0.5">
        <div v-if="searching" class="flex items-center gap-1.5 px-2.5 py-1.5 text-muted-foreground">
          <Loader2 class="h-3.5 w-3.5 animate-spin" /> Searching...
        </div>
        <button
          v-for="node in searchResults"
          :key="node.id"
          class="w-full text-left px-2.5 py-1.5 rounded-lg flex items-center gap-2 cursor-grab active:cursor-grabbing"
          :class="inQuery.has(String(node.id)) ? 'bg-primary/10 text-primary font-semibold' : 'hover:bg-accent'"
          draggable="true"
          @dragstart="onDeDragStart($event, node)"
          @click="selectDe(node)"
        >
          <Database class="h-3.5 w-3.5 shrink-0" />
          <span class="truncate flex-1">{{ node.name }}</span>
          <span v-if="inQuery.has(String(node.id))" class="shrink-0 text-[11px]">in query</span>
          <span v-else class="shrink-0 text-[11px] font-semibold px-2 py-0.5 rounded-md" :class="badgeClass(node.sourceType)">{{ node.sourceType === 'dataview' ? 'data view' : node.sourceType }}</span>
        </button>
        <div v-if="!searching && !searchResults.length && searchError" class="px-2.5 py-1.5 text-destructive" role="alert">Search failed: {{ searchError }}<ReportErrorButton /></div>
        <div v-else-if="!searching && !searchResults.length" class="px-2.5 py-1.5 text-muted-foreground">No matches</div>
      </div>

      <template v-else>
        <!-- Root folders -->
        <div v-if="rootsError" class="text-xs"><SfmcErrorNotice :error="rootsError" :retrying="loadingRoots" @retry="loadRoots" /></div>
        <div v-for="root in roots" :key="root.id">
          <button class="w-full flex items-center gap-2 px-2.5 py-1.5 rounded-lg font-semibold hover:bg-accent" :aria-expanded="expanded.has(String(root.id))" @click="toggleExpand(root)">
            <ChevronDown v-if="expanded.has(String(root.id))" class="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
            <ChevronRight v-else class="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
            <Folder class="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
            <span class="truncate">{{ root.name }}</span>
            <span v-if="root.sourceType && root.sourceType !== 'folder'" class="ml-auto shrink-0 text-[11px] font-semibold px-2 py-0.5 rounded-md" :class="badgeClass(root.sourceType)">{{ root.sourceType }}</span>
          </button>

          <div v-if="expanded.has(String(root.id))" class="text-[13px]">
            <div v-if="loadingFolders.has(String(root.id))" class="flex items-center gap-1.5 py-1 pl-8 text-muted-foreground">
              <Loader2 class="h-3.5 w-3.5 animate-spin" /> Loading...
            </div>
            <DETreeNode
              v-for="child in folderChildren[String(root.id)] || []"
              :key="child.id"
              :node="child"
              :depth="1"
              :expanded="expanded"
              :loading-folders="loadingFolders"
              :folder-children="folderChildren"
              :in-query="inQuery"
              @toggle="toggleExpand"
              @select="selectDe"
            />
          </div>
        </div>

        <div v-if="!roots.length && stack && !rootsError" class="flex flex-col gap-2 px-2.5 py-2" aria-label="Loading folders">
          <span class="sr-only">Loading folders...</span>
          <span aria-hidden="true" class="block h-2 w-36 rounded-full bg-muted" />
          <span aria-hidden="true" class="block h-2 w-28 rounded-full bg-muted" />
        </div>
        <div v-if="!stack" class="px-2.5 py-2 text-muted-foreground">Connect to SFMC first</div>

        <!-- System data views -->
        <button v-if="!hideDataViews" class="w-full flex items-center gap-1.5 px-2.5 pt-3 pb-1 text-[11px] font-semibold uppercase tracking-[0.06em] text-muted-foreground hover:text-foreground" :aria-expanded="showDataViews" @click="showDataViews = !showDataViews">
          System data views · {{ dataViews.length }}
          <ChevronDown v-if="showDataViews" class="h-3 w-3" /><ChevronRight v-else class="h-3 w-3" />
        </button>
        <div v-if="showDataViews && !hideDataViews" class="flex flex-col gap-0.5">
          <button
            v-for="dv in dataViews"
            :key="dv.id"
            class="w-full text-left px-2.5 py-1.5 rounded-lg flex items-center gap-2 cursor-grab active:cursor-grabbing"
            :class="inQuery.has(String(dv.id)) ? 'bg-primary/10 text-primary font-semibold' : 'hover:bg-accent'"
            draggable="true"
            @dragstart="onDeDragStart($event, dv)"
            @click="selectDe(dv)"
          >
            <Database class="h-3.5 w-3.5 shrink-0" />
            <span class="truncate">{{ dv.name }}</span>
            <span v-if="inQuery.has(String(dv.id))" class="ml-auto shrink-0 text-[11px]">in query</span>
          </button>
        </div>
      </template>
    </div>
  </aside>
</template>
