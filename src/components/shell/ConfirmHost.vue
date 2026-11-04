<script setup>
// The in-app confirm dialog (composables/useConfirm.js, feedback #1050).
import { nextTick, onUnmounted, ref, watch } from 'vue'
import { AlertTriangle } from 'lucide-vue-next'
import { confirmState, answerConfirm } from '@/composables/useConfirm.js'

const okBtn = ref(null)
watch(confirmState, async (s) => { if (s) { await nextTick(); okBtn.value?.focus() } })
function onKey(e) { if (confirmState.value && e.key === 'Escape') { e.preventDefault(); answerConfirm(false) } }
window.addEventListener('keydown', onKey)
onUnmounted(() => window.removeEventListener('keydown', onKey))
</script>

<template>
  <div v-if="confirmState" class="fixed inset-0 z-220 flex items-center justify-center bg-black/50 p-4" data-confirm-dialog @mousedown.self="answerConfirm(false)">
    <div class="w-full max-w-md rounded-xl border border-border bg-card shadow-2xl" role="alertdialog" aria-modal="true" aria-labelledby="confirm-title" aria-describedby="confirm-message">
      <div class="flex items-start gap-3 px-5 pt-5">
        <span v-if="confirmState.danger" class="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-red-100 text-red-700 dark:bg-red-950/50 dark:text-red-300"><AlertTriangle class="h-4 w-4" /></span>
        <div class="min-w-0 flex-1">
          <h2 id="confirm-title" class="text-base font-semibold">{{ confirmState.title }}</h2>
          <p id="confirm-message" class="mt-1.5 text-sm text-muted-foreground whitespace-pre-line">{{ confirmState.message }}</p>
          <p v-if="confirmState.note" class="mt-2 rounded-md border border-amber-300 bg-amber-50 dark:border-amber-800 dark:bg-amber-950/40 p-2 text-xs text-amber-900 dark:text-amber-200">{{ confirmState.note }}</p>
        </div>
      </div>
      <div class="flex justify-end gap-2 px-5 py-4">
        <button type="button" class="h-9 px-4 rounded-md border border-border text-sm hover:bg-accent" data-confirm-cancel @click="answerConfirm(false)">{{ confirmState.cancelLabel }}</button>
        <button ref="okBtn" type="button" class="h-9 px-4 rounded-md text-sm font-medium text-white"
          :class="confirmState.danger ? 'bg-red-600 hover:bg-red-700' : 'bg-primary hover:opacity-90'" data-confirm-ok @click="answerConfirm(true)">{{ confirmState.confirmLabel }}</button>
      </div>
    </div>
  </div>
</template>
