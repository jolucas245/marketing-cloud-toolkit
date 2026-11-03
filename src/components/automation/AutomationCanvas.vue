<script setup>
// The automation canvas (feedback #1035), like Automation Studio's: the starting source on
// the left, then one lane per step with its activity cards stacked, arrows between them.
// Positions come from automationCanvasModel (shared with the SVG download). Clicking a
// card emits `select` with its "si.ai" key.
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { CalendarClock, FolderInput, Play, Loader2, AlertTriangle, Minus, Plus, Maximize2 } from 'lucide-vue-next'
import ActivityIcon from '@/components/results/ActivityIcon.vue'
import ProgressBar from '@/components/ui/ProgressBar.vue'
import { automationCanvasModel, fitScale } from '@/utils/automationCanvas.js'

const props = defineProps({
  details: { type: Object, required: true },
  acts: { type: Object, default: () => ({}) }, // "si.ai" → { status }
  runningStep: { type: Number, default: 0 }, // 1-based, 0 when not running
})
const emit = defineEmits(['select'])

const model = computed(() => automationCanvasModel(props.details, { runningStep: props.runningStep }))
const SOURCE_ICONS = { schedule: CalendarClock, fileDrop: FolderInput, none: Play }

const box = ref(null)
const scale = ref(1)
const fitted = ref(true) // follow the box width until the person zooms
// On its own the canvas shrinks to the box down to 75% and scrolls beyond that (many
// steps); Fit shrinks it as far as needed.
function fit(full = true) {
  fitted.value = true
  const s = fitScale(model.value, box.value?.clientWidth || 0)
  scale.value = full === true ? s : Math.max(0.75, s)
}
function zoom(step) {
  fitted.value = false
  scale.value = Math.min(1.5, Math.max(0.3, Math.round((scale.value + step) * 10) / 10))
}
let observer = null
onMounted(() => {
  nextTick(() => fit(false))
  if (typeof ResizeObserver !== 'undefined' && box.value) {
    observer = new ResizeObserver(() => { if (fitted.value) fit(false) })
    observer.observe(box.value)
  }
})
onBeforeUnmount(() => observer?.disconnect())
watch(() => model.value.width, () => { if (fitted.value) nextTick(() => fit(false)) })
</script>

<template>
  <section class="rounded-xl border border-border bg-card" aria-label="Automation canvas">
    <div class="flex items-center gap-2 px-3 py-2 border-b border-border">
      <h2 class="text-sm font-semibold">Canvas</h2>
      <span class="text-xs text-muted-foreground">{{ model.columns.length }} {{ model.columns.length === 1 ? 'step' : 'steps' }}. Click an activity for its details.</span>
      <div class="flex-1" />
      <div class="flex items-center gap-0.5" role="group" aria-label="Zoom">
        <button class="p-1 rounded-md text-muted-foreground hover:bg-accent" title="Zoom out" @click="zoom(-0.1)"><Minus class="h-3.5 w-3.5" /></button>
        <span class="w-10 text-center text-xs tabular-nums text-muted-foreground">{{ Math.round(scale * 100) }}%</span>
        <button class="p-1 rounded-md text-muted-foreground hover:bg-accent" title="Zoom in" @click="zoom(0.1)"><Plus class="h-3.5 w-3.5" /></button>
        <button class="inline-flex items-center gap-1 h-7 px-2 rounded-md text-xs text-muted-foreground hover:bg-accent" title="Fit to width" @click="fit(true)"><Maximize2 class="h-3.5 w-3.5" /> Fit</button>
      </div>
    </div>
    <div ref="box" class="overflow-auto bg-background/60 rounded-b-xl" data-testid="automation-canvas">
      <div :style="{ width: `${model.width * scale}px`, height: `${model.height * scale}px` }">
        <div class="relative origin-top-left" :style="{ width: `${model.width}px`, height: `${model.height}px`, transform: `scale(${scale})` }">
          <svg class="absolute inset-0 text-muted-foreground/60" :width="model.width" :height="model.height" aria-hidden="true">
            <defs>
              <marker id="tk-canvas-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto"><path d="M0 0L10 5L0 10z" fill="currentColor" /></marker>
            </defs>
            <line v-for="(a, i) in model.connectors" :key="i" :x1="a.x1 + 4" :y1="a.y1" :x2="a.x2 - 4" :y2="a.y2" stroke="currentColor" stroke-width="1.8" marker-end="url(#tk-canvas-arrow)" />
          </svg>

          <!-- Starting source -->
          <div class="absolute rounded-xl border border-border bg-card p-3 shadow-sm"
            :style="{ left: `${model.source.x}px`, top: `${model.source.y}px`, width: `${model.source.w}px`, minHeight: `${model.source.h}px` }">
            <div class="flex items-center gap-2">
              <span class="flex h-7 w-7 items-center justify-center rounded-full bg-primary text-primary-foreground"><component :is="SOURCE_ICONS[model.source.kind]" class="h-4 w-4" aria-hidden="true" /></span>
              <span class="text-[13px] font-semibold">{{ model.source.title }}</span>
            </div>
            <p v-for="(line, i) in model.source.lines" :key="i" class="mt-1.5 text-[11px] leading-snug text-muted-foreground wrap-break-word">{{ line }}</p>
          </div>

          <!-- One lane per step -->
          <div v-for="col in model.columns" :key="col.index" class="absolute rounded-[14px] border bg-muted/70 dark:bg-muted/40"
            :class="col.running ? 'border-primary ring-1 ring-primary' : 'border-border'"
            :style="{ left: `${col.x}px`, top: `${col.y}px`, width: `${col.w}px`, height: `${col.h}px` }">
            <div class="px-3.5 pt-2.5" :style="{ height: '52px' }">
              <div class="flex items-center gap-2 text-xs font-bold text-primary">{{ col.label }}
                <ProgressBar v-if="col.running" indeterminate size="xs" aria-label="This step is running" class="flex-1" />
              </div>
              <div v-if="col.name" class="text-[11px] text-muted-foreground truncate" :title="col.name">{{ col.name }}</div>
            </div>
            <p v-if="!col.cards.length" class="px-3.5 pt-6 text-center text-xs italic text-muted-foreground">No activities</p>
          </div>

          <!-- Activity cards -->
          <template v-for="col in model.columns" :key="`c${col.index}`">
            <button v-for="c in col.cards" :key="c.key" type="button"
              class="absolute flex flex-col overflow-hidden rounded-[10px] border border-border bg-card px-3 py-2 text-left shadow-sm hover:border-primary hover:shadow focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
              :style="{ left: `${c.x}px`, top: `${c.y}px`, width: `${c.w}px`, height: `${c.h}px` }"
              :title="`${c.label} ${c.typeLabel}: ${c.name}`" :data-key="c.key" @click="emit('select', c.key)">
              <span class="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                <ActivityIcon :type="c.typeId" size="h-3.5 w-3.5" />
                <span class="truncate">{{ c.typeLabel }}</span>
                <Loader2 v-if="acts[c.key]?.status === 'loading'" class="h-3 w-3 animate-spin" aria-label="Loading" />
                <AlertTriangle v-else-if="acts[c.key]?.status === 'error'" class="h-3 w-3 text-amber-600 dark:text-amber-400" aria-label="Details could not be loaded" />
                <span class="ml-auto font-normal normal-case font-mono">{{ c.label }}</span>
              </span>
              <span class="mt-1 text-xs leading-snug text-foreground line-clamp-2 wrap-break-word">{{ c.name }}</span>
            </button>
          </template>
        </div>
      </div>
    </div>
  </section>
</template>
