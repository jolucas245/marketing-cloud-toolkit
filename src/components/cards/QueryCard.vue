<script setup>
import { computed } from 'vue'
import { Star } from 'lucide-vue-next'

const props = defineProps({
  id:           String,
  queryText:    String,
  timeStamp:    [Date, Number],
  url:          String,
  name:         String,
  isFavourite:  Boolean,
  businessUnit: { type: Object, default: null },
  deleteMode:   { type: Boolean, default: false },
  isSelected:   { type: Boolean, default: false },
  size:         { type: String, default: 'compact' },  // 'compact' | 'large'
  active:       { type: Boolean, default: false },
})

const emit = defineEmits(['toggle-select', 'toggle-favourite', 'open-preview'])

const humanReadableDate = computed(() =>
  props.timeStamp ? new Date(props.timeStamp).toLocaleString() : 'Unknown date'
)
const displayName = computed(() => props.name ?? humanReadableDate.value)

const previewSql = computed(() => {
  if (!props.queryText) return ''
  return props.queryText.split('\n').slice(0, props.size === 'large' ? 40 : 18).join('\n')
})
</script>

<template>
  <div>
    <div
      class="relative rounded-[14px] border bg-card overflow-hidden cursor-pointer outline-none transition-all duration-150"
      :style="{ width: size === 'large' ? '460px' : '300px' }"
      :class="{
        'border-primary ring-2 ring-primary/30': (deleteMode && isSelected) || (!deleteMode && active),
        'border-border': !(deleteMode && isSelected) && !(!deleteMode && active),
        'hover:-translate-y-0.5 hover:shadow-md focus-visible:ring-2 focus-visible:ring-primary/40': !deleteMode,
      }"
      @click="deleteMode ? emit('toggle-select', props.id) : emit('open-preview', props.id)"
      role="button"
      tabindex="0"
      @keyup.enter="deleteMode ? emit('toggle-select', props.id) : emit('open-preview', props.id)"
      @keyup.space.prevent="deleteMode ? emit('toggle-select', props.id) : emit('open-preview', props.id)"
      :title="deleteMode ? (isSelected ? 'Deselect' : 'Select') : `${displayName}: click to open`"
    >
      <!-- Selection checkbox overlay (delete mode only) -->
      <div v-if="deleteMode" class="absolute top-2 right-2 z-10">
        <input
          type="checkbox"
          class="h-4 w-4 cursor-pointer accent-primary"
          :checked="isSelected"
          readonly
          @click.stop="emit('toggle-select', props.id)"
        />
      </div>

      <!-- Card header -->
      <div class="px-3 py-2 border-b border-border flex flex-col gap-1">
        <div class="flex items-center gap-1 min-w-0">
          <span class="text-[13px] font-semibold text-foreground truncate flex-1 min-w-0">
            {{ displayName }}
          </span>
          <button v-if="!deleteMode"
            class="shrink-0 transition-colors p-0.5 rounded"
            :class="isFavourite ? 'text-amber-500 dark:text-amber-400' : 'text-muted-foreground/50 hover:text-amber-500'"
            title="Toggle favourite"
            @click.stop="emit('toggle-favourite', props.id)"
          >
            <Star class="h-3.5 w-3.5" :fill="isFavourite ? 'currentColor' : 'none'" />
          </button>
        </div>
        <span v-if="businessUnit?.name"
          class="inline-block self-start text-[11px] font-semibold text-primary bg-primary/10 rounded-md px-1.5 py-px truncate max-w-full"
          :title="`BU: ${businessUnit.name} (${businessUnit.accountId})`">
          {{ businessUnit.name }}
        </span>
      </div>

      <!-- SQL preview (dark code area) -->
      <div class="bg-[#0f172a] overflow-hidden p-2.5" :style="{ height: size === 'large' ? '420px' : '210px' }">
        <pre class="sql-preview font-mono leading-relaxed text-slate-300 whitespace-pre overflow-hidden m-0 pointer-events-none" :class="size === 'large' ? 'text-[12px]' : 'text-[11px]'">{{ previewSql }}</pre>
      </div>
    </div>
  </div>
</template>

<style scoped>
/* Fade-to-transparent mask on SQL preview - can't be done with Tailwind */
.sql-preview {
  -webkit-mask-image: linear-gradient(to bottom, black 75%, transparent 100%);
  mask-image: linear-gradient(to bottom, black 75%, transparent 100%);
}
</style>
