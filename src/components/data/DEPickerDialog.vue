<script setup>
// Pick a data extension from its folders (and optionally one of its rows) in a dialog
// (feedback #1055 for Content > Emails, #1060 for Email validation). The folder tree
// and search are the Query Builder's (DEBrowser), without data views. With `withRow`,
// the right side shows the DE's first rows; clicking one picks it. With `requireSendable`,
// a DE that SFMC says is not sendable is refused before its rows are read (feedback #1075:
// email previews with data need a sendable DE, error 10005).
import { computed, ref, watch, onMounted, onBeforeUnmount } from 'vue'
import { X, Loader2, Database } from 'lucide-vue-next'
import DEBrowser from '@/components/builder/DEBrowser.vue'
import Button from '@/components/ui/button/Button.vue'
import Input from '@/components/ui/input/Input.vue'
import { fetchDEDetail, fetchDEFieldList } from '@/utils/deApi.js'
import { fetchRowsAt, filterRows, ROWS_PAGE } from '@/utils/deRows.js'

const props = defineProps({
  stack: { type: String, default: null },
  title: { type: String, default: 'Choose a data extension' },
  withRow: { type: Boolean, default: false },
  requireSendable: { type: Boolean, default: false },
  // Lists only sendable data extensions (Email validation, user 2026-11-06); a DE whose
  // sendability the list does not give is checked when picked, as with requireSendable.
  sendableOnly: { type: Boolean, default: false },
  notSendableMessage: { type: String, default: 'SFMC previews an email with data only from a sendable data extension: pick a sendable one, or use Type values.' },
})
const checkSendable = computed(() => props.requireSendable || props.sendableOnly)
const emit = defineEmits(['pick', 'close'])

const de = ref(null) // { id, name, key }
const fields = ref([])
const rows = ref([])
const loading = ref(false)
const error = ref('')
const filter = ref('')

async function chooseDE(node) {
  if (node.isDataView) return
  de.value = { id: node.id, name: node.name, key: node.key || node.customerKey || '' }
  error.value = ''
  rows.value = []
  fields.value = []
  filter.value = ''
  loading.value = true
  try {
    if (!de.value.key || checkSendable.value) {
      const d = await fetchDEDetail(props.stack, node.id)
      if (!de.value.key) de.value.key = d?.customerKey || d?.key || ''
      // Unknown (no isSendable in the response) is let through; SFMC then says so itself.
      if (checkSendable.value && d && d.isSendable === false) {
        error.value = `${node.name} is not sendable. ${props.notSendableMessage}`
        return
      }
    }
    if (!de.value.key) throw new Error('SFMC sent no customer key for this data extension')
    if (!props.withRow) { emit('pick', { de: de.value }); return }
    fields.value = await fetchDEFieldList(props.stack, node.id)
    const r = await fetchRowsAt(props.stack, de.value.key, 0, ROWS_PAGE, fields.value.map((f) => f.name))
    rows.value = r.rows
    if (!r.rows.length) error.value = 'This data extension has no rows.'
  } catch (e) {
    error.value = `Could not read ${node.name}: ${e.message}`
  } finally { loading.value = false }
}
const columns = computed(() => fields.value.map((f) => f.name))
const shownRows = computed(() => (filter.value.trim() ? filterRows(rows.value, columns.value, filter.value) : rows.value))
function pickRow(r) {
  emit('pick', { de: de.value, fields: fields.value, rows: rows.value, index: rows.value.indexOf(r) })
}

const onKey = (e) => { if (e.key === 'Escape') emit('close') }
onMounted(() => window.addEventListener('keydown', onKey))
onBeforeUnmount(() => window.removeEventListener('keydown', onKey))
watch(() => props.stack, () => { de.value = null; rows.value = [] })
</script>

<template>
  <div class="fixed inset-0 z-[200] flex items-center justify-center bg-black/40 p-4" @mousedown.self="emit('close')">
    <div role="dialog" aria-modal="true" :aria-label="title" class="flex flex-col w-full max-w-5xl h-[80vh] overflow-hidden rounded-2xl border border-border bg-card shadow-xl" data-de-picker>
      <div class="flex items-center gap-2 px-4 py-3 border-b border-border">
        <Database class="h-4 w-4 text-primary" />
        <h2 class="font-semibold flex-1">{{ title }}</h2>
        <button type="button" class="p-1 rounded hover:bg-accent" aria-label="Close" @click="emit('close')"><X class="h-4 w-4" /></button>
      </div>
      <div class="flex-1 min-h-0 grid" :class="withRow ? '[grid-template-columns:minmax(240px,320px)_minmax(0,1fr)] max-[760px]:grid-cols-1' : 'grid-cols-1'">
        <div class="min-h-0 overflow-hidden border-r border-border flex flex-col">
          <DEBrowser :stack="stack" :selected-ids="de ? [de.id] : []" hide-data-views :sendable-only="sendableOnly" selected-label="selected" class="flex-1 min-h-0" @select-de="chooseDE" />
          <div v-if="!withRow && (loading || error)" class="p-3 text-xs border-t border-border" :class="error ? 'text-red-700 dark:text-red-300' : 'text-muted-foreground'">
            <Loader2 v-if="loading" class="h-3 w-3 animate-spin inline" /> {{ error || 'Reading the data extension' }}
          </div>
        </div>
        <!-- min-w-0: a wide row table scrolls here instead of widening the dialog past its edge (live test, 2026-11-07). -->
        <div v-if="withRow" class="min-h-0 min-w-0 flex flex-col">
          <div v-if="!de" class="m-auto text-muted-foreground p-6 text-center">Pick a data extension on the left, then a row.</div>
          <template v-else>
            <div class="flex flex-wrap items-center gap-2 px-3 py-2 border-b border-border text-xs">
              <span class="font-semibold text-sm">{{ de.name }}</span>
              <span v-if="rows.length" class="text-muted-foreground">first {{ rows.length }} row(s); click one to use it</span>
              <Input v-if="rows.length" v-model="filter" class="h-8 rounded-full text-xs ml-auto max-w-[16rem]" placeholder="Filter rows" aria-label="Filter rows" />
            </div>
            <div v-if="loading" class="p-4 text-muted-foreground"><Loader2 class="h-4 w-4 animate-spin inline" /> Reading rows</div>
            <div v-else-if="error" class="p-4 text-red-700 dark:text-red-300">{{ error }}</div>
            <div v-else class="flex-1 min-h-0 overflow-auto">
              <table class="text-xs w-max min-w-full">
                <thead class="sticky top-0 bg-muted">
                  <tr><th v-for="c in columns" :key="c" class="text-left font-semibold px-2 py-1.5 whitespace-nowrap">{{ c }}</th></tr>
                </thead>
                <tbody>
                  <tr v-for="(r, i) in shownRows" :key="i" class="border-t border-border cursor-pointer hover:bg-primary/10" data-de-picker-row @click="pickRow(r)">
                    <td v-for="c in columns" :key="c" class="px-2 py-1.5 whitespace-nowrap max-w-[18rem] truncate">{{ r[c] }}</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </template>
        </div>
      </div>
      <div class="flex justify-end px-4 py-2 border-t border-border"><Button variant="outline" @click="emit('close')">Cancel</Button></div>
    </div>
  </div>
</template>
