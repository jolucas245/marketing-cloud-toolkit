<script setup>
import { computed, ref, watch } from 'vue'
import { Handle, Position } from '@vue-flow/core'
import { JOURNEY_ICON_PATHS, ACTIVITY_WIDTH } from '@/utils/journeyCanvas.js'
import { journeyNodeAnchors } from '@/utils/journeyFlow.js'

const props = defineProps({ data: { type: Object, required: true } })
defineOptions({ inheritAttrs: false })
const emit = defineEmits(['select'])
const tooltipVisible = ref(true)
const loadedIconUrl = ref(null)
const failedIconUrl = ref(null)
const iconUrl = computed(() => props.data.iconUrl || null)
const showIconImage = computed(() => iconUrl.value && failedIconUrl.value !== iconUrl.value)
const iconImageLoaded = computed(() => showIconImage.value && loadedIconUrl.value === iconUrl.value)
watch(iconUrl, () => { loadedIconUrl.value = null; failedIconUrl.value = null })
function iconLoaded(event) {
  const url = event.target.currentSrc || event.target.src
  if (url === iconUrl.value) loadedIconUrl.value = url
}
function iconFailed(event) {
  const url = event.target.currentSrc || event.target.src
  if (url === iconUrl.value) failedIconUrl.value = url
}
const horizontal = computed(() => props.data.orientation !== 'vertical')
const paths = computed(() => JOURNEY_ICON_PATHS[props.data.visual.icon] || JOURNEY_ICON_PATHS.custom)
const anchors = computed(() => journeyNodeAnchors(props.data.orientation))
const targetStyle = computed(() => ({ left: `${anchors.value.target.x}px`, top: `${anchors.value.target.y}px` }))
const sourceStyle = computed(() => horizontal.value
  ? { right: `${ACTIVITY_WIDTH - anchors.value.source.x}px`, top: `${anchors.value.source.y}px` }
  : { left: `${anchors.value.source.x}px`, top: `${anchors.value.source.y}px`, bottom: 'auto' })
</script>

<template>
  <div class="journey-activity" :style="{ '--activity-color': data.visual.color }">
    <Handle type="target" :position="horizontal ? Position.Left : Position.Top" :connectable="false" :style="targetStyle" />
    <button type="button" class="journey-activity-button" :class="{ 'is-selected': data.active }"
      :data-activity-key="data.key" :aria-pressed="data.active" :aria-label="`${data.typeLabel}: ${data.name}${data.summary ? '. ' + data.summary : ''}`"
      @click="emit('select', $event)" @mouseenter="tooltipVisible = true" @focus="tooltipVisible = true" @keydown.esc="tooltipVisible = false">
      <span class="journey-activity-symbol" :class="`is-${data.visual.shape}`" aria-hidden="true">
        <img v-if="showIconImage" :key="iconUrl" :src="iconUrl" alt="" class="journey-activity-image"
          :class="{ 'is-loaded': iconImageLoaded }" :draggable="false" decoding="async" referrerpolicy="no-referrer"
          @load="iconLoaded" @error="iconFailed" />
        <svg
          :class="{ 'is-image-fallback': iconImageLoaded }"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          :stroke-width="data.visual.icon === 'optimizer' ? 1.2 : data.visual.icon === 'engagement' ? 1.4 : data.visual.icon === 'decision' ? 2.4 : 1.7"
          :stroke-linecap="data.visual.icon === 'decision' ? 'butt' : 'round'"
          stroke-linejoin="round"
        >
          <path v-for="(path, index) in paths" :key="index" :d="path"
          :fill="data.visual.icon === 'push' || (data.visual.icon === 'email' && index === 0) ? 'currentColor' : 'none'"
          :stroke="data.visual.icon === 'push' ? 'none' : data.visual.icon === 'email' ? (index === 0 ? 'none' : 'var(--activity-color)') : 'currentColor'"
          :stroke-width="data.visual.icon === 'email' ? 1.1 : undefined" />
          <g v-if="data.visual.icon === 'random'" fill="currentColor" stroke="none">
            <circle v-for="y in [5, 12, 19]" :key="y" cx="17" :cy="y" r="2.5" />
          </g>
          <g v-if="data.visual.icon === 'winner'" fill="currentColor" stroke="none">
            <circle cx="6" cy="4" r="1.4" />
            <path d="M9 5c1.2-.8 2.4-.7 3.7-.4v3L9 8.2ZM16.3 5.7c1.2.2 2.4.1 3.7-.7v3l-3.7.7ZM12.7 7.6l3.6 1.1v3l-3.6-1.1ZM9 11.2l3.7-.6v3c-1.3-.3-2.5-.4-3.7.4ZM16.3 11.7L20 11v3c-1.3.5-2.5.5-3.7.4Z" />
          </g>
          <g v-if="data.visual.icon === 'optimizer'">
            <path d="M7 13.5c2 1.5 3.7-1.2 5.8-.4l1.2.5-1.4 2.4H11v3.4H5.3c-.5 0-.8-.5-.5-1Z" fill="currentColor" stroke="none" />
            <path d="M20 14h-5v8h5M12 18h8" />
            <circle v-for="y in [14, 18, 22]" :key="y" cx="20" :cy="y" r="1.3" fill="currentColor" stroke="none" />
          </g>
          <path
            v-if="data.visual.icon === 'engagement'"
            d="M12 10 22 18h-5l3 4-2.7 1.7-3-4.5-2.3 2.8Z"
            fill="currentColor"
            stroke="none"
          />
        </svg>
      </span>
      <span class="journey-activity-name" :class="{ 'is-winner': data.visual.icon === 'winner' }">{{ data.name }}</span>
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
.journey-activity-symbol svg, .journey-activity-image { grid-area: 1 / 1; width: 25px; height: 25px; }
.journey-activity-image { display: block; visibility: hidden; object-fit: contain; pointer-events: none; }
.journey-activity-image.is-loaded { visibility: visible; }
.journey-activity-symbol svg.is-image-fallback { visibility: hidden; }
.journey-activity-symbol.is-diamond svg, .journey-activity-symbol.is-diamond .journey-activity-image { width: 23px; height: 23px; transform: rotate(-45deg); }
.journey-activity-button:hover .journey-activity-symbol { box-shadow: 0 0 0 4px hsl(var(--primary) / .15); }
.journey-activity-button:active .journey-activity-symbol { box-shadow: 0 0 0 5px hsl(var(--primary) / .25); }
.journey-activity-button.is-selected .journey-activity-symbol { outline: 2px solid hsl(var(--ring)); outline-offset: 4px; }
.journey-activity-name { display: -webkit-box; width: 148px; margin-top: 10px; overflow: hidden; -webkit-box-orient: vertical; -webkit-line-clamp: 2; font-size: 11px; font-weight: 500; line-height: 15px; overflow-wrap: anywhere; text-align: center; }
.journey-activity-name.is-winner { width: max-content; max-width: 148px; padding: 0 4px; background: hsl(var(--card)); }
.journey-activity-summary { display: block; max-width: 148px; margin-top: 3px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: 10px; line-height: 14px; color: hsl(var(--muted-foreground)); }
.journey-activity-tooltip { position: absolute; bottom: calc(100% + 10px); left: 50%; z-index: 10; display: none; width: max-content; max-width: 260px; padding: 8px 10px; border: 1px solid hsl(var(--border)); border-radius: 6px; background: hsl(var(--popover)); color: hsl(var(--popover-foreground)); box-shadow: 0 2px 8px rgb(0 0 0 / .12); transform: translateX(-50%); font-size: 11px; line-height: 16px; text-align: left; pointer-events: none; }
.journey-activity-button:hover .journey-activity-tooltip, .journey-activity-button:focus-visible .journey-activity-tooltip { display: block; }
.journey-activity :deep(.vue-flow__handle) { min-width: 0; min-height: 0; width: 1px; height: 1px; border: 0; opacity: 0; pointer-events: none; }
@media (forced-colors: active) { .journey-activity-symbol { border-color: ButtonText; color: ButtonText; background: Canvas; } .journey-activity-button.is-selected .journey-activity-symbol { outline-color: Highlight; } }
@media (forced-colors: active) { .journey-activity-image { display: none; } .journey-activity-symbol svg.is-image-fallback { visibility: visible; } }
</style>
