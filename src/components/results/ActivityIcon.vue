<script setup>
// Icon for an automation activity type (feedback #123), by objectTypeId or by name
// ("Query", "SQL Query", "Script", ...). Since 2026-11-10 Automation Studio's own icon
// (user asked): its white glyph on its orange tile. The glyphs are read at run time from
// the user's SFMC stack (utils/asIcons.js), not shipped; until they arrive, or if they
// cannot be read, a lucide icon is drawn on the same tile.
// `plain`: no tile, for a tile drawn by the parent (white glyph).
import { computed, watch } from 'vue'
import { Database, FileCode2, FileInput, FileOutput, ArrowRightLeft, Send, ShieldCheck, Filter, Hourglass, Workflow, Smartphone, MessageSquare, RefreshCw, Users, Cog } from 'lucide-vue-next'
import { activityGlyph, activityIconKind } from '@/utils/activityIcons.js'
import { AS_GLYPH_BY_TYPE, AS_TILE } from '@/data/automationStudioIcons.js'
import { asIcons, loadAsIcons } from '@/utils/asIcons.js'
import { currentStack } from '@/composables/useStack.js'

const props = defineProps({
  type: { type: [Number, String], default: null },
  size: { type: String, default: 'h-3.5 w-3.5' },
  plain: { type: Boolean, default: false },
})
watch(currentStack, (s) => { if (s) loadAsIcons(s) }, { immediate: true })

const FALLBACK = {
  query: Database, script: FileCode2, import: FileInput, extract: FileOutput, transfer: ArrowRightLeft, email: Send,
  verification: ShieldCheck, filter: Filter, wait: Hourglass, journey: Workflow, mobile: Smartphone, sms: MessageSquare,
  refresh: RefreshCw, audience: Users, other: Cog,
}
const glyph = computed(() => activityGlyph(props.type, AS_GLYPH_BY_TYPE))
const src = computed(() => asIcons.glyphs[glyph.value] || null)
const fallback = computed(() => FALLBACK[activityIconKind(props.type)] || Cog)
// Automation Studio's coloured icons (not white glyphs) sit on no tile.
const onTile = computed(() => !src.value || /-white$/.test(glyph.value))
</script>

<template>
  <img v-if="src && (plain || !onTile)" :src="src" alt="" aria-hidden="true" class="shrink-0 object-contain" :class="size" data-as-icon :data-glyph="glyph" />
  <component :is="fallback" v-else-if="plain" class="shrink-0 text-white" :class="size" aria-hidden="true" data-as-fallback />
  <span v-else class="inline-flex shrink-0 items-center justify-center rounded-[3px]" :class="size" :style="{ background: AS_TILE }" aria-hidden="true" :data-as-icon="src ? '' : null" :data-glyph="glyph">
    <img v-if="src" :src="src" alt="" class="h-[72%] w-[72%] object-contain" />
    <component :is="fallback" v-else class="h-[72%] w-[72%] text-white" data-as-fallback />
  </span>
</template>
