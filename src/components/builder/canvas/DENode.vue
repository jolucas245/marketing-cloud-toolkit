<script setup>
// One data extension or data view on the visual Query Builder canvas: header with the
// alias, name and actions; a row per field with a tick (output), key and type icons,
// and a connection handle on each side (drag one onto a field of another card to join).
import { computed, inject, nextTick, ref, watch } from 'vue'
import { Handle, Position, useVueFlow } from '@vue-flow/core'
import {
  Loader2, KeyRound, Type, Hash, Calendar, Mail, Phone, ToggleLeft, Globe, X, Search, Crown, Filter, Pencil,
} from 'lucide-vue-next'
import { visibleRows, fieldHandle, headerHandle, ROW_H, HEADER_H } from '@/utils/builderCanvas.js'

const props = defineProps({
  id: { type: String, required: true },
  data: { type: Object, required: true },
})

const canvas = inject('builderCanvas')
const { updateNodeInternals } = useVueFlow()

const showAll = ref(false)
const search = ref('')
const searching = ref(false)

const de = computed(() => props.data.de)
const joined = computed(() => new Set(props.data.joined || []))
const view = computed(() => visibleRows(de.value, joined.value, { showAll: showAll.value, search: search.value }))
const loading = computed(() => !de.value.fields?.length && !de.value.fieldsLoaded)
const isFrom = computed(() => props.data.index === 0)
const filtered = computed(() => new Set(props.data.filtered || []))
const isSub = computed(() => de.value.sourceType === 'subquery')
const sourceLabel = computed(() => {
  if (isSub.value) return 'Subquery'
  if (de.value.missing) return 'Not found'
  return de.value.isDataView || de.value.sourceType === 'dataview' ? 'Data view' : (de.value.sourceType || 'DE')
})

// Rows moved without the card changing size: tell Vue Flow where the handles are now.
watch(() => view.value.rows.map((r) => r.index).join(','), () => nextTick(() => updateNodeInternals([props.id])))

// Icon colour per field type (design: numbers blue, dates violet, text grey).
function typeTone(f) {
  const t = String(f?.type ?? f?.fieldType ?? '').toLowerCase()
  if (t.includes('number') || t.includes('decimal') || t.includes('int')) return 'text-blue-700 dark:text-blue-300'
  if (t.includes('date')) return 'text-violet-700 dark:text-violet-300'
  if (t.includes('email') || t.includes('phone')) return 'text-teal-700 dark:text-teal-300'
  if (t.includes('bool')) return 'text-amber-700 dark:text-amber-300'
  return 'text-muted-foreground'
}
function typeIcon(f) {
  const t = String(f?.type ?? f?.fieldType ?? '').toLowerCase()
  if (t.includes('email')) return Mail
  if (t.includes('phone')) return Phone
  if (t.includes('date')) return Calendar
  if (t.includes('bool')) return ToggleLeft
  if (t.includes('number') || t.includes('decimal') || t.includes('int')) return Hash
  if (t.includes('locale')) return Globe
  return Type
}
const isKey = (f) => !!(f?.isPrimaryKey || f?.isKey || f?.primaryKey)
const ticked = (name) => de.value.selectedFields === null || (de.value.selectedFields || []).includes(name)
const tickCount = computed(() => de.value.selectedFields === null ? (de.value.fields || []).length : (de.value.selectedFields || []).length)

function toggleSearch() {
  searching.value = !searching.value
  if (!searching.value) search.value = ''
}
</script>

<template>
  <div
    class="de-node w-[240px] rounded-[14px] bg-card text-card-foreground shadow-[0_16px_36px_-24px_rgba(17,24,39,0.45)]"
    :class="[isFrom ? 'border-2 border-primary' : 'border border-border', isSub ? 'border-dashed' : '', de.missing ? 'opacity-80' : '']"
  >
    <Handle :id="headerHandle('l')" type="source" :position="Position.Left" class="de-handle de-handle-hdr" :style="{ top: HEADER_H / 2 + 'px' }" />
    <Handle :id="headerHandle('r')" type="source" :position="Position.Right" class="de-handle de-handle-hdr" :style="{ top: HEADER_H / 2 + 'px' }" />

    <div class="de-node-header flex items-center gap-2 px-2.5 border-b border-border rounded-t-[13px] cursor-move"
      :class="isFrom ? 'bg-primary/5' : 'bg-muted/40'" :style="{ height: HEADER_H + 'px' }">
      <span class="text-[11px] font-mono text-primary bg-card border border-primary/30 rounded-md px-1.5 shrink-0" :title="isFrom ? 'Alias. This is the FROM table' : 'Alias'">{{ data.alias }}</span>
      <div class="min-w-0 flex-1 leading-tight">
        <div class="text-[13px] font-bold truncate" :title="de.name">{{ de.name }}</div>
        <div class="text-[10px] text-muted-foreground truncate">
          <template v-if="isFrom">FROM · </template>{{ sourceLabel }} · {{ tickCount }} of {{ (de.fields || []).length }} fields out
        </div>
      </div>
      <button v-if="isSub" class="nodrag h-6 w-6 shrink-0 inline-flex items-center justify-center rounded-full text-muted-foreground hover:bg-accent hover:text-foreground" title="Edit the subquery's SQL" aria-label="Edit the subquery's SQL" @click="canvas.editSubquery(id)"><Pencil class="h-3 w-3" /></button>
      <button class="nodrag h-6 w-6 shrink-0 inline-flex items-center justify-center rounded-full text-muted-foreground hover:bg-accent hover:text-foreground" :title="`Search fields in ${de.name}`" :aria-label="`Search fields in ${de.name}`" @click="toggleSearch"><Search class="h-3.5 w-3.5" /></button>
      <button v-if="!isFrom" class="nodrag h-6 w-6 shrink-0 inline-flex items-center justify-center rounded-full text-muted-foreground hover:bg-accent hover:text-foreground" title="Make this the FROM table" aria-label="Make this the FROM table" @click="canvas.makeFrom(id)"><Crown class="h-3.5 w-3.5" /></button>
      <button class="nodrag h-6 w-6 shrink-0 inline-flex items-center justify-center rounded-full text-muted-foreground hover:bg-accent hover:text-destructive" :title="`Remove ${de.name}`" :aria-label="`Remove ${de.name}`" @click="canvas.remove(id)"><X class="h-3.5 w-3.5" /></button>
    </div>

    <div v-if="searching" class="nodrag px-2.5 py-1 border-b border-border">
      <input v-model="search" class="w-full h-7 text-xs px-2 rounded-lg border border-border bg-background focus:outline-none focus:border-primary" placeholder="Find a field" @keydown.esc="toggleSearch" />
    </div>

    <div v-if="loading" class="flex items-center gap-1 px-2.5 text-[11px] text-muted-foreground" :style="{ height: ROW_H + 'px' }">
      <Loader2 class="h-3 w-3 animate-spin" /> Loading fields…
    </div>
    <div v-else-if="!view.rows.length" class="px-2.5 text-[11px] italic text-muted-foreground flex items-center" :style="{ height: ROW_H + 'px' }">
      {{ search ? 'No field matches' : 'No fields' }}
    </div>
    <div
      v-for="r in view.rows"
      :key="r.index"
      class="de-row relative flex items-center gap-2 px-2.5 text-xs hover:bg-muted/60"
      :class="joined.has(r.field.name) ? 'font-semibold' : ''"
      :style="{ height: ROW_H + 'px' }"
    >
      <Handle :id="fieldHandle(r.index, 'l')" type="source" :position="Position.Left" class="de-handle" />
      <input type="checkbox" class="nodrag h-3.5 w-3.5 shrink-0 accent-primary" :checked="ticked(r.field.name)" :title="ticked(r.field.name) ? 'In the output. Untick to leave out' : 'Tick to add to the output'" @change="canvas.toggleField(id, r.field.name)" />
      <KeyRound v-if="isKey(r.field)" class="h-3 w-3 text-amber-500 shrink-0" />
      <component :is="typeIcon(r.field)" v-else class="h-3 w-3 shrink-0" :class="typeTone(r.field)" />
      <span class="truncate flex-1" :title="r.field.name">{{ r.field.name }}</span>
      <Filter v-if="filtered.has(r.field.name)" class="h-2.5 w-2.5 text-primary shrink-0" title="Used in a filter" />
      <button class="nodrag de-row-action text-[10px] font-medium text-primary opacity-0 hover:underline shrink-0" title="Add a filter on this field" @click="canvas.addFilter(id, r.field.name)">filter</button>
      <Handle :id="fieldHandle(r.index, 'r')" type="source" :position="Position.Right" class="de-handle" />
    </div>

    <div v-if="view.hidden || showAll" class="nodrag flex items-center px-2.5 border-t border-border text-[11px]" style="height: 26px">
      <button class="font-semibold text-primary hover:underline" @click="showAll = !showAll">
        {{ showAll ? 'Show fewer fields' : `Show all ${(de.fields || []).length} fields (${view.hidden} hidden)` }}
      </button>
    </div>
  </div>
</template>

<style scoped>
.de-row:hover .de-row-action { opacity: 1; }
</style>
