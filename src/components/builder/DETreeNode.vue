<script setup>
import { ChevronRight, ChevronDown, Database, Folder, Loader2 } from 'lucide-vue-next'

defineProps({
  node: { type: Object, required: true },
  depth: { type: Number, default: 0 },
  expanded: { type: Object, required: true },      // Set<string>
  loadingFolders: { type: Object, required: true }, // Set<string>
  folderChildren: { type: Object, required: true }, // { [id]: node[] }
  inQuery: { type: Object, default: () => new Set() }, // Set<string> of ids already in the query
  selectedLabel: { type: String, default: 'in query' },
})

const emit = defineEmits(['toggle', 'select'])

function key(n) {
  return String(n.id)
}

function onDeDragStart(e, n) {
  try {
    e.dataTransfer.setData('application/x-sfmc-de', JSON.stringify(n))
    e.dataTransfer.effectAllowed = 'copy'
  } catch { /* ignore */ }
}
</script>

<template>
  <div>
    <!-- Leaf: data extension / data view -->
    <button
      v-if="node.type === 'de'"
      class="w-full text-left py-1.5 pr-2.5 rounded-lg flex items-center gap-2 cursor-grab active:cursor-grabbing"
      :class="inQuery.has(key(node)) ? 'bg-primary/10 text-primary font-semibold' : 'hover:bg-accent'"
      :style="{ paddingLeft: depth * 12 + 10 + 'px' }"
      draggable="true"
      @dragstart="onDeDragStart($event, node)"
      @click="emit('select', node)"
    >
      <Database class="h-3.5 w-3.5 shrink-0" />
      <span class="truncate">{{ node.name }}</span>
      <span v-if="inQuery.has(key(node))" class="ml-auto shrink-0 text-[11px]">{{ selectedLabel }}</span>
    </button>

    <!-- Folder -->
    <template v-else>
      <button
        class="w-full flex items-center gap-2 py-1.5 pr-2.5 hover:bg-accent rounded-lg"
        :style="{ paddingLeft: depth * 12 + 6 + 'px' }"
        :aria-expanded="expanded.has(key(node))"
        @click="emit('toggle', node)"
      >
        <ChevronDown v-if="expanded.has(key(node))" class="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
        <ChevronRight v-else class="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
        <Folder class="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
        <span class="truncate">{{ node.name }}</span>
      </button>

      <div v-if="expanded.has(key(node))">
        <div
          v-if="loadingFolders.has(key(node))"
          class="flex items-center gap-1.5 text-muted-foreground py-1"
          :style="{ paddingLeft: (depth + 1) * 12 + 8 + 'px' }"
        >
          <Loader2 class="h-3.5 w-3.5 animate-spin" /> Loading...
        </div>
        <template v-else>
          <DETreeNode
            v-for="child in folderChildren[key(node)] || []"
            :key="child.id"
            :node="child"
            :depth="depth + 1"
            :expanded="expanded"
            :loading-folders="loadingFolders"
            :folder-children="folderChildren"
            :in-query="inQuery" :selected-label="selectedLabel"
            @toggle="emit('toggle', $event)"
            @select="emit('select', $event)"
          />
          <div
            v-if="!(folderChildren[key(node)] || []).length"
            class="text-muted-foreground py-1"
            :style="{ paddingLeft: (depth + 1) * 12 + 8 + 'px' }"
          >
            Empty
          </div>
        </template>
      </div>
    </template>
  </div>
</template>
