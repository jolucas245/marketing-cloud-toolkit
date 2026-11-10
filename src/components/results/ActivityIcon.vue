<script setup>
// Icon for an automation activity type (feedback #123), by objectTypeId or by name
// ("Query", "SQL Query", "Script", ...). Since 2026-11-10 Automation Studio's own icons
// (user asked): its white glyph on its orange tile, as in its step lists and canvas
// (data/automationStudioIcons.js). `plain`: the glyph only, for a tile drawn by the parent.
import { computed } from 'vue'
import { activityGlyph } from '@/utils/activityIcons.js'
import { AS_GLYPHS, AS_GLYPH_BY_TYPE, AS_TILE } from '@/data/automationStudioIcons.js'

const props = defineProps({
  type: { type: [Number, String], default: null },
  size: { type: String, default: 'h-3.5 w-3.5' },
  plain: { type: Boolean, default: false },
})
const glyph = computed(() => activityGlyph(props.type, AS_GLYPH_BY_TYPE))
const src = computed(() => AS_GLYPHS[glyph.value] || AS_GLYPHS['undefined-activity'])
// Coloured icons (not white glyphs) sit on no tile.
const onTile = computed(() => /-white$/.test(glyph.value))
</script>

<template>
  <img v-if="plain || !onTile" :src="src" alt="" aria-hidden="true" class="shrink-0 object-contain" :class="size" data-as-icon :data-glyph="glyph" />
  <span v-else class="inline-flex shrink-0 items-center justify-center rounded-[3px]" :class="size" :style="{ background: AS_TILE }" aria-hidden="true" data-as-icon :data-glyph="glyph">
    <img :src="src" alt="" class="h-[72%] w-[72%] object-contain" />
  </span>
</template>
