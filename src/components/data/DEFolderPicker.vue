<script setup>
// Data extension folder tree (under the local "Data Extensions" folder), read one
// level at a time. Shared by Save as query activity (#88), Create DE (#94), Save
// results, Templates and Email validation.
// v-model is the folder id; `path` (v-model:path) is its "Data Extensions > ..." name.
// Rows look like the data extension tree (DEBrowser / DETreeNode), so both trees on a
// page match (user, 2026-11-06). A folder set from outside (Email validation presets
// the picked DE's folder) is revealed: its parents open and it scrolls into view. A
// folder outside the local Data Extensions tree (a shared folder) can't be shown here,
// so the pick is cleared and the user chooses one.
import { computed, nextTick, ref, watch } from 'vue'
import { ChevronRight, ChevronDown, Folder, Loader2 } from 'lucide-vue-next'
import { loadDERoot, loadDEChildFolders } from '../../utils/saveAsActivity.js'
import { fetchDEFolderChain } from '../../utils/deApi.js'

const props = defineProps({
  stack: { type: String, default: null },
  modelValue: { type: [String, Number], default: null },
  path: { type: String, default: '' },
  height: { type: String, default: 'max-h-40' },
})
const emit = defineEmits(['update:modelValue', 'update:path', 'error'])

const root = ref(null)
const children = ref({}) // id -> folders
const open = ref(new Set())
const loadingIds = ref(new Set())
const names = ref({}) // id -> path
const loading = ref(false)
const box = ref(null)
let token = 0

const sid = (v) => (v == null ? '' : String(v))
const isSelected = (f) => sid(props.modelValue) !== '' && sid(props.modelValue) === sid(f.id)

async function load() {
  const mine = ++token
  root.value = null
  children.value = {}
  open.value = new Set()
  names.value = {}
  if (!props.stack) return
  loading.value = true
  try {
    const r = await loadDERoot(props.stack)
    if (mine !== token) return
    root.value = r
    if (r) {
      names.value = { [r.id]: r.name }
      await expand(r)
      await reveal(props.modelValue)
    }
  } catch (e) {
    emit('error', `Could not read the folders: ${e.message}`)
  } finally {
    if (mine === token) loading.value = false
  }
}

/** Open a folder, reading its subfolders the first time. */
async function expand(folder) {
  const id = sid(folder.id)
  open.value = new Set(open.value).add(id)
  if (children.value[id]) return
  const mine = token
  loadingIds.value = new Set(loadingIds.value).add(id)
  try {
    const kids = await loadDEChildFolders(props.stack, folder.id)
    if (mine !== token) return
    children.value = { ...children.value, [id]: kids }
    const n = { ...names.value }
    for (const k of kids) n[k.id] = `${n[folder.id] || folder.name} > ${k.name}`
    names.value = n
  } catch (e) {
    emit('error', `Could not read the folder: ${e.message}`)
  } finally {
    const next = new Set(loadingIds.value)
    next.delete(id)
    loadingIds.value = next
  }
}

function toggle(folder) {
  const id = sid(folder.id)
  if (open.value.has(id)) {
    const next = new Set(open.value)
    next.delete(id)
    open.value = next
    return
  }
  expand(folder)
}

let clicked = '' // the folder last picked in this tree
function pick(f) {
  clicked = sid(f.id)
  emit('update:modelValue', f.id)
  emit('update:path', names.value[f.id] || f.name)
  if (!open.value.has(sid(f.id))) expand(f)
}

/** Open the folders above `id` and scroll it into view. */
async function reveal(id) {
  if (!root.value || sid(id) === '') return
  const mine = token
  let chain
  try {
    chain = await fetchDEFolderChain(props.stack, id)
  } catch (e) {
    emit('error', `Could not read the folder: ${e.message}`)
    return
  }
  if (mine !== token || sid(id) !== sid(props.modelValue)) return
  if (!chain.length || sid(chain[0].id) !== sid(root.value.id)) {
    // Not under the local Data Extensions folder: let the user pick one here.
    emit('update:modelValue', null)
    emit('update:path', '')
    return
  }
  for (const f of chain.slice(0, -1)) {
    await expand(f)
    if (mine !== token) return
  }
  emit('update:path', names.value[id] || chain.map((f) => f.name).join(' > '))
  await nextTick()
  const row = [...(box.value?.querySelectorAll('[data-folder-id]') || [])].find((el) => el.dataset.folderId === sid(id))
  if (row && box.value) box.value.scrollTop = Math.max(0, row.offsetTop - box.value.clientHeight / 2 + row.offsetHeight / 2)
}

const rows = computed(() => {
  const out = []
  const seen = new Set() // a folder listed under itself would never end
  const walk = (f, depth) => {
    if (seen.has(sid(f.id))) return
    seen.add(sid(f.id))
    out.push({ ...f, depth })
    if (open.value.has(sid(f.id))) for (const c of children.value[sid(f.id)] || []) walk(c, depth + 1)
  }
  if (root.value) walk(root.value, 0)
  return out
})

// A folder whose subfolders were read and came back empty has nothing to open.
const isLeaf = (f) => Array.isArray(children.value[sid(f.id)]) && !children.value[sid(f.id)].length

const shownPath = computed(() => names.value[props.modelValue] || props.path || '')

watch(() => props.stack, load, { immediate: true })
// Set from outside (not by a click here, which already shows the row): reveal it.
watch(() => props.modelValue, (id) => {
  if (sid(id) !== '' && sid(id) !== clicked) reveal(id)
})
</script>

<template>
  <div class="space-y-1">
    <span class="text-muted-foreground">Folder: <b class="text-foreground" data-folder-path>{{ shownPath || 'none picked' }}</b></span>
    <div ref="box" class="relative overflow-y-auto rounded-lg border border-border p-2 text-[13px]" :class="height" role="tree" aria-label="Data extension folders">
      <div v-if="loading" class="flex items-center gap-1.5 px-2.5 py-1.5 text-muted-foreground"><Loader2 class="h-3.5 w-3.5 animate-spin" /> Reading folders...</div>
      <div
        v-for="f in rows"
        :key="f.id"
        class="flex items-center gap-2 py-1.5 pr-2.5 rounded-lg"
        :class="[isSelected(f) ? 'bg-primary/10 text-primary font-semibold' : 'hover:bg-accent', f.depth === 0 && !isSelected(f) ? 'font-semibold' : '']"
        :style="{ paddingLeft: `${f.depth * 12 + 10}px` }"
        role="treeitem"
        :aria-selected="isSelected(f)"
        :aria-expanded="isLeaf(f) ? undefined : open.has(String(f.id))"
        :data-folder-id="f.id"
      >
        <button v-if="!isLeaf(f)" type="button" class="h-3.5 w-3.5 shrink-0 flex items-center justify-center text-muted-foreground" :aria-label="open.has(String(f.id)) ? 'Collapse' : 'Expand'" data-folder-toggle @click="toggle(f)">
          <Loader2 v-if="loadingIds.has(String(f.id))" class="h-3.5 w-3.5 animate-spin" />
          <ChevronDown v-else-if="open.has(String(f.id))" class="h-3.5 w-3.5" />
          <ChevronRight v-else class="h-3.5 w-3.5" />
        </button>
        <span v-else class="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
        <button type="button" class="flex flex-1 min-w-0 items-center gap-2 text-left" data-folder-name @click="pick(f)">
          <Folder class="h-3.5 w-3.5 shrink-0" :class="isSelected(f) ? '' : 'text-muted-foreground'" />
          <span class="truncate">{{ f.name }}</span>
        </button>
        <span v-if="isSelected(f)" class="ml-auto shrink-0 text-[11px] font-normal">selected</span>
      </div>
    </div>
  </div>
</template>
