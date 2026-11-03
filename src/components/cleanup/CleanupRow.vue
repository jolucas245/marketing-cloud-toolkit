<script setup>
// One leftover in Settings > Clean up: tick box, kind icon, name, why it can go, date and age.
import { Workflow, Database } from 'lucide-vue-next'
import { formatDateTime } from '@/utils/format.js'
import { relativeAge } from './cleanupView.js'

defineProps({
  item: { type: Object, required: true },
  kind: { type: String, required: true }, // 'activity' | 'de'
  checked: { type: Boolean, default: false },
  disabled: { type: Boolean, default: false },
  age: { type: Number, default: null },
  reason: { type: Object, default: () => ({}) },
})
defineEmits(['toggle'])
</script>

<template>
  <label
    class="flex items-center gap-3.5 px-[18px] py-3 border-t border-border/70 cursor-pointer transition-colors"
    :class="checked ? 'bg-red-50 dark:bg-red-950/30' : 'bg-card hover:bg-muted/40'"
  >
    <input
      type="checkbox"
      class="h-[18px] w-[18px] shrink-0 accent-red-600"
      :checked="checked"
      :disabled="disabled"
      :aria-label="`Select ${item.name}`"
      @change="$emit('toggle')"
    />
    <span
      class="h-[34px] w-[34px] shrink-0 rounded-xl flex items-center justify-center"
      :class="kind === 'activity' ? 'bg-violet-50 text-violet-700 dark:bg-violet-950/40 dark:text-violet-300' : 'bg-teal-50 text-teal-700 dark:bg-teal-950/40 dark:text-teal-300'"
      aria-hidden="true"
    >
      <Workflow v-if="kind === 'activity'" class="h-[17px] w-[17px]" />
      <Database v-else class="h-[17px] w-[17px]" />
    </span>
    <span class="flex-1 min-w-0 flex flex-col gap-1">
      <span class="flex items-center gap-2 flex-wrap">
        <code class="font-mono text-[13px] text-foreground [overflow-wrap:anywhere]">{{ item.name }}</code>
        <span class="text-xs font-semibold px-2 py-0.5 rounded-md bg-muted text-muted-foreground whitespace-nowrap">{{ kind === 'activity' ? 'Query activity' : 'Data extension' }}</span>
      </span>
      <span v-if="kind === 'activity'" class="flex items-center gap-1.5 flex-wrap text-xs text-muted-foreground">
        <template v-if="reason.target">
          Writes to <code class="font-mono text-[11px] text-foreground/80 [overflow-wrap:anywhere]">{{ reason.target }}</code>
          <span class="text-xs font-semibold px-2 py-0.5 rounded-md bg-muted whitespace-nowrap">{{ reason.targetListed ? 'DE also listed' : 'DE not in this list' }}</span>
        </template>
        <template v-else>Created by Run Query; no target data extension recorded</template>
      </span>
      <span v-else class="text-xs text-muted-foreground [overflow-wrap:anywhere]">
        <template v-if="reason.writer">Results of <code class="font-mono text-[11px] text-foreground/80">{{ reason.writer }}</code> (listed above)</template>
        <template v-else>No toolkit activity points at it any more</template>
      </span>
    </span>
    <span class="shrink-0 basis-[170px] flex flex-col items-end gap-0.5 text-right">
      <span class="text-[13px]">{{ formatDateTime(item.createdDate || item.modifiedDate) || 'Date unknown' }}</span>
      <span v-if="age != null" class="text-xs text-muted-foreground">{{ relativeAge(age) }}</span>
    </span>
  </label>
</template>
