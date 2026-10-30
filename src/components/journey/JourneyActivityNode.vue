<script setup>
import { computed, ref } from 'vue'
import { Handle, Position } from '@vue-flow/core'
import { JOURNEY_ICON_PATHS, ACTIVITY_HEIGHT } from '@/utils/journeyCanvas.js'

const props = defineProps({ data: { type: Object, required: true } })
defineOptions({ inheritAttrs: false })
const emit = defineEmits(['select'])
const tooltipVisible = ref(true)
const horizontal = computed(() => props.data.orientation !== 'vertical')
const paths = computed(() => JOURNEY_ICON_PATHS[props.data.visual.icon] || JOURNEY_ICON_PATHS.custom)
const targetStyle = computed(() => horizontal.value ? { left: '56px', top: '26px' } : { left: '78px', top: '4px' })
const sourceStyle = computed(() => horizontal.value ? { right: '56px', top: '26px' } : { left: '78px', top: `${ACTIVITY_HEIGHT}px`, bottom: 'auto' })
</script>

<template>
  <div class="journey-activity" :style="{ '--activity-color': data.visual.color }">
    <Handle type="target" :position="horizontal ? Position.Left : Position.Top" :connectable="false" :style="targetStyle" />
    <button type="button" class="journey-activity-button" :class="{ 'is-selected': data.active }"
      :data-activity-key="data.key" :aria-pressed="data.active" :aria-label="`${data.typeLabel}: ${data.name}${data.summary ? '. ' + data.summary : ''}`"
      @click="emit('select', $event)" @mouseenter="tooltipVisible = true" @focus="tooltipVisible = true" @keydown.esc="tooltipVisible = false">
      <span class="journey-activity-symbol" :class="`is-${data.visual.shape}`" aria-hidden="true">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">
          <path v-for="(path, index) in paths" :key="index" :d="path" />
        </svg>
      </span>
      <span class="journey-activity-name">{{ data.name }}</span>
      <span v-if="data.summary" class="journey-activity-summary">{{ data.summary }}</span>
      <span v-if="tooltipVisible" class="journey-activity-tooltip" role="tooltip">{{ data.typeLabel }} · {{ data.name }}<template v-if="data.summary"> · {{ data.summary }}</template></span>
    </button>
    <Handle type="source" :position="horizontal ? Position.Right : Position.Bottom" :connectable="false" :style="sourceStyle" />
  </div>
</template>

<style scoped>
.journey-activity { position: relative; width: 156px; height: 112px; }
.journey-activity-button { position: relative; display: flex; align-items: center; flex-direction: column; width: 100%; height: 100%; padding: 4px 4px 0; border: 0; border-radius: 8px; background: transparent; color: hsl(var(--foreground)); cursor: pointer; }
.journey-activity-button:focus-visible { outline: 2px solid hsl(var(--ring)); outline-offset: 4px; }
.journey-activity-symbol { display: grid; flex-shrink: 0; width: 44px; height: 44px; place-items: center; color: white; background: var(--activity-color); border: 1px solid transparent; border-radius: 7px; }
.journey-activity-symbol.is-circle { border-radius: 50%; }
.journey-activity-symbol.is-diamond { width: 34px; height: 34px; margin: 5px 0; border-radius: 4px; transform: rotate(45deg); }
.journey-activity-symbol svg { width: 25px; height: 25px; }
.journey-activity-symbol.is-diamond svg { width: 23px; height: 23px; transform: rotate(-45deg); }
.journey-activity-button:hover .journey-activity-symbol { box-shadow: 0 0 0 4px hsl(var(--primary) / .15); }
.journey-activity-button:active .journey-activity-symbol { box-shadow: 0 0 0 5px hsl(var(--primary) / .25); }
.journey-activity-button.is-selected .journey-activity-symbol { outline: 2px solid hsl(var(--ring)); outline-offset: 4px; }
.journey-activity-name { display: -webkit-box; width: 148px; margin-top: 10px; overflow: hidden; -webkit-box-orient: vertical; -webkit-line-clamp: 2; font-size: 11px; font-weight: 500; line-height: 15px; overflow-wrap: anywhere; text-align: center; }
.journey-activity-summary { display: block; max-width: 148px; margin-top: 3px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: 10px; line-height: 14px; color: hsl(var(--muted-foreground)); }
.journey-activity-tooltip { position: absolute; bottom: calc(100% + 10px); left: 50%; z-index: 10; display: none; width: max-content; max-width: 260px; padding: 8px 10px; border: 1px solid hsl(var(--border)); border-radius: 6px; background: hsl(var(--popover)); color: hsl(var(--popover-foreground)); box-shadow: 0 2px 8px rgb(0 0 0 / .12); transform: translateX(-50%); font-size: 11px; line-height: 16px; text-align: left; pointer-events: none; }
.journey-activity-button:hover .journey-activity-tooltip, .journey-activity-button:focus-visible .journey-activity-tooltip { display: block; }
.journey-activity :deep(.vue-flow__handle) { min-width: 0; min-height: 0; width: 1px; height: 1px; border: 0; opacity: 0; pointer-events: none; }
@media (forced-colors: active) { .journey-activity-symbol { border-color: ButtonText; color: ButtonText; background: Canvas; } .journey-activity-button.is-selected .journey-activity-symbol { outline-color: Highlight; } }
</style>
