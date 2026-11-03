<script setup>
// An "Ask AI" style button (feedback #1029). Shown only when AI is on in Settings,
// not turned off by policy, and Chrome's built-in model can run here (useAi).
import { Sparkles } from 'lucide-vue-next'
import Button from '@/components/ui/button/Button.vue'
import { useAi } from '@/composables/useAi.js'

defineProps({
  label: { type: String, default: 'Ask AI' },
  title: { type: String, default: 'Experimental: Gemini Nano in Chrome, on this computer' },
  size: { type: String, default: 'md' }, // md | sm | link
  disabled: { type: Boolean, default: false },
})
defineEmits(['click'])
const { shown } = useAi()
</script>

<template>
  <template v-if="shown">
    <button v-if="size === 'link'" type="button" class="inline-flex items-center gap-1 text-xs text-primary hover:underline disabled:opacity-60 shrink-0" :disabled="disabled" :title="title" @click="$emit('click')">
      <Sparkles class="h-3 w-3" /> {{ label }}
    </button>
    <Button v-else variant="outline" size="sm" :class="size === 'sm' ? 'h-6 text-[10px] px-1.5' : 'h-8 text-xs'" :disabled="disabled" :title="title" @click="$emit('click')">
      <Sparkles :class="size === 'sm' ? 'h-3 w-3 mr-0.5' : 'h-3.5 w-3.5 mr-1'" class="text-primary" /> {{ label }}
    </Button>
  </template>
</template>
