<script setup>
import { ref, watch } from 'vue'
import { ListPlus, Loader2 } from 'lucide-vue-next'
import Button from '../ui/button/Button.vue'

// "Insert all fields": pick a table in the query, or search data views and DEs,
// and the editor gets its full column list (see insertFields.js).
const props = defineProps({
  // The QueryEditor component instance (insertAllFields, tablesInQuery, searchTables).
  editor:   { type: Object, default: null },
  disabled: { type: Boolean, default: false },
  // No button of its own: opened from the Run Query Edit menu (feedback #1030).
  bare:     { type: Boolean, default: false },
})

const open = ref(false)
const query = ref('')
const inQuery = ref([])
const results = ref([])
const searching = ref(false)
const busy = ref('')
const note = ref('')
let searchTimer = null
let searchSeq = 0

function toggle() {
  open.value = !open.value
  note.value = ''
  if (open.value) {
    inQuery.value = props.editor?.tablesInQuery?.() || []
    query.value = ''
    results.value = []
  }
}

watch(query, (q) => {
  clearTimeout(searchTimer)
  const text = q.trim()
  if (!text) { results.value = []; searching.value = false; return }
  searching.value = true
  const seq = ++searchSeq
  searchTimer = setTimeout(async () => {
    const items = (await props.editor?.searchTables?.(text)) || []
    if (seq !== searchSeq) return
    results.value = items.slice(0, 30)
    searching.value = false
  }, 250)
})

defineExpose({ toggle })

async function pick(name) {
  if (!props.editor || busy.value) return
  busy.value = name
  note.value = ''
  const r = await props.editor.insertAllFields(name)
  busy.value = ''
  if (r.ok) {
    open.value = false
  } else {
    note.value = r.error || 'Could not insert the fields.'
  }
}
</script>

<template>
  <div class="relative">
    <Button v-if="!bare" variant="outline" size="sm" class="h-6 text-[10px] px-1" :disabled="disabled" title="Insert all fields of a DE or data view" @click="toggle">
      <ListPlus class="h-3 w-3" />
    </Button>
    <template v-if="open">
      <div class="fixed inset-0 z-40" @click="open = false" />
      <div class="absolute mt-1 w-72 z-50 rounded-xl border border-border bg-card shadow-[0_18px_40px_-16px_rgba(17,24,39,0.35)] p-3 text-xs" :class="bare ? 'left-0 top-8' : 'right-0'">
        <div class="text-[13px] font-semibold mb-1">Insert all fields</div>
        <p class="text-muted-foreground mb-2">Replaces <code>*</code> or <code>alias.*</code> for that table, or inserts at the cursor. In an empty editor it writes the whole query.</p>

        <template v-if="inQuery.length">
          <div class="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider mb-1">In this query</div>
          <ul class="mb-2">
            <li v-for="t in inQuery" :key="t">
              <button class="w-full text-left px-2 py-1.5 rounded-lg hover:bg-accent flex items-center gap-1.5 font-mono" @click="pick(t)">
                <Loader2 v-if="busy === t" class="h-3 w-3 animate-spin" />
                <span class="truncate">{{ t }}</span>
              </button>
            </li>
          </ul>
        </template>

        <input
          v-model="query"
          class="w-full h-8 rounded-lg border border-border bg-background text-foreground px-2.5 focus:outline-none focus:ring-2 focus:ring-ring"
          placeholder="Search data views and DEs"
          @keydown.esc="open = false"
        />
        <div v-if="searching" class="text-muted-foreground mt-1">Searching…</div>
        <ul v-else-if="results.length" class="mt-1 max-h-56 overflow-auto">
          <li v-for="t in results" :key="t.kind + t.name">
            <button class="w-full text-left px-2 py-1.5 rounded-lg hover:bg-accent flex items-center gap-1.5" @click="pick(t.sourceType === 'shared' ? 'ENT.' + t.name : t.name)">
              <Loader2 v-if="busy === t.name || busy === 'ENT.' + t.name" class="h-3 w-3 animate-spin" />
              <span class="truncate flex-1 font-mono">{{ t.name }}</span>
              <span class="text-muted-foreground">{{ t.kind === 'dataview' ? 'data view' : t.sourceType === 'shared' ? 'Shared DE' : t.sourceType === 'sync' ? 'Synchronized DE' : 'DE' }}</span>
            </button>
          </li>
        </ul>
        <div v-else-if="query.trim()" class="text-muted-foreground mt-1">No match. Data Extensions are searched from 2 characters.</div>
        <p v-if="note" class="mt-1 text-red-600 dark:text-red-400">{{ note }}</p>
      </div>
    </template>
  </div>
</template>
