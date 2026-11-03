<script setup>
// A labelled toolbar menu for Run Query panels (feedback #1030: too many buttons).
// items: [{ id, label, desc?, icon?, shortcut?, checked?, disabled?, hidden?, run() }]
import { computed, nextTick, ref } from 'vue'
import { ChevronDown, Check } from 'lucide-vue-next'

const props = defineProps({
  label: { type: String, required: true },
  icon: { type: [Object, Function], default: null },
  items: { type: Array, required: true },
  title: { type: String, default: '' },
})

const open = ref(false)
const menu = ref(null)
const visible = computed(() => props.items.filter((i) => !i.hidden))

async function toggle() {
  open.value = !open.value
  if (open.value) {
    await nextTick()
    menu.value?.querySelector('button:not([disabled])')?.focus()
  }
}
function pick(item) {
  if (item.disabled) return
  open.value = false
  item.run()
}
function onKey(e) {
  if (e.key === 'Escape') { open.value = false; return }
  if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return
  e.preventDefault()
  const list = [...(menu.value?.querySelectorAll('button:not([disabled])') || [])]
  const i = list.indexOf(document.activeElement)
  list[(i + (e.key === 'ArrowDown' ? 1 : list.length - 1)) % list.length]?.focus()
}
</script>

<template>
  <div class="relative shrink-0">
    <button type="button" class="tb-btn inline-flex items-center gap-1.5 h-8 px-2.5 rounded-full border border-border bg-card text-[13px] font-medium text-foreground hover:bg-accent"
      :class="open ? 'bg-accent' : ''" :title="title || label" aria-haspopup="menu" :aria-expanded="open" @click="toggle">
      <component :is="icon" v-if="icon" class="h-3.5 w-3.5" />
      <span class="tb-label">{{ label }}</span>
      <ChevronDown class="tb-chev h-3.5 w-3.5 text-muted-foreground" />
    </button>
    <template v-if="open">
      <div class="fixed inset-0 z-40" @click="open = false" />
      <div ref="menu" class="absolute left-0 top-10 z-50 w-72 rounded-xl border border-border bg-card shadow-[0_18px_40px_-16px_rgba(17,24,39,0.35)] p-1.5 text-[13px]" role="menu" :aria-label="label" @keydown="onKey">
        <button v-for="item in visible" :key="item.id" type="button" role="menuitem" :disabled="item.disabled"
          class="w-full flex items-start gap-2.5 text-left px-2.5 py-2 rounded-lg text-foreground hover:bg-accent focus:bg-accent focus:outline-none disabled:opacity-40 disabled:hover:bg-transparent"
          @click="pick(item)">
          <component :is="item.icon" v-if="item.icon" class="h-3.5 w-3.5 mt-0.5 shrink-0 text-muted-foreground" />
          <span class="flex-1 min-w-0">
            <span class="flex items-center gap-2">
              <span class="font-medium">{{ item.label }}</span>
              <Check v-if="item.checked" class="h-3 w-3 text-primary" aria-label="on" />
              <kbd v-if="item.shortcut" class="ml-auto text-[10px] text-muted-foreground font-sans">{{ item.shortcut }}</kbd>
            </span>
            <span v-if="item.desc" class="block text-xs text-muted-foreground">{{ item.desc }}</span>
          </span>
        </button>
      </div>
    </template>
  </div>
</template>
