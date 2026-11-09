<script setup>
// Header pill while background jobs run in this tab (feedback #1092): one job shows its
// name and progress and opens its page; several open Activity history.
import { computed } from 'vue'
import { Loader2 } from 'lucide-vue-next'
import { runningJobs } from '@/composables/useJobs.js'

const one = computed(() => (runningJobs.value.length === 1 ? runningJobs.value[0] : null))
const to = computed(() => (one.value ? one.value.route : '/activity'))
const label = computed(() => (one.value ? one.value.title : `${runningJobs.value.length} tasks running`))
const percent = computed(() => {
  const p = one.value?.progress
  return p?.total ? `${Math.floor((100 * p.done) / p.total)}%` : ''
})
</script>

<template>
  <RouterLink v-if="runningJobs.length" :to="to" class="flex items-center gap-1.5 h-9 rounded-full border border-border px-3 text-xs hover:bg-accent" :title="`${label}: running in this tab. Closing the tab stops it.`" data-jobs-pill>
    <Loader2 class="h-3.5 w-3.5 animate-spin text-primary" />
    <span class="max-w-40 truncate">{{ label }}</span>
    <span v-if="percent" class="text-muted-foreground">{{ percent }}</span>
  </RouterLink>
</template>
