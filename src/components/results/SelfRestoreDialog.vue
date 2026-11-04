<script setup>
// "Restore by myself" (feedback #1045): the request that puts a version back, to send
// with your own API access. Nothing is sent from here.
import { computed } from 'vue'
import { DialogRoot, DialogPortal, DialogOverlay, DialogContent, DialogTitle, DialogDescription } from 'radix-vue'
import { X, Download, Copy, FileText } from 'lucide-vue-next'
import { selfRestoreSteps, curlFor, tokenCurl, bodyText, selfRestoreMarkdown } from '@/utils/selfRestore.js'
import { saveTextFile } from '@/utils/download.js'
import { showToast } from '@/composables/useToast.js'

const props = defineProps({
  open: { type: Boolean, default: false },
  request: { type: Object, default: null }, // from selfRestoreRequest()
  note: { type: String, default: '' },
})
const emit = defineEmits(['close'])
const steps = computed(() => (props.request ? selfRestoreSteps(props.request) : []))

async function copy(text, what) {
  try { await navigator.clipboard.writeText(text); showToast(`${what} copied.`) } catch { showToast('Could not copy.') }
}
const downloadBody = () => saveTextFile(bodyText(props.request), props.request.file, 'application/json', 'JSON')
const downloadGuide = () => saveTextFile(selfRestoreMarkdown(props.request), props.request.file.replace(/-body\.json$/, '-instructions.md'), 'text/markdown', 'Markdown')
</script>

<template>
  <DialogRoot :open="open && !!request">
    <DialogPortal>
      <DialogOverlay class="fixed inset-0 z-9999 bg-black/45" @click="emit('close')" />
      <DialogContent class="fixed left-1/2 top-1/2 z-9999 -translate-x-1/2 -translate-y-1/2 w-[760px] max-w-[95vw] max-h-[90vh] overflow-y-auto rounded-xl bg-card border border-border shadow-2xl p-5 text-sm space-y-3 focus:outline-none" data-self-restore @escape-key-down="emit('close')">
        <div class="flex items-start gap-2">
          <div class="flex-1">
            <DialogTitle class="text-base font-bold">Restore by myself</DialogTitle>
            <DialogDescription class="text-xs text-muted-foreground">{{ request.what }} "{{ request.name }}", {{ request.versionLabel }}. Nothing is sent from the Toolkit: you send the request with your own API access.</DialogDescription>
          </div>
          <button class="p-1 rounded hover:bg-accent" title="Close" @click="emit('close')"><X class="h-4 w-4" /></button>
        </div>
        <p v-if="note" class="text-xs rounded-md border border-amber-300 bg-amber-50 dark:border-amber-800 dark:bg-amber-950/40 p-2">{{ note }}</p>
        <ol class="list-decimal pl-5 space-y-1">
          <li v-for="(s, i) in steps" :key="i">{{ s }}</li>
        </ol>
        <div class="flex flex-wrap gap-2">
          <button class="inline-flex items-center gap-1 h-8 px-3 rounded-md bg-primary text-primary-foreground text-xs font-semibold" data-self-restore-body @click="downloadBody"><Download class="h-3.5 w-3.5" /> Download request body</button>
          <button class="inline-flex items-center gap-1 h-8 px-3 rounded-md border border-border text-xs hover:bg-accent" @click="downloadGuide"><FileText class="h-3.5 w-3.5" /> Download instructions</button>
          <button class="inline-flex items-center gap-1 h-8 px-3 rounded-md border border-border text-xs hover:bg-accent" @click="copy(bodyText(request), 'Body')"><Copy class="h-3.5 w-3.5" /> Copy body</button>
        </div>
        <div>
          <div class="text-xs font-medium mb-1">Get a token</div>
          <pre class="rounded-md bg-muted p-2 text-[11px] overflow-x-auto">{{ tokenCurl() }}</pre>
        </div>
        <div>
          <div class="flex items-center text-xs font-medium mb-1">Send the request <span class="ml-2 font-mono text-muted-foreground">{{ request.method }} {{ request.path }}</span>
            <button class="ml-auto inline-flex items-center gap-1 text-primary hover:underline font-normal" @click="copy(curlFor(request), 'Command')"><Copy class="h-3 w-3" /> Copy</button></div>
          <pre class="rounded-md bg-muted p-2 text-[11px] overflow-x-auto">{{ curlFor(request) }}</pre>
        </div>
        <p class="text-xs text-muted-foreground">Keep the client secret and the access token to yourself. The downloaded files hold neither.</p>
      </DialogContent>
    </DialogPortal>
  </DialogRoot>
</template>
