<script setup>
// Content Builder folder tree for Content > Emails (feedback #1054) and CloudPages
// (#1059). Folders load as they are opened. v-model is the open folder ({ id, name }
// or null for "All").
import { computed, reactive, ref, watch } from 'vue'
import { Loader2, Folder, FolderOpen, ChevronRight, ChevronDown } from 'lucide-vue-next'
import SfmcErrorNotice from '@/components/results/SfmcErrorNotice.vue'
import { withReconnect, searchError } from '@/utils/sfmcErrors.js'
import { fetchContentFolders } from '@/utils/contentEmails.js'

const props = defineProps({
  stack: { type: String, default: null },
  modelValue: { type: Object, default: null },
  categoryType: { type: String, default: '' },
  allLabel: { type: String, default: 'All' },
  allIcon: { type: [Object, Function], default: null },
})
const emit = defineEmits(['update:modelValue'])

const children = reactive({})
const expanded = reactive(new Set())
const loading = reactive(new Set())
const error = ref(null)

async function loadChildren(parentId) {
  if (!props.stack || children[parentId] || loading.has(parentId)) return
  loading.add(parentId)
  try { children[parentId] = await withReconnect(props.stack, () => fetchContentFolders(props.stack, parentId, { categoryType: props.categoryType })) }
  catch (e) { error.value = searchError(e, 'read the folders') }
  finally { loading.delete(parentId) }
}
function toggle(f) {
  if (expanded.has(f.id)) expanded.delete(f.id)
  else { expanded.add(f.id); loadChildren(f.id) }
}
function open(f) {
  emit('update:modelValue', f ? { id: f.id, name: f.name } : null)
  if (f && !expanded.has(f.id)) { expanded.add(f.id); loadChildren(f.id) }
}
const visible = computed(() => {
  const out = []
  const walk = (pid, depth) => {
    for (const f of children[pid] || []) {
      out.push({ ...f, depth })
      if (expanded.has(f.id)) {
        if (loading.has(f.id)) out.push({ id: `${f.id}:loading`, loading: true, depth: depth + 1 })
        walk(f.id, depth + 1)
      }
    }
  }
  walk('0', 0)
  return out
})
function reload() {
  for (const k of Object.keys(children)) delete children[k]
  expanded.clear()
  error.value = null
  loadChildren('0')
}
watch(() => props.stack, () => reload(), { immediate: true })
defineExpose({ reload })
</script>

<template>
  <nav class="overflow-y-auto p-2" aria-label="Folders" data-content-folders>
    <button type="button" class="w-full flex items-center gap-1.5 rounded px-2 py-1 text-left" :class="!modelValue ? 'bg-primary/10 text-primary font-medium' : 'hover:bg-accent'" @click="open(null)">
      <component :is="allIcon || Folder" class="h-4 w-4" /> {{ allLabel }}
    </button>
    <div v-for="f in visible" :key="f.id" :style="{ paddingLeft: `${f.depth * 14}px` }">
      <div v-if="f.loading" class="flex items-center gap-1 px-2 py-1 text-xs text-muted-foreground"><Loader2 class="h-3 w-3 animate-spin" /> Loading</div>
      <div v-else class="flex items-center rounded" :class="modelValue?.id === f.id ? 'bg-primary/10 text-primary font-medium' : 'hover:bg-accent'">
        <button type="button" class="p-1" :aria-label="expanded.has(f.id) ? `Close ${f.name}` : `Open ${f.name}`" @click="toggle(f)">
          <ChevronDown v-if="expanded.has(f.id)" class="h-3.5 w-3.5" /><ChevronRight v-else class="h-3.5 w-3.5" />
        </button>
        <button type="button" class="flex-1 flex items-center gap-1.5 py-1 pr-2 text-left truncate" :data-folder="f.id" @click="open(f)">
          <FolderOpen v-if="modelValue?.id === f.id" class="h-4 w-4 shrink-0" /><Folder v-else class="h-4 w-4 shrink-0" />
          <span class="truncate">{{ f.name }}</span>
        </button>
      </div>
    </div>
    <div v-if="loading.has('0')" class="flex items-center gap-1 px-2 py-1 text-xs text-muted-foreground"><Loader2 class="h-3 w-3 animate-spin" /> Loading folders</div>
    <SfmcErrorNotice v-if="error" :error="error" class="mt-2" @retry="reload" />
  </nav>
</template>
