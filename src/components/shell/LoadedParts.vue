<script setup>
// Load everything (feedback #1037), in the connection menu: what has been read into the
// Toolkit's caches for this stack and business unit, part by part.
import { computed } from 'vue'
import { Check, RefreshCw, Loader2, X, Circle, DownloadCloud, Square, Ban } from 'lucide-vue-next'
import { usePreload } from '@/composables/usePreload.js'
import { PRELOAD_STEPS, preloadSummary, countText, durationText } from '@/utils/preloadSteps.js'

const props = defineProps({ stack: { type: String, default: null } })
const { state, loadEverything, refresh, stop } = usePreload()

const summary = computed(() => preloadSummary(state.steps))
const started = computed(() => state.running || PRELOAD_STEPS.some((s) => state.steps[s.id].state !== 'waiting'))
</script>

<template>
  <div>
    <div class="flex items-center gap-1.5">
      <span class="font-medium flex-1">{{ summary.text }}</span>
      <button v-if="state.running" class="flex items-center gap-1 px-1.5 py-0.5 rounded border border-border hover:bg-accent" title="Stop after the requests on their way" @click="stop">
        <Square class="h-3 w-3" /> Stop
      </button>
      <template v-else>
        <button class="flex items-center gap-1 px-1.5 py-0.5 rounded border border-border hover:bg-accent disabled:opacity-50" :disabled="!props.stack"
          title="Read every part into the Toolkit's memory, keeping what is already fresh" @click="loadEverything(props.stack)">
          <DownloadCloud class="h-3 w-3" /> Load everything
        </button>
        <button class="flex items-center gap-1 px-1.5 py-0.5 rounded border border-border hover:bg-accent disabled:opacity-50" :disabled="!props.stack"
          title="Read every part again from Marketing Cloud" @click="refresh(props.stack)">
          <RefreshCw class="h-3 w-3" /> Refresh
        </button>
      </template>
    </div>
    <p class="text-muted-foreground mt-1">Reads automations, activities, journeys, content and data extension details into the Toolkit's caches so pages, searches and Where used open faster. Nothing is saved to a file or downloaded.</p>
    <p v-if="state.notice" class="mt-1 text-amber-700 dark:text-amber-400">{{ state.notice }}</p>
    <div v-if="started" class="mt-1.5 h-1.5 rounded-full bg-muted overflow-hidden" role="progressbar" :aria-valuenow="summary.finished" aria-valuemin="0" :aria-valuemax="summary.total">
      <div class="h-full bg-primary transition-all" :style="{ width: `${summary.percent}%` }" />
    </div>
    <ul v-if="started" class="mt-1.5 space-y-1 max-h-64 overflow-y-auto pr-1" data-testid="preload-parts">
      <li v-for="step in PRELOAD_STEPS" :key="step.id" class="flex items-start gap-1.5" :title="`Used by ${step.usedBy}`">
        <Loader2 v-if="state.steps[step.id].state === 'running'" class="h-3.5 w-3.5 mt-px shrink-0 animate-spin text-primary" />
        <Check v-else-if="state.steps[step.id].state === 'done'" class="h-3.5 w-3.5 mt-px shrink-0 text-emerald-600" />
        <X v-else-if="state.steps[step.id].state === 'failed'" class="h-3.5 w-3.5 mt-px shrink-0 text-red-600" />
        <Ban v-else-if="state.steps[step.id].state === 'stopped'" class="h-3.5 w-3.5 mt-px shrink-0 text-muted-foreground" />
        <Circle v-else class="h-3.5 w-3.5 mt-px shrink-0 text-muted-foreground/50" />
        <span class="min-w-0 flex-1">
          <span :class="state.steps[step.id].state === 'waiting' ? 'text-muted-foreground' : ''">{{ step.label }}</span>
          <span v-if="countText(step, state.steps[step.id])" class="block text-muted-foreground">
            {{ countText(step, state.steps[step.id]) }}<template v-if="state.steps[step.id].note">, {{ state.steps[step.id].note }}</template>
          </span>
          <span v-if="state.steps[step.id].state === 'failed'" class="block text-red-600 break-words">{{ state.steps[step.id].message }}</span>
        </span>
        <span v-if="state.steps[step.id].ms != null && state.steps[step.id].state !== 'stopped'" class="text-muted-foreground shrink-0">{{ durationText(state.steps[step.id].ms) }}</span>
      </li>
    </ul>
  </div>
</template>
