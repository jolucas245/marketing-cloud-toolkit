<script setup>
// Messages at the top of the page (feedback #1050, replaces the toast): errors stay
// until closed and can be copied or reported; other messages close by themselves.
import { useRoute } from 'vue-router'
import { CheckCircle2, AlertCircle, Info, X, Copy, MessageSquareWarning } from 'lucide-vue-next'
import { messages, dismissMessage } from '@/composables/useToast.js'
import { reportError } from '@/composables/useReportError.js'

const route = useRoute()
const STYLE = {
  error: 'border-red-300 bg-red-50 text-red-900 dark:border-red-900 dark:bg-red-950/50 dark:text-red-200',
  success: 'border-emerald-300 bg-emerald-50 text-emerald-900 dark:border-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-200',
  info: 'border-sky-200 bg-sky-50 text-sky-900 dark:border-sky-900 dark:bg-sky-950/40 dark:text-sky-200',
}
async function copy(m) { try { await navigator.clipboard.writeText(m.message) } catch { /* ignore */ } }
</script>

<template>
  <div v-if="messages.length" class="shrink-0 space-y-1.5 px-4 pt-2 empty:hidden" aria-live="polite" data-message-bar>
    <div v-for="m in messages.filter((x) => !x.overDialog)" :key="m.id" :role="m.kind === 'error' ? 'alert' : 'status'" :data-kind="m.kind"
      class="flex items-start gap-2 rounded-lg border px-3 py-2 text-sm" :class="STYLE[m.kind]">
      <AlertCircle v-if="m.kind === 'error'" class="h-4 w-4 shrink-0 mt-0.5" />
      <CheckCircle2 v-else-if="m.kind === 'success'" class="h-4 w-4 shrink-0 mt-0.5" />
      <Info v-else class="h-4 w-4 shrink-0 mt-0.5" />
      <span class="flex-1 min-w-0 break-words whitespace-pre-line">{{ m.message }}</span>
      <template v-if="m.kind === 'error'">
        <button type="button" class="shrink-0 inline-flex items-center gap-1 text-xs underline-offset-2 hover:underline" title="Copy the message" @click="copy(m)"><Copy class="h-3 w-3" /> Copy</button>
        <button type="button" class="shrink-0 inline-flex items-center gap-1 text-xs underline-offset-2 hover:underline" title="Send this error to the developer" @click="reportError(m.message, { page: route.path })"><MessageSquareWarning class="h-3 w-3" /> Report</button>
      </template>
      <button type="button" class="shrink-0 p-0.5 rounded hover:bg-black/5 dark:hover:bg-white/10" title="Close" aria-label="Close message" @click="dismissMessage(m.id)"><X class="h-3.5 w-3.5" /></button>
    </div>
  </div>
  <div v-if="messages.some((x) => x.overDialog)" class="fixed top-3 left-1/2 -translate-x-1/2 z-250 w-[min(42rem,92vw)] space-y-1.5" aria-live="polite">
    <div v-for="m in messages.filter((x) => x.overDialog)" :key="m.id" :role="m.kind === 'error' ? 'alert' : 'status'" :data-kind="m.kind"
      class="flex items-start gap-2 rounded-lg border px-3 py-2 text-sm shadow-lg" :class="STYLE[m.kind]">
      <AlertCircle v-if="m.kind === 'error'" class="h-4 w-4 shrink-0 mt-0.5" />
      <CheckCircle2 v-else-if="m.kind === 'success'" class="h-4 w-4 shrink-0 mt-0.5" />
      <Info v-else class="h-4 w-4 shrink-0 mt-0.5" />
      <span class="flex-1 min-w-0 break-words whitespace-pre-line">{{ m.message }}</span>
      <button v-if="m.kind === 'error'" type="button" class="shrink-0 inline-flex items-center gap-1 text-xs hover:underline" title="Copy the message" @click="copy(m)"><Copy class="h-3 w-3" /> Copy</button>
      <button type="button" class="shrink-0 p-0.5 rounded hover:bg-black/5 dark:hover:bg-white/10" title="Close" aria-label="Close message" @click="dismissMessage(m.id)"><X class="h-3.5 w-3.5" /></button>
    </div>
  </div>
</template>
