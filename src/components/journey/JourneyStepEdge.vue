<script setup>
import { BaseEdge, EdgeLabelRenderer } from '@vue-flow/core'

defineProps({ id: { type: String, required: true }, data: { type: Object, required: true } })
defineOptions({ inheritAttrs: false })
</script>

<template>
  <BaseEdge :id="id" :path="data.path" class="journey-step-line" :interaction-width="0" />
  <EdgeLabelRenderer>
    <span v-if="data.label" class="journey-step-label" :style="{ transform: `translate(-50%, -50%) translate(${data.x}px, ${data.y}px)` }">{{ data.label }}</span>
  </EdgeLabelRenderer>
</template>

<style>
.journey-canvas .journey-step-line { stroke: var(--journey-connector); stroke-width: 1.7; }
.journey-canvas .journey-step-label { position: absolute; max-width: 160px; padding: 1px 6px; border: 1px solid hsl(var(--border)); border-radius: 3px; background: hsl(var(--card)); color: hsl(var(--muted-foreground)); font-size: 10px; line-height: 14px; overflow-wrap: anywhere; text-align: center; pointer-events: none; }
</style>
