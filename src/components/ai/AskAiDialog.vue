<script setup>
// Ask AI for a text answer (feedback #1029): explain a query, summarize an automation,
// a journey or a Where used result, suggest data extension field types. Chrome's
// built-in model on this computer (composables/useAi.js). The caller builds the
// prompt (masked, size-limited: utils/aiAssist.js); the user sees it before asking.
// `#answer` gets { text } for extra actions (Create DE's Apply).
import { computed, ref, watch } from 'vue'
import { DialogRoot, DialogPortal, DialogOverlay, DialogContent, DialogTitle } from 'radix-vue'
import { X, Loader2, Sparkles, Download, Square, Copy, ChevronDown, ChevronRight } from 'lucide-vue-next'
import Button from '@/components/ui/button/Button.vue'
import CodeView from '@/components/results/CodeView.vue'
import ReportErrorButton from '@/components/results/ReportErrorButton.vue'
import { AVAILABILITY_TEXT } from '@/utils/aiAssist.js'
import { useAiRun } from '@/composables/useAi.js'
import { showToast } from '@/composables/useToast.js'

const props = defineProps({
  open: { type: Boolean, default: false },
  title: { type: String, default: 'Ask AI' },
  system: { type: String, required: true },
  // The user message, or a function of the optional extra question.
  prompt: { type: [String, Function], required: true },
  // Ask at once when the model is ready (Explain, Summarize).
  autoAsk: { type: Boolean, default: true },
  // An extra box: "Anything else?" appended to the prompt.
  extraLabel: { type: String, default: '' },
  extraPlaceholder: { type: String, default: '' },
})
const emit = defineEmits(['close'])

const run = useAiRun()
const { availability, download, state, error } = run
const extra = ref('')
const answer = ref('')
const showPrompt = ref(false)

const promptText = computed(() => (typeof props.prompt === 'function' ? props.prompt(extra.value) : props.prompt))

async function ask() {
  answer.value = ''
  const raw = await run.ask(props.system, promptText.value)
  if (raw != null) answer.value = raw.trim()
}

watch(() => props.open, async (on) => {
  if (!on) { run.stop(); return }
  extra.value = ''
  answer.value = ''
  showPrompt.value = false
  run.reset()
  await run.check()
  if (props.autoAsk && availability.value === 'available') ask()
}, { immediate: true })

async function copy() {
  try { await navigator.clipboard.writeText(answer.value); showToast('Copied.') } catch { showToast('Could not copy.') }
}
</script>

<template>
  <DialogRoot :open="open">
    <DialogPortal>
      <DialogOverlay class="fixed inset-0 z-9999 bg-black/45" @click="emit('close')" />
      <DialogContent class="fixed left-1/2 top-1/2 z-9999 -translate-x-1/2 -translate-y-1/2 w-[760px] max-w-[95vw] max-h-[88vh] rounded-xl bg-card border border-border shadow-2xl overflow-hidden flex flex-col text-xs focus:outline-none" @click.stop @escape-key-down="emit('close')">
        <div class="flex items-center gap-2 px-4 py-3 border-b border-border shrink-0">
          <Sparkles class="h-4 w-4 text-primary" />
          <DialogTitle class="text-sm font-bold">{{ title }}</DialogTitle>
          <span class="rounded bg-amber-200 text-amber-900 px-1.5 py-0.5 text-[10px] font-medium">Experimental</span>
          <span class="text-muted-foreground">Gemini Nano in Chrome, on this computer</span>
          <Button variant="ghost" size="icon" class="h-6 w-6 ml-auto" title="Close" @click="emit('close')"><X class="h-3.5 w-3.5" /></Button>
        </div>

        <div class="flex-1 overflow-y-auto p-4 space-y-3">
          <p class="rounded-md border border-sky-200 bg-sky-50 dark:border-sky-900 dark:bg-sky-950/40 p-2">
            The model runs in Chrome on this computer: nothing is sent over the network. It gets names, settings and SQL only, never data rows; email addresses, phone numbers and record IDs are replaced first. Answers can be wrong: check them. Turn AI off in Settings > Experimental.
          </p>
          <p v-if="availability && availability !== 'available'" class="text-muted-foreground">{{ AVAILABILITY_TEXT[availability] || availability }}</p>

          <label v-if="extraLabel" class="block">
            <span class="font-medium">{{ extraLabel }}</span> <span class="text-muted-foreground">(optional)</span>
            <input v-model="extra" class="mt-1 w-full h-8 rounded-md border border-border bg-background px-2" :placeholder="extraPlaceholder" @keydown.enter="run.canAsk.value && ask()" />
          </label>

          <div>
            <button class="inline-flex items-center gap-1 text-primary hover:underline" :aria-expanded="showPrompt" @click="showPrompt = !showPrompt">
              <ChevronDown v-if="showPrompt" class="h-3 w-3" /><ChevronRight v-else class="h-3 w-3" /> What the model gets
            </button>
            <div v-if="showPrompt" class="mt-1 space-y-1">
              <div class="text-muted-foreground">Instructions</div>
              <CodeView :code="system" lang="text" max-height="140px" />
              <div class="text-muted-foreground">Request</div>
              <CodeView :code="promptText" lang="text" max-height="240px" />
            </div>
          </div>

          <div class="flex items-center gap-2">
            <Button size="sm" class="h-8 text-xs" :disabled="!run.canAsk.value" @click="ask">
              <Loader2 v-if="state === 'asking'" class="h-3.5 w-3.5 mr-1 animate-spin" />
              <Download v-else-if="availability === 'downloadable'" class="h-3.5 w-3.5 mr-1" />
              <Sparkles v-else class="h-3.5 w-3.5 mr-1" />
              {{ availability === 'downloadable' ? 'Download the model and ask' : answer ? 'Ask again' : 'Ask' }}
            </Button>
            <Button v-if="state === 'asking'" variant="outline" size="sm" class="h-8 text-xs" @click="run.stop()"><Square class="h-3 w-3 mr-1" /> Stop</Button>
            <span v-if="download != null" class="text-muted-foreground">Downloading the model: {{ Math.round(download * 100) }}%</span>
            <span v-else-if="state === 'asking'" class="text-muted-foreground">Thinking. The first answer can take a while.</span>
          </div>
          <p v-if="error" class="text-red-600" role="alert">{{ error }}<ReportErrorButton /></p>

          <template v-if="answer">
            <div class="rounded-md border border-border bg-muted/30 p-3 whitespace-pre-line text-[13px] leading-relaxed" data-ai-answer>{{ answer }}</div>
            <div class="flex flex-wrap gap-2">
              <slot name="answer" :text="answer" />
              <Button variant="outline" size="sm" class="h-8 text-xs" @click="copy"><Copy class="h-3.5 w-3.5 mr-1" /> Copy</Button>
            </div>
          </template>
        </div>
      </DialogContent>
    </DialogPortal>
  </DialogRoot>
</template>
