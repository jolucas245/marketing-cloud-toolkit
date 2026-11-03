<script setup>
// Earlier text (feedback #1028): this panel's SQL from the last 24 hours, kept before
// Clear, opening a query activity, AI Assist and Restore, and every few minutes while
// typing (utils/textSnapshots.js). Restore keeps the current text as a copy first.
import { ref, watch } from 'vue'
import { DialogRoot, DialogPortal, DialogOverlay, DialogContent, DialogTitle } from 'radix-vue'
import { X, ArchiveRestore } from 'lucide-vue-next'
import Button from '@/components/ui/button/Button.vue'
import DiffView from '@/components/results/DiffView.vue'
import { SNAPSHOT_REASONS } from '@/utils/textSnapshots.js'
import { formatDateTime } from '@/utils/format.js'

const props = defineProps({
  open: { type: Boolean, default: false },
  snapshots: { type: Array, default: () => [] },
  current: { type: String, default: '' },
})
const emit = defineEmits(['close', 'restore'])
const picked = ref(0)
watch(() => props.open, (on) => { if (on) picked.value = 0 })
</script>

<template>
  <DialogRoot :open="open">
    <DialogPortal>
      <DialogOverlay class="fixed inset-0 z-9999 bg-black/45" @click="emit('close')" />
      <DialogContent class="fixed left-1/2 top-1/2 z-9999 -translate-x-1/2 -translate-y-1/2 w-[920px] max-w-[95vw] max-h-[88vh] rounded-xl bg-card border border-border shadow-2xl overflow-hidden flex flex-col text-xs focus:outline-none" @click.stop @escape-key-down="emit('close')">
        <div class="flex items-center gap-2 px-4 py-3 border-b border-border shrink-0">
          <ArchiveRestore class="h-4 w-4 text-primary" />
          <DialogTitle class="text-sm font-bold">Earlier text</DialogTitle>
          <span class="text-muted-foreground">this panel's SQL from the last 24 hours, in this browser only</span>
          <Button variant="ghost" size="icon" class="h-6 w-6 ml-auto" title="Close" @click="emit('close')"><X class="h-3.5 w-3.5" /></Button>
        </div>
        <div v-if="!snapshots.length" class="p-4 text-muted-foreground">No earlier text yet. Copies are kept before Clear, opening a query activity, AI Assist and Restore, and every few minutes while you type.</div>
        <div v-else class="flex-1 min-h-0 flex">
          <ul class="w-60 shrink-0 overflow-y-auto border-r border-border p-2 space-y-1">
            <li v-for="(s, i) in snapshots" :key="s.at">
              <button class="w-full text-left rounded px-2 py-1" :class="picked === i ? 'bg-primary/10 text-primary' : 'hover:bg-accent'" @click="picked = i">
                <div class="font-medium">{{ formatDateTime(new Date(s.at).toISOString()) }}</div>
                <div class="text-muted-foreground">{{ SNAPSHOT_REASONS[s.reason] || s.reason }}</div>
              </button>
            </li>
          </ul>
          <div class="flex-1 min-w-0 overflow-y-auto p-3 space-y-2">
            <div class="text-muted-foreground">Left: the panel now. Right: the earlier text.</div>
            <DiffView :left="current" :right="snapshots[picked]?.text || ''" />
            <Button size="sm" class="h-8 text-xs" @click="emit('restore', snapshots[picked])">Restore this text</Button>
          </div>
        </div>
      </DialogContent>
    </DialogPortal>
  </DialogRoot>
</template>
