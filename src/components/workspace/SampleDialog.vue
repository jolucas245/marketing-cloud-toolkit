<script setup>
// Sample (feedback #1028): the first 10 rows of every table the query reads, without
// running the query. Data extensions are read straight from SFMC (the rowset call
// Preview data uses; no query activity, no results DE). Data views cannot be read that
// way, so they get "Run TOP 10 in a new panel".
import { ref, watch } from 'vue'
import { DialogRoot, DialogPortal, DialogOverlay, DialogContent, DialogTitle } from 'radix-vue'
import { X, Loader2, Play, Rows3 } from 'lucide-vue-next'
import Button from '@/components/ui/button/Button.vue'
import ReportErrorButton from '@/components/results/ReportErrorButton.vue'
import { fetchDEMetadata, fetchDERows } from '@/utils/sfmcApi.js'
import { rowsFrom, columnsFor } from '@/utils/deRows.js'
import { DATA_VIEWS } from '@/utils/dataViews.js'
import { bareTableName } from '@/utils/schemaCatalog.js'

const SAMPLE_ROWS = 10

const props = defineProps({
  open: { type: Boolean, default: false },
  stack: { type: String, default: null },
  editor: { type: Object, default: null },
})
const emit = defineEmits(['close', 'new-panel'])

const tables = ref([]) // [{ name, kind, status, rows, columns, error }]
const isDataView = (name) => DATA_VIEWS.has(bareTableName(name)) || /^_/.test(bareTableName(name))
const topSql = (name) => `SELECT TOP ${SAMPLE_ROWS} *\nFROM ${/^[\w.]+$/.test(name) ? name : `[${bareTableName(name)}]`}`

async function load(t) {
  t.status = 'loading'
  try {
    const name = bareTableName(t.name)
    const meta = await fetchDEMetadata(props.stack, name)
    if (!meta?.key) throw new Error('SFMC did not give this data extension\'s external key, so its rows cannot be read directly.')
    const fields = ((await props.editor?.fieldsOf?.(t.name)?.catch?.(() => [])) || []).map((f) => f.name)
    const d = await fetchDERows(props.stack, meta.key, 1, SAMPLE_ROWS)
    t.rows = rowsFrom(d?.items || [], fields).slice(0, SAMPLE_ROWS)
    t.columns = columnsFor(fields, t.rows)
    t.total = Number.isFinite(Number(d?.count)) ? Number(d.count) : null
    t.status = 'ok'
  } catch (e) {
    t.status = 'error'
    t.error = e?.message || String(e)
  }
  tables.value = [...tables.value]
}

watch(() => props.open, (on) => {
  if (!on) return
  const names = props.editor?.tablesInQuery?.() || []
  tables.value = names.map((name) => ({ name, kind: isDataView(name) ? 'data view' : 'data extension', status: 'idle', rows: [], columns: [], error: '' }))
  for (const t of tables.value) if (t.kind === 'data extension') load(t)
})
</script>

<template>
  <DialogRoot :open="open">
    <DialogPortal>
      <DialogOverlay class="fixed inset-0 z-9999 bg-black/45" @click="emit('close')" />
      <DialogContent class="fixed left-1/2 top-1/2 z-9999 -translate-x-1/2 -translate-y-1/2 w-[960px] max-w-[95vw] max-h-[88vh] rounded-xl bg-card border border-border shadow-2xl overflow-hidden flex flex-col text-xs focus:outline-none" @click.stop @escape-key-down="emit('close')">
        <div class="flex items-center gap-2 px-4 py-3 border-b border-border shrink-0">
          <Rows3 class="h-4 w-4 text-primary" />
          <DialogTitle class="text-sm font-bold">Sample: the first {{ SAMPLE_ROWS }} rows of each table</DialogTitle>
          <span class="text-muted-foreground">without running the query</span>
          <Button variant="ghost" size="icon" class="h-6 w-6 ml-auto" title="Close" @click="emit('close')"><X class="h-3.5 w-3.5" /></Button>
        </div>
        <div class="flex-1 overflow-y-auto p-4 space-y-4">
          <p v-if="!tables.length" class="text-muted-foreground">The query names no tables yet. Write a FROM or JOIN first.</p>
          <section v-for="t in tables" :key="t.name" class="space-y-1">
            <div class="flex items-center gap-2">
              <h3 class="font-semibold text-sm">{{ t.name }}</h3>
              <span class="text-muted-foreground">{{ t.kind }}<template v-if="t.total != null">, {{ t.total.toLocaleString() }} rows</template></span>
              <Button variant="outline" size="sm" class="h-6 text-[11px] ml-auto" :title="`Open SELECT TOP ${SAMPLE_ROWS} * FROM ${t.name} in a new panel, to run it there`" @click="emit('new-panel', topSql(t.name))"><Play class="h-3 w-3 mr-1" /> Run TOP {{ SAMPLE_ROWS }} in a new panel</Button>
            </div>
            <p v-if="t.kind === 'data view'" class="text-muted-foreground">Data views cannot be read directly; run TOP {{ SAMPLE_ROWS }} to see their rows.</p>
            <div v-else-if="t.status === 'loading'" class="flex items-center gap-1 text-muted-foreground"><Loader2 class="h-3 w-3 animate-spin" /> Reading rows...</div>
            <p v-else-if="t.status === 'error'" class="text-red-600">Could not read the rows: {{ t.error }}<ReportErrorButton /></p>
            <p v-else-if="t.status === 'ok' && !t.rows.length" class="text-muted-foreground">No rows.</p>
            <div v-else-if="t.status === 'ok'" class="overflow-x-auto rounded border border-border">
              <table class="text-[11px]">
                <thead><tr class="bg-muted/50 text-left"><th v-for="c in t.columns" :key="c" class="px-2 py-1 font-semibold whitespace-nowrap">{{ c }}</th></tr></thead>
                <tbody><tr v-for="(r, i) in t.rows" :key="i" class="border-t border-border/60"><td v-for="c in t.columns" :key="c" class="px-2 py-0.5 whitespace-nowrap max-w-[18rem] truncate" :title="String(r[c] ?? '')">{{ r[c] ?? '' }}</td></tr></tbody>
              </table>
            </div>
          </section>
        </div>
      </DialogContent>
    </DialogPortal>
  </DialogRoot>
</template>
