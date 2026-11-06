<script setup>
// A section or card on Home that the user can hide, show and reorder (user, 2026-11-06).
// Outside Customize mode it renders its content as is, or nothing when hidden. In
// Customize mode a toolbar moves it, hides or shows it, and it can be dragged within
// its group. A card's content is inert there (links and fields don't react). A
// `container` (a section holding cards) keeps its cards usable, with its own toolbar
// in a header strip above them. A card's toolbar sits on its top edge, clear of the content.
import { computed } from 'vue'
import { ArrowUp, ArrowDown, ArrowLeft, ArrowRight, Eye, EyeOff, GripVertical } from 'lucide-vue-next'
import { useHomeLayout } from '@/composables/useHomeLayout.js'

const props = defineProps({
  group: { type: String, required: true },
  id: { type: String, required: true },
  label: { type: String, required: true },
  // Sections move up and down; cards in a grid move left and right.
  vertical: { type: Boolean, default: false },
  container: { type: Boolean, default: false },
})
const home = useHomeLayout()
const customizing = computed(() => !!home?.customizing.value)
const hidden = computed(() => !!home?.hidden(props.group, props.id))
const isOver = computed(() => home?.over.value?.group === props.group && home?.over.value?.id === props.id && home?.drag.value?.id !== props.id)
const isDragged = computed(() => home?.drag.value?.group === props.group && home?.drag.value?.id === props.id)
// A card, or a hidden section: nothing inside reacts.
const inertContent = computed(() => !props.container || hidden.value)
const btn = 'h-7 w-7 inline-flex items-center justify-center rounded-full text-muted-foreground hover:bg-accent hover:text-foreground disabled:opacity-30 disabled:hover:bg-transparent'
</script>

<template>
  <slot v-if="!customizing && !hidden" />
  <div
    v-else-if="customizing"
    class="relative min-w-0 rounded-[14px] outline-dashed outline-2 outline-offset-2"
    :class="[isOver ? 'outline-primary' : 'outline-border', isDragged ? 'opacity-40' : '', container ? 'pt-14 px-2 pb-2' : '']"
    draggable="true"
    :data-home-block="`${group}:${id}`"
    :data-hidden="hidden || undefined"
    @dragstart.stop="home.dragStart(group, id, $event)"
    @dragover="home.dragOver(group, id, $event)"
    @drop="home.drop(group, id, $event)"
    @dragend.stop="home.dragEnd()"
  >
    <span v-if="container" class="absolute top-3 left-3 text-xs font-semibold uppercase tracking-[0.06em] text-muted-foreground">{{ label }}</span>
    <div v-if="inertContent" class="h-full pointer-events-none select-none" :class="hidden ? 'opacity-35 grayscale' : ''" inert><slot /></div>
    <div v-else class="h-full"><slot /></div>
    <div class="absolute z-10 flex items-center gap-0.5 rounded-full border border-border bg-card px-1 py-0.5 shadow-sm" role="group" :class="container ? 'top-2 right-2' : '-top-3.5 right-3'" :aria-label="`${label}: arrange`">
      <span v-if="hidden" class="px-1.5 text-[11px] font-medium text-muted-foreground">Hidden</span>
      <GripVertical class="h-4 w-4 mx-0.5 text-muted-foreground cursor-grab" aria-hidden="true" />
      <button type="button" :class="btn" :disabled="home.first(group, id)" :aria-label="`Move ${label} ${vertical ? 'up' : 'earlier'}`" :title="vertical ? 'Move up' : 'Move earlier'" data-move-earlier @click="home.move(group, id, -1)">
        <ArrowUp v-if="vertical" class="h-3.5 w-3.5" /><ArrowLeft v-else class="h-3.5 w-3.5" />
      </button>
      <button type="button" :class="btn" :disabled="home.last(group, id)" :aria-label="`Move ${label} ${vertical ? 'down' : 'later'}`" :title="vertical ? 'Move down' : 'Move later'" data-move-later @click="home.move(group, id, 1)">
        <ArrowDown v-if="vertical" class="h-3.5 w-3.5" /><ArrowRight v-else class="h-3.5 w-3.5" />
      </button>
      <button type="button" :class="btn" :aria-pressed="!hidden" :aria-label="hidden ? `Show ${label}` : `Hide ${label}`" :title="hidden ? 'Show on Home' : 'Hide from Home'" data-toggle-hidden @click="home.toggle(group, id)">
        <EyeOff v-if="hidden" class="h-3.5 w-3.5" /><Eye v-else class="h-3.5 w-3.5" />
      </button>
    </div>
  </div>
</template>
