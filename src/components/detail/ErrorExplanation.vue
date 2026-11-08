<script setup>
import { computed } from 'vue'
import { explainRunError } from '@/utils/runErrors.js'

// "Likely cause / Fix" box under an SFMC query error (utils/runErrors.js).
// Shared by the failed Run step and the Validate panel (live test, 2026-11-07),
// so the same SFMC message gets the same explanation in both places.
const props = defineProps({
  message: { type: String, default: '' },
  sql:     { type: String, default: '' },
})

const explained = computed(() => explainRunError(props.message, props.sql))
</script>

<template>
  <div v-if="explained" class="w-full text-left text-[10px] leading-snug text-foreground bg-card border border-border rounded p-1.5 space-y-0.5" data-error-explanation>
    <div><b>Likely cause:</b> {{ explained.cause }}</div>
    <div v-if="explained.fix"><b>Fix:</b> {{ explained.fix }}</div>
    <ul v-if="explained.sqlHints.length" class="list-disc pl-4 text-muted-foreground">
      <li v-for="h in explained.sqlHints" :key="h">{{ h }}</li>
    </ul>
  </div>
</template>
