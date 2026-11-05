<script setup>
// Concepts (feedback #1067): plain explanations of the ideas behind the section you are
// in, from data/concepts.js. A drawer from the right; Esc or outside click closes it.
import { computed, ref, onMounted, onBeforeUnmount } from 'vue'
import { useRoute } from 'vue-router'
import { BookOpen, X } from 'lucide-vue-next'
import { conceptsFor, CONCEPTS } from '@/data/concepts.js'

const route = useRoute()
const open = ref(false)
const all = ref(false)
const filter = ref('')
const groups = computed(() => {
  const list = all.value ? conceptsFor(null) : conceptsFor(route.meta?.group)
  const t = filter.value.trim().toLowerCase()
  if (!t) return list
  return list.map((g) => ({ ...g, items: g.items.filter((c) => `${c.term} ${c.text}`.toLowerCase().includes(t)) })).filter((g) => g.items.length)
})
const known = computed(() => !!CONCEPTS[route.meta?.group])
const onKey = (e) => { if (e.key === 'Escape') open.value = false }
onMounted(() => window.addEventListener('keydown', onKey))
onBeforeUnmount(() => window.removeEventListener('keydown', onKey))
function toggle() { open.value = !open.value; all.value = !known.value; filter.value = '' }
</script>

<template>
  <button class="h-9 w-9 flex items-center justify-center rounded-lg text-foreground/80 hover:bg-accent" title="Concepts: what the terms on this page mean" aria-label="Concepts" data-concepts-button @click="toggle"><BookOpen class="h-4 w-4" /></button>
  <Teleport to="body">
    <div v-if="open" class="fixed inset-0 z-[190] bg-black/20" @mousedown.self="open = false">
      <aside role="dialog" aria-modal="true" aria-label="Concepts" class="absolute right-0 top-0 h-full w-[400px] max-w-full bg-card border-l border-border shadow-xl flex flex-col" data-concepts>
        <div class="flex items-center gap-2 px-4 py-3 border-b border-border">
          <BookOpen class="h-4 w-4 text-primary" />
          <h2 class="font-semibold flex-1">Concepts<template v-if="!all && known"> · {{ route.meta.group }}</template></h2>
          <button type="button" class="p-1 rounded hover:bg-accent" aria-label="Close" @click="open = false"><X class="h-4 w-4" /></button>
        </div>
        <div class="px-4 py-2 border-b border-border flex items-center gap-2 text-xs">
          <input v-model="filter" type="search" class="h-8 flex-1 rounded-full border border-border bg-background px-3" placeholder="Find a term" aria-label="Find a term" />
          <button v-if="known" type="button" class="underline text-muted-foreground hover:text-foreground whitespace-nowrap" @click="all = !all">{{ all ? `Only ${route.meta.group}` : 'All sections' }}</button>
        </div>
        <div class="flex-1 overflow-y-auto px-4 py-3 space-y-4 text-sm">
          <section v-for="g in groups" :key="g.group">
            <h3 v-if="all" class="text-[11px] font-semibold uppercase tracking-[0.06em] text-muted-foreground mb-2">{{ g.group }}</h3>
            <dl class="space-y-3">
              <div v-for="c in g.items" :key="c.term">
                <dt class="font-semibold">{{ c.term }}</dt>
                <dd class="text-muted-foreground leading-relaxed">{{ c.text }}</dd>
              </div>
            </dl>
          </section>
          <p v-if="!groups.length" class="text-muted-foreground italic">No term matches.</p>
        </div>
      </aside>
    </div>
  </Teleport>
</template>
