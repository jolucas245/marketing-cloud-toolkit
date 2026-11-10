<script setup>
import { computed, markRaw, nextTick, ref, watch } from 'vue'
import { VueFlow, useVueFlow } from '@vue-flow/core'
import { MiniMap } from '@vue-flow/minimap'
import { Map as MapIcon, Maximize2, Minus, Plus, Keyboard } from 'lucide-vue-next'
import Button from '@/components/ui/button/Button.vue'
import JourneyActivityNode from './JourneyActivityNode.vue'
import JourneyStepEdge from './JourneyStepEdge.vue'
import { journeyCanvasModel, MIN_JOURNEY_ZOOM, MAX_JOURNEY_ZOOM, ACTIVITY_WIDTH, ACTIVITY_HEIGHT } from '@/utils/journeyCanvas.js'
import '@vue-flow/core/dist/style.css'
import '@vue-flow/minimap/dist/style.css'

const props = defineProps({
  graph: { type: Object, required: true },
  layout: { type: Object, required: true },
  orientation: { type: String, default: 'horizontal' },
  selected: { type: String, default: null },
  visited: { type: Set, default: null },
  visitedEdges: { type: Set, default: null },
  steps: { type: Map, default: null },
  // Contact paths overlay (feedback #1089): aggregatePaths output, see journeyCanvasModel.
  counts: { type: Object, default: null },
  // Journey Builder's contact counts (Map node key -> count), drawn under each activity.
  population: { type: Map, default: null },
})
const emit = defineEmits(['select'])
const root = ref(null)
const showMap = ref(false)
const showHelp = ref(false)
const flowId = `journey-${crypto.randomUUID()}`
const { viewport, fitView, zoomIn, zoomOut, zoomTo, setViewport, getViewport, onNodesInitialized } = useVueFlow(flowId)
const edgeTypes = { journeyStep: markRaw(JourneyStepEdge) }
const model = computed(() => journeyCanvasModel(props.graph, props.layout, props.orientation, props.selected, {
  visited: props.visited, visitedEdges: props.visitedEdges, steps: props.steps, counts: props.counts, population: props.population,
}))
const percent = computed(() => Math.round(viewport.value.zoom * 100))
let gesture = null
let initialized = false

function fit() {
  return fitView({ padding: 0.18, minZoom: MIN_JOURNEY_ZOOM, maxZoom: 1, duration: 0 })
}
onNodesInitialized(() => {
  if (!initialized) {
    initialized = true
    fit()
  }
})
watch(() => props.orientation, async () => {
  await nextTick()
  await fit()
})

function startGesture(event) {
  gesture = { x: event.clientX, y: event.clientY, moved: false, button: event.button }
  if (!event.target.closest('button, input, textarea, select, a')) root.value?.focus({ preventScroll: true })
}
function moveGesture(event) {
  if (gesture && event.buttons && Math.hypot(event.clientX - gesture.x, event.clientY - gesture.y) > 5) gesture.moved = true
}
function selectNode({ event, node }) {
  if (gesture?.moved || (event.detail !== 0 && gesture?.button !== 0)) return
  emit('select', node.id)
}
function paneClick() {
  if (!gesture?.moved) emit('select', null)
}
function focusActivity(key) {
  const button = [...(root.value?.querySelectorAll('[data-activity-key]') || [])].find((element) => element.dataset.activityKey === key)
  if (button) button.focus({ preventScroll: true })
  else root.value?.focus({ preventScroll: true })
}
function revealActivity(event) {
  const button = event.target.closest('[data-activity-key]')
  const node = button && model.value.nodes.find((item) => item.id === button.dataset.activityKey)
  if (!node || !root.value) return
  const current = getViewport()
  const x = node.position.x * current.zoom + current.x
  const y = node.position.y * current.zoom + current.y
  const width = ACTIVITY_WIDTH * current.zoom
  const height = ACTIVITY_HEIGHT * current.zoom
  const margin = 20
  const visibleWidth = root.value.clientWidth
  const visibleHeight = root.value.clientHeight - 64
  let dx = 0, dy = 0
  if (x < margin) dx = margin - x
  else if (x + width > visibleWidth - margin) dx = visibleWidth - margin - x - width
  if (y < margin) dy = margin - y
  else if (y + height > visibleHeight - margin) dy = visibleHeight - margin - y - height
  if (dx || dy) setViewport({ ...current, x: current.x + dx, y: current.y + dy })
}
function keydown(event) {
  if (event.isComposing || event.ctrlKey || event.metaKey || event.altKey) return
  if (event.target.closest('input, textarea, select, [contenteditable="true"]')) return
  if (event.key === 'Escape') {
    event.preventDefault()
    showHelp.value = false
    emit('select', null)
    return
  }
  if (event.target.closest('button')) {
    if (event.key === 'Enter' || event.code === 'Space') gesture = null
    return
  }
  const key = event.key
  if (key === '+' || key === '=') zoomIn()
  else if (key === '-') zoomOut()
  else if (key === '1' || (event.shiftKey && event.code === 'Digit1')) fit()
  else if (key === '0' || (event.shiftKey && event.code === 'Digit0')) zoomTo(1)
  else if (key.startsWith('Arrow')) {
    const current = getViewport()
    const step = event.shiftKey ? 120 : 48
    const delta = { ArrowLeft: [step, 0], ArrowRight: [-step, 0], ArrowUp: [0, step], ArrowDown: [0, -step] }[key]
    if (!delta) return
    setViewport({ ...current, x: current.x + delta[0], y: current.y + delta[1] })
  } else if (event.code === 'Space') {
    event.preventDefault()
    return
  } else return
  event.preventDefault()
}
defineExpose({ fit, focusActivity })
</script>

<template>
  <div ref="root" class="journey-canvas" tabindex="0" role="region" aria-label="Journey canvas" :aria-describedby="`${flowId}-help`"
    @keydown="keydown" @focusin="revealActivity" @pointerdown.capture="startGesture" @pointermove.capture="moveGesture">
    <template v-if="model.nodes.length">
      <VueFlow :id="flowId" :nodes="model.nodes" :edges="model.edges" :edge-types="edgeTypes"
        :nodes-draggable="false" :nodes-connectable="false" :nodes-focusable="false" :edges-focusable="false"
        :elements-selectable="false" :delete-key-code="null" :selection-key-code="null" :multi-selection-key-code="null"
        :pan-on-drag="[0, 1]" :pan-on-scroll="false" :zoom-on-scroll="true" :zoom-on-pinch="true" :zoom-on-double-click="false"
        :pane-click-distance="5" :min-zoom="MIN_JOURNEY_ZOOM" :max-zoom="MAX_JOURNEY_ZOOM"
        :disable-keyboard-a11y="true" :prevent-scrolling="true" :elevate-nodes-on-select="false"
        @pane-click="paneClick" @move-start="showHelp = false">
        <template #node-journeyActivity="node">
          <JourneyActivityNode :data="node.data" @select="selectNode({ event: $event, node })" />
        </template>
        <template #node-journeyRoute>
          <span aria-hidden="true" :style="{ display: 'block', width: `${ACTIVITY_WIDTH}px`, height: `${ACTIVITY_HEIGHT}px` }" />
        </template>
        <MiniMap v-if="showMap" pannable zoomable position="bottom-right" :node-color="(node) => node.data.visual.color"
          :node-class-name="(node) => node.type === 'journeyRoute' ? 'journey-minimap-route' : ''" />
      </VueFlow>
      <div class="journey-canvas-toolbar nopan nowheel" role="toolbar" aria-label="Journey view controls">
        <Button variant="ghost" size="icon" aria-label="Zoom out" title="Zoom out (−)" :disabled="percent <= MIN_JOURNEY_ZOOM * 100" @click="zoomOut()"><Minus class="h-4 w-4" /></Button>
        <Button variant="ghost" size="sm" class="journey-zoom-value" aria-label="Reset zoom to 100 percent" title="Reset to 100% (0)" @click="zoomTo(1)">{{ percent }}%</Button>
        <Button variant="ghost" size="icon" aria-label="Zoom in" title="Zoom in (+)" :disabled="percent >= MAX_JOURNEY_ZOOM * 100" @click="zoomIn()"><Plus class="h-4 w-4" /></Button>
        <span class="journey-toolbar-divider" aria-hidden="true" />
        <Button variant="ghost" size="icon" aria-label="Fit journey to view" title="Fit journey (1)" @click="fit"><Maximize2 class="h-4 w-4" /></Button>
        <Button variant="ghost" size="icon" aria-label="Toggle minimap" title="Minimap" :aria-pressed="showMap" @click="showMap = !showMap"><MapIcon class="h-4 w-4" /></Button>
        <Button variant="ghost" size="icon" aria-label="Show canvas shortcuts" title="Canvas shortcuts" :aria-expanded="showHelp" @click="showHelp = !showHelp"><Keyboard class="h-4 w-4" /></Button>
      </div>
      <div v-if="showHelp" class="journey-canvas-help nopan nowheel">
        <strong>Navigate the journey</strong>
        <span>Drag or middle-drag to pan. Scroll or pinch to zoom.</span>
        <span>Focus the canvas: + / − zoom, 1 fit, 0 reset, arrow keys pan.</span>
        <span>Tab to an activity, then Enter or Space to open its details. Escape closes details.</span>
      </div>
    </template>
    <p v-else class="journey-canvas-empty" role="status">No activities to display in this journey.</p>
    <p :id="`${flowId}-help`" class="sr-only">Interactive journey preview. Drag to pan, scroll to zoom. Tab to an activity and press Enter to open its configuration and email preview.</p>
  </div>
</template>

<style>
.journey-canvas { --journey-connector: #c4d8e8; position: relative; width: 100%; height: clamp(380px, 65vh, 760px); min-height: 380px; overflow: hidden; border: 1px solid hsl(var(--border)); border-radius: 8px; background: hsl(var(--card)); }
.dark .journey-canvas { --journey-connector: #7189a2; }
.journey-canvas:focus-visible { outline: 2px solid hsl(var(--ring)); outline-offset: 2px; }
.journey-canvas .vue-flow__node-journeyActivity { border: 0; padding: 0; background: none; }
.journey-canvas .vue-flow__node-journeyRoute { border: 0; padding: 0; background: none; pointer-events: none; }
.journey-canvas .vue-flow__pane { cursor: grab; }
.journey-canvas .vue-flow__pane.dragging { cursor: grabbing; }
.journey-canvas-toolbar { position: absolute; bottom: 16px; left: 16px; z-index: 5; display: flex; align-items: center; gap: 2px; padding: 4px; border: 1px solid hsl(var(--border)); border-radius: 8px; background: hsl(var(--card)); box-shadow: 0 2px 8px rgb(0 0 0 / .08); }
.journey-canvas-toolbar .journey-zoom-value { width: 60px; font-variant-numeric: tabular-nums; }
.journey-toolbar-divider { height: 20px; width: 1px; margin: 0 4px; background: hsl(var(--border)); }
.journey-canvas-help { position: absolute; bottom: 68px; left: 16px; z-index: 6; display: grid; gap: 6px; width: min(340px, calc(100% - 32px)); padding: 14px; border: 1px solid hsl(var(--border)); border-radius: 8px; background: hsl(var(--popover)); color: hsl(var(--popover-foreground)); font-size: 12px; box-shadow: 0 2px 8px rgb(0 0 0 / .1); }
.journey-canvas-empty { display: grid; height: 100%; place-items: center; padding: 24px; color: hsl(var(--muted-foreground)); font-size: 13px; text-align: center; }
.journey-canvas .vue-flow__minimap { width: 160px; height: 100px; margin: 16px; border: 1px solid hsl(var(--border)); border-radius: 6px; background: hsl(var(--card)); }
.journey-canvas .vue-flow__minimap-mask { fill: hsl(var(--muted) / .6); }
.journey-canvas .journey-minimap-route { fill: none; stroke: none; }
@media (max-width: 640px) { .journey-canvas { min-height: 360px; height: 55vh; } .journey-canvas-toolbar { bottom: 10px; left: 10px; } .journey-canvas .vue-flow__minimap { top: 10px; right: 10px; bottom: auto; margin: 0; width: 120px; height: 75px; } }
@media (forced-colors: active) { .journey-canvas { --journey-connector: CanvasText; } }
</style>
