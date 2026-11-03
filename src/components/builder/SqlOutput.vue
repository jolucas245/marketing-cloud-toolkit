<script setup>
import { useRouter } from 'vue-router'
import { ref, watch, computed } from 'vue'
import QueryEditor from '../detail/QueryEditor.vue'
import { buildSqlFromSelections } from '../../utils/sqlBuilder.js'
import HelpTip from '@/components/ui/HelpTip.vue'
import { BUILDER_HELP } from '@/data/builderHelp.js'
import { Copy, Check, Play, Code2, Save, Wand2, ChevronUp, ChevronDown, Maximize2, Minimize2 } from 'lucide-vue-next'

const router = useRouter()
const props = defineProps({
  sql: { type: String, default: '' },
  selectedDEs: { type: Array, default: () => [] },
  joins: { type: Array, default: () => [] },
  where: { type: Object, default: () => ({ combinator: 'AND', conditions: [] }) },
  queryOptions: { type: Object, default: () => ({}) },
  layout: { type: Object, default: () => ({}) },
  // UNION / EXCEPT / INTERSECT: the other SELECTs, before and after this one (with their operators).
  sqlBefore: { type: String, default: '' },
  sqlAfter: { type: String, default: '' },
  visualMode: { type: Boolean, default: false },
  recordId: { type: String, default: null },
  // 'collapsed' (a bar), 'open' or 'max' (feedback #150); the builder keeps it.
  state: { type: String, default: 'open' },
})

const emit = defineEmits(['update:sql', 'save', 'apply-sql', 'state'])

const localSql = ref(props.sql)
// The SQL the builder last generated; when the editor differs, the user edited it
// and can draw their version (Apply to builder).
const generated = ref('')
const edited = computed(() => localSql.value.trim() !== generated.value.trim())
const copied = ref(false)
const lineCount = computed(() => (localSql.value ? localSql.value.split('\n').length : 0))

// List and Visual draw the same model, so one generator serves both.
watch(() => [props.selectedDEs, props.joins, props.where, props.queryOptions, props.sqlBefore, props.sqlAfter], () => {
  const own = buildSqlFromSelections(props.selectedDEs, props.joins, props.where, props.queryOptions)
  localSql.value = [props.sqlBefore, own, props.sqlAfter].filter((x) => x && x.trim()).join('\n')
  generated.value = localSql.value
  emit('update:sql', localSql.value)
}, { deep: true, immediate: true })

function onEdit(v) {
  localSql.value = v
  emit('update:sql', v)
}

async function copySql() {
  await navigator.clipboard.writeText(localSql.value)
  copied.value = true
  setTimeout(() => { copied.value = false }, 1500)
}

// Save goes through the builder, which knows every SELECT of a UNION.
function saveToQuerySaver() {
  emit('save')
}

function openInWorkspace() {
  router.push({ path: '/queries/workspace', query: { sql: localSql.value } })
}
</script>

<template>
  <div class="sql-output flex flex-col h-full bg-card">
    <div class="px-4 py-2.5 flex flex-wrap items-center gap-2 shrink-0" :class="state === 'collapsed' ? '' : 'border-b border-border'">
      <button class="flex items-center gap-2 text-[13px] font-bold tracking-wide uppercase text-foreground hover:text-primary"
        :aria-expanded="state !== 'collapsed'" :title="state === 'collapsed' ? 'Show the SQL' : 'Minimize'"
        @click="emit('state', state === 'collapsed' ? 'open' : 'collapsed')">
        <Code2 class="h-4 w-4 text-muted-foreground" /> Generated SQL
        <span class="normal-case tracking-normal font-medium text-muted-foreground">{{ lineCount }} line{{ lineCount === 1 ? '' : 's' }}</span>
        <ChevronUp v-if="state === 'collapsed'" class="h-4 w-4 text-muted-foreground" /><ChevronDown v-else class="h-4 w-4 text-muted-foreground" />
      </button>
      <HelpTip topic="sql" :topics="BUILDER_HELP" />
      <div class="flex flex-wrap items-center gap-2 ml-auto">
        <button v-if="edited" class="qb-pill qb-pill-soft" title="Redraw the builder from this SQL (your edits otherwise vanish on the next change)" @click="emit('apply-sql', localSql)">
          <Wand2 class="h-4 w-4" /> Apply to builder
        </button>
        <button class="qb-pill" @click="copySql">
          <Check v-if="copied" class="h-4 w-4 text-primary" /><Copy v-else class="h-4 w-4" />{{ copied ? 'Copied' : 'Copy' }}
        </button>
        <button class="qb-pill" title="Save to Saved queries" @click="saveToQuerySaver">
          <Save class="h-4 w-4" /> Save
        </button>
        <button class="qb-pill qb-pill-primary" :disabled="!localSql.trim()" title="Open this SQL in Run Query" @click="openInWorkspace">
          <Play class="h-4 w-4" /> Run query
        </button>
        <button class="h-[34px] w-[34px] inline-flex items-center justify-center rounded-full text-muted-foreground hover:bg-accent hover:text-foreground"
          :title="state === 'max' ? 'Restore' : 'Maximize'" :aria-label="state === 'max' ? 'Restore' : 'Maximize'"
          @click="emit('state', state === 'max' ? 'open' : 'max')">
          <Minimize2 v-if="state === 'max'" class="h-4 w-4" /><Maximize2 v-else class="h-4 w-4" />
        </button>
      </div>
    </div>
    <div v-show="state !== 'collapsed'" class="flex-1 min-h-0 overflow-hidden">
      <QueryEditor :modelValue="localSql" @update:modelValue="onEdit" />
    </div>
  </div>
</template>

<style scoped>
.qb-pill {
  display: inline-flex; align-items: center; gap: 7px; height: 34px; padding: 0 14px;
  border: 1px solid hsl(var(--border)); border-radius: 9999px; background: hsl(var(--card));
  color: hsl(var(--foreground)); font-size: 13px; font-weight: 500; white-space: nowrap;
}
.qb-pill:hover:not(:disabled) { background: hsl(var(--accent)); }
.qb-pill:disabled { opacity: 0.5; }
.qb-pill-primary { border-color: hsl(var(--primary)); background: hsl(var(--primary)); color: hsl(var(--primary-foreground)); font-weight: 600; }
.qb-pill-primary:hover:not(:disabled) { background: hsl(var(--primary) / 0.9); }
.qb-pill-soft { border-color: hsl(var(--primary)); background: hsl(var(--primary) / 0.1); color: hsl(var(--primary)); font-weight: 600; }
.qb-pill-soft:hover:not(:disabled) { background: hsl(var(--primary) / 0.15); }
</style>
