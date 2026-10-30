<script setup>
import { BaseEdge, EdgeLabelRenderer } from '@vue-flow/core'

defineProps({ id: { type: String, required: true }, data: { type: Object, required: true } })
defineOptions({ inheritAttrs: false })
</script>

<template>
  <BaseEdge :id="id" :path="data.path" class="journey-step-line" :interaction-width="0" />
  <EdgeLabelRenderer>
    <span v-if="data.label" class="journey-step-label" :style="{ transform: `translate(-50%, -50%) translate(${data.x}px, ${data.y}px)` }">{{ data.label }}</span>
    <span v-if="data.junction" class="journey-join-point" role="img" :aria-label="data.junction.description"
      :style="{ transform: `translate(-50%, -50%) translate(${data.junction.x}px, ${data.junction.y}px)`, '--join-color': data.junction.color }">
      <span class="journey-join-dot" aria-hidden="true" />
      <span class="journey-join-label" aria-hidden="true">{{ data.junction.count }} {{ data.junction.count === 1 ? 'Join' : 'Joins' }}</span>
    </span>
  </EdgeLabelRenderer>
</template>

<style>
.journey-canvas .journey-step-line { stroke: var(--journey-connector); stroke-width: 1.7; }
.journey-canvas .journey-step-label { position: absolute; max-width: 160px; padding: 1px 6px; border: 1px solid hsl(var(--border)); border-radius: 3px; background: hsl(var(--card)); color: hsl(var(--muted-foreground)); font-size: 10px; line-height: 14px; overflow-wrap: anywhere; text-align: center; pointer-events: none; }
.journey-canvas .journey-join-point { position: absolute; z-index: 1; width: 16px; height: 16px; pointer-events: none; }
.journey-canvas .journey-join-dot { display: block; width: 16px; height: 16px; border: 1px solid hsl(var(--card)); border-radius: 50%; background: var(--join-color); }
.journey-canvas .journey-join-label { position: absolute; top: 22px; left: 50%; padding: 0 3px; transform: translateX(-50%); background: hsl(var(--card)); color: hsl(var(--foreground)); font-size: 10px; line-height: 14px; white-space: nowrap; }
@media (forced-colors: active) { .journey-canvas .journey-join-dot { border-color: CanvasText; background: Highlight; } }
</style>
