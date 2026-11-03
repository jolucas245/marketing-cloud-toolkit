<script setup>
// AI Assist (feedback #1028): write a query from a description, or fix the one in the
// panel, with Chrome's built-in model (utils/aiAssist.js). The model runs on this
// computer. The user sees the whole prompt before it runs; query results are never in
// it. The answer is shown as a diff against the panel's SQL, applied only on Apply.
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import { DialogRoot, DialogPortal, DialogOverlay, DialogContent, DialogTitle } from 'radix-vue'
import { X, Loader2, Sparkles, Download, Square, Copy, Plus, ChevronDown, ChevronRight, EyeOff } from 'lucide-vue-next'
import Button from '@/components/ui/button/Button.vue'
import CodeView from '@/components/results/CodeView.vue'
import DiffView from '@/components/results/DiffView.vue'
import ReportErrorButton from '@/components/results/ReportErrorButton.vue'
import { buildAiPrompt, readAiAnswer, AI_SYSTEM, AVAILABILITY_TEXT, MAX_TABLES } from '@/utils/aiAssist.js'
import { useAiRun } from '@/composables/useAi.js'
import { DATA_VIEWS } from '@/utils/dataViews.js'
import { bareTableName } from '@/utils/schemaCatalog.js'
import { showToast } from '@/composables/useToast.js'
import { aiBackgroundStatus } from '@/composables/aiBackground.js'

const props = defineProps({
  open: { type: Boolean, default: false },
  sql: { type: String, default: '' },
  editor: { type: Object, default: null }, // QueryEditor's exposed methods
  // Problems from the last validation or run, as text.
  runProblems: { type: Array, default: () => [] },
  initialMode: { type: String, default: 'write' },
  // Home's "Describe the query you need" (feedback #1029).
  initialRequest: { type: String, default: '' },
  autoAsk: { type: Boolean, default: false },
  // Query Builder: the answer is drawn on the diagram.
  applyLabel: { type: String, default: 'Apply to this panel' },
  applyTitle: { type: String, default: 'Replace the panel\'s SQL (the old text is kept under Earlier text, and Ctrl+Z works in the editor)' },
  // Feedback #1032: closing while the model thinks only hides the dialog; the request
  // goes on and `status` tells the parent where it is. Off: closing stops the request.
  canBackground: { type: Boolean, default: false },
})
const emit = defineEmits(['close', 'apply', 'new-panel', 'status'])

const mode = ref('write')
const request = ref('')
const problems = ref('')
const tables = ref([]) // [{ name, kind, fields }]
const addName = ref('')
const addBusy = ref(false)
const answer = ref(null) // { sql, note, raw }
const showPrompt = ref(false)
const run = useAiRun()
const { availability, download, state, error } = run

const isDataView = (name) => DATA_VIEWS.has(bareTableName(name)) || /^_/.test(bareTableName(name))
async function addTable(name) {
  const clean = String(name || '').trim()
  if (!clean || tables.value.some((t) => t.name.toLowerCase() === clean.toLowerCase()) || tables.value.length >= MAX_TABLES) return
  const fields = (await props.editor?.fieldsOf?.(clean)?.catch?.(() => [])) || []
  tables.value = [...tables.value, { name: clean, kind: isDataView(clean) ? 'data view' : 'data extension', fields: Array.isArray(fields) ? fields : [] }]
}
async function addFromInput() {
  addBusy.value = true
  try { await addTable(addName.value); addName.value = '' } finally { addBusy.value = false }
}
function removeTable(t) { tables.value = tables.value.filter((x) => x !== t) }

// Hidden while the model was thinking (Keep working, X, Esc or a click outside).
const background = ref(false)
const status = computed(() => aiBackgroundStatus({ open: props.open, background: background.value, state: state.value }))
watch(status, (s) => emit('status', s), { immediate: true })
onBeforeUnmount(() => run.stop())

watch(() => props.open, async (on) => {
  if (!on) {
    if (props.canBackground && state.value === 'asking') background.value = true
    else { background.value = false; run.stop() }
    return
  }
  // Reopened after Keep working: show that request (still running, its answer or its error).
  if (background.value) { background.value = false; return }
  mode.value = props.initialMode === 'write' && props.initialRequest ? 'write'
    : props.initialMode === 'fix' || (props.runProblems.length && props.sql.trim()) ? 'fix' : 'write'
  request.value = props.initialRequest || ''
  answer.value = null
  run.reset()
  showPrompt.value = false
  problems.value = [...props.runProblems, ...(props.editor?.problems?.() || [])].filter(Boolean).join('\n')
  tables.value = []
  for (const name of props.editor?.tablesInQuery?.() || []) await addTable(name)
  await run.check()
  // From Home: ask straight away when the model is ready.
  if (props.initialRequest && props.autoAsk && props.open && availability.value === 'available') ask()
}, { immediate: true })

const prompt = computed(() => buildAiPrompt({
  mode: mode.value, request: request.value, sql: props.sql, tables: tables.value,
  problems: problems.value.split('\n'),
}))
const canAsk = computed(() => run.canAsk.value && (mode.value === 'fix' ? !!props.sql.trim() : !!request.value.trim()))

async function ask() {
  answer.value = null
  const raw = await run.ask(AI_SYSTEM, prompt.value)
  if (raw != null) answer.value = { ...readAiAnswer(raw), raw }
}
function stop() { run.stop() }
async function copy() {
  try { await navigator.clipboard.writeText(answer.value.sql); showToast('SQL copied.') } catch { showToast('Could not copy.') }
}
</script>

<template>
  <DialogRoot :open="open">
    <DialogPortal>
      <DialogOverlay class="fixed inset-0 z-9999 bg-black/45" @click="emit('close')" />
      <DialogContent class="fixed left-1/2 top-1/2 z-9999 -translate-x-1/2 -translate-y-1/2 w-[860px] max-w-[95vw] max-h-[90vh] rounded-xl bg-card border border-border shadow-2xl overflow-hidden flex flex-col text-xs focus:outline-none" @click.stop @escape-key-down="emit('close')">
        <div class="flex items-center gap-2 px-4 py-3 border-b border-border shrink-0">
          <Sparkles class="h-4 w-4 text-primary" />
          <DialogTitle class="text-sm font-bold">AI Assist</DialogTitle>
          <span class="rounded bg-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">Beta</span>
          <span class="text-muted-foreground">Gemini Nano in Chrome, on this computer</span>
          <Button variant="ghost" size="icon" class="h-6 w-6 ml-auto" title="Close" @click="emit('close')"><X class="h-3.5 w-3.5" /></Button>
        </div>

        <div class="flex-1 overflow-y-auto p-4 space-y-3">
          <p class="rounded-md border border-sky-200 bg-sky-50 dark:border-sky-900 dark:bg-sky-950/40 p-2">
            The model runs in Chrome on this computer: nothing is sent over the network, and query results are never part of the prompt. It sees only what is shown under "What the model gets": email addresses, phone numbers and record IDs in the SQL are replaced first. Check its SQL before you run it. Experimental: turn it off in Settings.
          </p>
          <p v-if="availability && availability !== 'available'" class="text-muted-foreground">{{ AVAILABILITY_TEXT[availability] || availability }}</p>

          <div class="flex gap-1" role="tablist">
            <button v-for="m in [['write', 'Write a query'], ['fix', 'Fix this query']]" :key="m[0]" role="tab" :aria-selected="mode === m[0]"
              class="px-3 py-1 rounded-md" :class="mode === m[0] ? 'bg-primary text-primary-foreground' : 'hover:bg-accent'" @click="mode = m[0]">{{ m[1] }}</button>
          </div>

          <label v-if="mode === 'write'" class="block">
            <span class="font-medium">What should the query return?</span>
            <textarea v-model="request" rows="3" class="mt-1 w-full rounded-md border border-border bg-background p-2" placeholder="For example: subscribers who opened an email in the last 30 days but never clicked, with their email address" />
          </label>
          <template v-else>
            <label class="block">
              <span class="font-medium">Problems to fix</span> <span class="text-muted-foreground">(from the last check or run and the SQL checks; edit as you like)</span>
              <textarea v-model="problems" rows="3" class="mt-1 w-full rounded-md border border-border bg-background p-2 font-mono text-[11px]" />
            </label>
            <label class="block">
              <span class="font-medium">Anything else?</span> <span class="text-muted-foreground">(optional)</span>
              <input v-model="request" class="mt-1 w-full h-8 rounded-md border border-border bg-background px-2" placeholder="For example: also return the send date" />
            </label>
            <p v-if="!sql.trim()" class="text-amber-700 dark:text-amber-300">The panel has no SQL to fix.</p>
          </template>

          <div>
            <div class="font-medium mb-1">Tables the model may use <span class="font-normal text-muted-foreground">(names and fields only; up to {{ MAX_TABLES }})</span></div>
            <div class="flex flex-wrap items-center gap-1.5">
              <span v-for="t in tables" :key="t.name" class="inline-flex items-center gap-1 rounded border border-border px-1.5 py-0.5">
                {{ t.name }} <span class="text-muted-foreground">{{ t.fields.length ? `${t.fields.length} fields` : 'fields unknown' }}</span>
                <button class="text-muted-foreground hover:text-foreground" :title="`Leave ${t.name} out`" @click="removeTable(t)"><X class="h-3 w-3" /></button>
              </span>
              <form class="inline-flex items-center gap-1" @submit.prevent="addFromInput">
                <input v-model="addName" class="h-7 w-48 rounded-md border border-border bg-background px-2" placeholder="Add a data extension or _Sent" aria-label="Add a table" />
                <Button type="submit" variant="outline" size="sm" class="h-7 text-xs" :disabled="!addName.trim() || addBusy || tables.length >= MAX_TABLES"><Loader2 v-if="addBusy" class="h-3 w-3 animate-spin" /><Plus v-else class="h-3 w-3" /></Button>
              </form>
            </div>
          </div>

          <div>
            <button class="inline-flex items-center gap-1 text-primary hover:underline" :aria-expanded="showPrompt" @click="showPrompt = !showPrompt">
              <ChevronDown v-if="showPrompt" class="h-3 w-3" /><ChevronRight v-else class="h-3 w-3" /> What the model gets
            </button>
            <div v-if="showPrompt" class="mt-1 space-y-1">
              <div class="text-muted-foreground">Instructions</div>
              <CodeView :code="AI_SYSTEM" lang="text" max-height="160px" />
              <div class="text-muted-foreground">Request</div>
              <CodeView :code="prompt" lang="text" max-height="240px" />
            </div>
          </div>

          <div class="flex items-center gap-2">
            <Button size="sm" class="h-8 text-xs" :disabled="!canAsk" @click="ask">
              <Loader2 v-if="state === 'asking'" class="h-3.5 w-3.5 mr-1 animate-spin" />
              <Download v-else-if="availability === 'downloadable'" class="h-3.5 w-3.5 mr-1" />
              <Sparkles v-else class="h-3.5 w-3.5 mr-1" />
              {{ availability === 'downloadable' ? 'Download the model and ask' : mode === 'fix' ? 'Fix it' : 'Write it' }}
            </Button>
            <Button v-if="state === 'asking'" variant="outline" size="sm" class="h-8 text-xs" @click="stop"><Square class="h-3 w-3 mr-1" /> Stop</Button>
            <Button v-if="state === 'asking' && canBackground" variant="outline" size="sm" class="h-8 text-xs" title="Hide this and keep working: the panel shows when the answer is ready" data-ai-keep-working @click="emit('close')"><EyeOff class="h-3 w-3 mr-1" /> Keep working</Button>
            <span v-if="download != null" class="text-muted-foreground">Downloading the model: {{ Math.round(download * 100) }}%</span>
            <span v-else-if="state === 'asking'" class="text-muted-foreground">Thinking. The first answer can take a while.<template v-if="canBackground"> You can keep working: closing this does not stop it.</template></span>
          </div>
          <p v-if="error" class="text-red-600" role="alert">{{ error }}<ReportErrorButton /></p>

          <template v-if="answer">
            <p v-if="answer.note" class="whitespace-pre-line">{{ answer.note }}</p>
            <p v-if="!answer.sql" class="text-amber-700 dark:text-amber-300">The answer has no SQL. Try rewording the request.</p>
            <template v-else>
              <template v-if="sql.trim()">
                <div class="text-muted-foreground">Left: the current SQL. Right: the suggestion.</div>
                <DiffView :left="sql" :right="answer.sql" />
              </template>
              <CodeView v-else :code="answer.sql" max-height="320px" data-ai-sql />
              <div class="flex flex-wrap gap-2">
                <Button size="sm" class="h-8 text-xs" :title="applyTitle" @click="emit('apply', answer.sql)">{{ applyLabel }}</Button>
                <Button variant="outline" size="sm" class="h-8 text-xs" @click="emit('new-panel', answer.sql)">Open in a new panel</Button>
                <Button variant="outline" size="sm" class="h-8 text-xs" @click="copy"><Copy class="h-3.5 w-3.5 mr-1" /> Copy</Button>
              </div>
            </template>
          </template>
        </div>
      </DialogContent>
    </DialogPortal>
  </DialogRoot>
</template>
