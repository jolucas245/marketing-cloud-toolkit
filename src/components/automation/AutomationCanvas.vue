<script setup>
// The automation canvas (feedback #1035), laid out like Automation Studio's workflow view
// (feedback #1072): a header band ("Starting source", "Step 1", ...), the starting source
// column on the left with its schedule as labelled fields, then one full-height column per
// step split by dashed lines, with numbered activity cards ("1.1 SQL Query", an icon tile,
// the activity name). The Toolkit's own styling and icons; nothing is loaded from SFMC.
// Clicking a card emits `select` with its "si.ai" key. The SVG download still draws
// automationCanvasModel (utils/automationSvg.js).
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { CalendarClock, FolderInput, Play, Loader2, AlertTriangle, Minus, Plus, Maximize2 } from 'lucide-vue-next'
import ActivityIcon from '@/components/results/ActivityIcon.vue'
import ProgressBar from '@/components/ui/ProgressBar.vue'
import { automationCanvasModel } from '@/utils/automationCanvas.js'
import { describeRecurrence } from '@/utils/ical.js'
import { formatDateTime } from '@/utils/format.js'

const props = defineProps({
  details: { type: Object, required: true },
  acts: { type: Object, default: () => ({}) }, // "si.ai" → { status }
  runningStep: { type: Number, default: 0 }, // 1-based, 0 when not running
})
const emit = defineEmits(['select'])

const model = computed(() => automationCanvasModel(props.details, { runningStep: props.runningStep }))
const SOURCE_ICONS = { schedule: CalendarClock, fileDrop: FolderInput, none: Play }
const SOURCE_TITLE = { schedule: 'Schedule', fileDrop: 'File Drop', none: 'No starting source' }

// The schedule as Automation Studio lists it: labelled fields, only those present.
const scheduleRows = computed(() => {
  const s = props.details?.schedule || {}
  const rows = []
  const recur = describeRecurrence(s.icalRecur)
  if (recur) rows.push(['Repeat', recur])
  if (s.startDate) rows.push(['Starting', formatDateTime(s.startDate)])
  const end = s.endDate || s.endTime
  if (end) rows.push(['Ending', /2079|9999/.test(String(end)) ? 'Never' : formatDateTime(end)])
  if (s.timezoneName) rows.push(['Time zone', s.timezoneName])
  if (formatDateTime(s.scheduledTime)) rows.push(['Next run', formatDateTime(s.scheduledTime)])
  return rows
})
const scheduleStatus = computed(() => String(props.details?.schedule?.scheduleStatus || '').toLowerCase())
const sourceLines = computed(() => (model.value.source.kind === 'schedule' ? [] : model.value.source.lines))

const COL_W = 268
const SOURCE_W = 220
const naturalWidth = computed(() => SOURCE_W + model.value.columns.length * COL_W)

const box = ref(null)
const scale = ref(1)
const fitted = ref(true)
// Shrinks to the box down to 75% by itself and scrolls beyond; Fit shrinks as needed.
function fit(full = true) {
  fitted.value = true
  const w = box.value?.clientWidth || 0
  const s = w ? Math.min(1, w / naturalWidth.value) : 1
  scale.value = full === true ? Math.max(0.3, s) : Math.max(0.75, s)
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
watch(naturalWidth, () => { if (fitted.value) nextTick(() => fit(false)) })
</script>

<template>
  <section class="rounded-xl border border-border bg-card" aria-label="Automation canvas">
    <div class="flex items-center gap-2 px-3 py-2 border-b border-border">
      <h2 class="text-sm font-semibold">Workflow</h2>
      <span class="text-xs text-muted-foreground">{{ model.columns.reduce((n, c) => n + c.cards.length, 0) }} activities in {{ model.columns.length }} {{ model.columns.length === 1 ? 'step' : 'steps' }}. Click an activity for its details.</span>
      <div class="flex-1" />
      <div class="flex items-center gap-0.5" role="group" aria-label="Zoom">
        <button class="p-1 rounded-md text-muted-foreground hover:bg-accent" title="Zoom out" @click="zoom(-0.1)"><Minus class="h-3.5 w-3.5" /></button>
        <span class="w-10 text-center text-xs tabular-nums text-muted-foreground">{{ Math.round(scale * 100) }}%</span>
        <button class="p-1 rounded-md text-muted-foreground hover:bg-accent" title="Zoom in" @click="zoom(0.1)"><Plus class="h-3.5 w-3.5" /></button>
        <button class="inline-flex items-center gap-1 h-7 px-2 rounded-md text-xs text-muted-foreground hover:bg-accent" title="Fit to width" @click="fit(true)"><Maximize2 class="h-3.5 w-3.5" /> Fit</button>
      </div>
    </div>
    <div ref="box" class="overflow-auto rounded-b-xl" data-testid="automation-canvas">
      <div :style="{ width: `${naturalWidth}px`, zoom: scale }">
        <!-- Header band -->
        <div class="flex border-b border-border bg-muted/60 text-xs">
          <div class="shrink-0 px-4 py-2 font-semibold uppercase tracking-wide text-[11px] border-r border-border" :style="{ width: `${SOURCE_W}px` }">Starting source</div>
          <div v-for="col in model.columns" :key="`h${col.index}`" class="shrink-0 px-4 py-2 border-r border-dashed border-border flex items-center gap-2"
            :class="col.running ? 'text-primary font-semibold' : 'text-muted-foreground'" :style="{ width: `${COL_W}px` }">
            <span>{{ col.label }}</span>
            <span v-if="col.name" class="truncate" :title="col.name">· {{ col.name }}</span>
            <ProgressBar v-if="col.running" indeterminate size="xs" aria-label="This step is running" class="flex-1" />
          </div>
        </div>
        <!-- Body: the source column and one column per step -->
        <div class="flex min-h-[360px]" data-canvas-body>
          <div class="shrink-0 border-r border-border bg-muted/30 px-4 py-4" :style="{ width: `${SOURCE_W}px` }" data-canvas-source>
            <div class="text-sm font-semibold uppercase tracking-wide text-muted-foreground">{{ SOURCE_TITLE[model.source.kind] }}</div>
            <div class="my-4 flex justify-center">
              <span class="relative flex h-16 w-16 items-center justify-center rounded-full text-white" :class="model.source.kind === 'none' ? 'bg-slate-400' : 'bg-emerald-500'">
                <component :is="SOURCE_ICONS[model.source.kind]" class="h-8 w-8" aria-hidden="true" />
                <span v-if="scheduleStatus && !/active|scheduled/.test(scheduleStatus)" class="absolute -bottom-1 -right-1 rounded bg-amber-500 px-1 text-[10px] font-semibold uppercase">{{ scheduleStatus }}</span>
              </span>
            </div>
            <div v-if="scheduleStatus" class="mb-3 flex text-[11px] rounded border border-border overflow-hidden">
              <span class="flex-1 text-center py-0.5" :class="/active|scheduled/.test(scheduleStatus) ? 'bg-primary text-primary-foreground' : 'text-muted-foreground'">Active</span>
              <span class="flex-1 text-center py-0.5" :class="!/active|scheduled/.test(scheduleStatus) ? 'bg-amber-500 text-white' : 'text-muted-foreground'">Paused</span>
            </div>
            <dl class="space-y-2 text-xs">
              <div v-for="[k, v] in scheduleRows" :key="k">
                <dt class="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">{{ k }}</dt>
                <dd class="wrap-break-word">{{ v }}</dd>
              </div>
            </dl>
            <p v-for="(line, i) in sourceLines" :key="i" class="text-xs text-muted-foreground wrap-break-word">{{ line }}</p>
          </div>

          <div v-for="col in model.columns" :key="col.index" class="shrink-0 border-r border-dashed border-border px-4 py-4 space-y-3"
            :class="col.running ? 'bg-primary/5' : ''" :style="{ width: `${COL_W}px` }" :data-canvas-step="col.index + 1">
            <p v-if="!col.cards.length" class="pt-6 text-center text-xs italic text-muted-foreground">No activities</p>
            <button v-for="c in col.cards" :key="c.key" type="button"
              class="w-full rounded-md border border-border bg-card text-left shadow-sm hover:border-primary hover:shadow focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
              :title="`${c.label} ${c.typeLabel}: ${c.name}`" :data-key="c.key" @click="emit('select', c.key)">
              <span class="flex items-center gap-1.5 px-3 pt-2.5 text-[13px]">
                <span class="font-medium">{{ c.label }} {{ c.typeLabel }}</span>
                <Loader2 v-if="acts[c.key]?.status === 'loading'" class="h-3 w-3 animate-spin text-muted-foreground" aria-label="Loading" />
                <AlertTriangle v-else-if="acts[c.key]?.status === 'error'" class="h-3 w-3 text-amber-600 dark:text-amber-400" aria-label="Details could not be loaded" />
              </span>
              <span class="flex items-start gap-3 px-3 pb-3 pt-2">
                <span class="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-amber-500 text-white shadow-sm">
                  <ActivityIcon :type="c.typeId" size="h-6 w-6" plain />
                </span>
                <span class="text-[13px] leading-snug text-foreground line-clamp-3 wrap-break-word">{{ c.name }}</span>
              </span>
            </button>
          </div>
        </div>
      </div>
    </div>
  </section>
</template>
