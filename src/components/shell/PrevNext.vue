<script setup>
// Previous / Next through the list a detail page was opened from (feedback #1043).
// Arrow keys ← and → do the same unless typing, a dialog is open or a modifier is held.
import { computed, onBeforeUnmount, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { ChevronLeft, ChevronRight } from 'lucide-vue-next'
import { browseNeighbours } from '@/utils/browseList.js'

const props = defineProps({
  kind: { type: String, required: true }, // 'automations' | 'journeys'
  id: { type: String, required: true },
  base: { type: String, required: true }, // '/automations'
  noun: { type: String, default: 'item' },
})
const router = useRouter()
const pos = computed(() => browseNeighbours(props.kind, props.id))

function go(item) {
  if (!item) return
  router.push({ path: `${props.base}/${encodeURIComponent(item.id)}`, query: item.query || {} })
}

function typing(el) {
  if (!el) return false
  const tag = el.tagName
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || el.isContentEditable || !!el.closest?.('.cm-editor')
}
function onKey(e) {
  if (!pos.value || e.defaultPrevented || e.altKey || e.ctrlKey || e.metaKey || e.shiftKey) return
  if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return
  if (typing(document.activeElement) || document.querySelector('[role="dialog"], [aria-modal="true"]')) return
  const item = e.key === 'ArrowLeft' ? pos.value.prev : pos.value.next
  if (!item) return
  e.preventDefault()
  go(item)
}
onMounted(() => window.addEventListener('keydown', onKey))
onBeforeUnmount(() => window.removeEventListener('keydown', onKey))
</script>

<template>
  <div v-if="pos && pos.total > 1" class="flex items-center gap-1 shrink-0" data-prev-next>
    <button type="button" class="p-1.5 rounded-md border border-border text-muted-foreground hover:bg-accent disabled:opacity-40 disabled:hover:bg-transparent"
      :disabled="!pos.prev" :title="pos.prev ? `Previous ${noun}: ${pos.prev.name || pos.prev.id} (←)` : `First ${noun} in the list`" :aria-label="`Previous ${noun}`" @click="go(pos.prev)">
      <ChevronLeft class="h-3.5 w-3.5" />
    </button>
    <span class="text-xs text-muted-foreground tabular-nums whitespace-nowrap" :title="`Position in the ${noun} list you opened this from`">{{ pos.index + 1 }} of {{ pos.total }}</span>
    <button type="button" class="p-1.5 rounded-md border border-border text-muted-foreground hover:bg-accent disabled:opacity-40 disabled:hover:bg-transparent"
      :disabled="!pos.next" :title="pos.next ? `Next ${noun}: ${pos.next.name || pos.next.id} (→)` : `Last ${noun} in the list`" :aria-label="`Next ${noun}`" @click="go(pos.next)">
      <ChevronRight class="h-3.5 w-3.5" />
    </button>
  </div>
</template>
