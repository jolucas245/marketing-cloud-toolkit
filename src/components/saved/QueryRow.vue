<script setup>
// One saved query in the list view: favourite star, name with the SQL on one line,
// what it reads, and when it was saved. Click opens the details panel; in delete
// mode the row selects instead.
import { computed } from 'vue'
import { Star } from 'lucide-vue-next'
import { queryDisplayName, queryTables, queryHasWhere, sqlOneLine } from './queryMeta.js'

const props = defineProps({
  query: { type: Object, required: true },
  active: { type: Boolean, default: false },
  deleteMode: { type: Boolean, default: false },
  isSelected: { type: Boolean, default: false },
})
const emit = defineEmits(['open', 'toggle-select', 'toggle-favourite'])

const name = computed(() => queryDisplayName(props.query))
const tables = computed(() => queryTables(props.query.queryText))
const filtered = computed(() => queryHasWhere(props.query.queryText))
const oneLine = computed(() => sqlOneLine(props.query.queryText))
const when = computed(() => {
  const d = props.query.timeStamp ? new Date(props.query.timeStamp) : null
  if (!d || Number.isNaN(d.getTime())) return null
  return {
    date: d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' }),
    time: d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' }),
  }
})

function activate() {
  if (props.deleteMode) emit('toggle-select', props.query.id)
  else emit('open', props.query.id)
}
</script>

<template>
  <div class="flex items-center gap-2.5 py-3 pr-4 pl-2.5 border-b border-border last:border-b-0 transition-colors"
    :class="active ? 'bg-primary/5 shadow-[inset_3px_0_0_hsl(var(--primary))]' : (deleteMode && isSelected ? 'bg-primary/5' : 'bg-card hover:bg-accent/50')">
    <input v-if="deleteMode" type="checkbox" class="h-4 w-4 mx-2.5 shrink-0 accent-primary cursor-pointer"
      :checked="isSelected" :aria-label="`Select ${name}`" @change="emit('toggle-select', query.id)" />
    <button v-else type="button" class="h-9 w-9 shrink-0 rounded-full flex items-center justify-center hover:bg-accent transition-colors"
      :class="query.isFavourite ? 'text-amber-500 dark:text-amber-400' : 'text-muted-foreground'"
      :aria-pressed="query.isFavourite" :title="query.isFavourite ? 'Remove from favourites' : 'Add to favourites'"
      aria-label="Favourite" @click="emit('toggle-favourite', query.id)">
      <Star class="h-[18px] w-[18px]" :fill="query.isFavourite ? 'currentColor' : 'none'" />
    </button>

    <button type="button" class="flex-1 min-w-0 flex flex-wrap items-center gap-x-4 gap-y-2 text-left cursor-pointer"
      :aria-expanded="deleteMode ? undefined : active" @click="activate">
      <span class="flex flex-col gap-1 min-w-0 flex-1 basis-64">
        <span class="text-[15px] font-semibold text-foreground truncate">{{ name }}</span>
        <code class="font-mono text-xs text-muted-foreground truncate">{{ oneLine || '(empty)' }}</code>
      </span>
      <span class="flex flex-col items-start gap-1 basis-[220px] shrink-0 min-w-0">
        <span v-if="tables.length" class="inline-flex max-w-full items-center rounded-md bg-primary/10 px-2 py-0.5 text-xs font-semibold font-mono text-primary truncate"
          :title="tables.join(', ')">
          <span class="truncate">Reads {{ tables[0] }}</span><span v-if="tables.length > 1" class="ml-1 shrink-0">+{{ tables.length - 1 }}</span>
        </span>
        <span class="flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
          <span v-if="query.businessUnit?.name" class="truncate max-w-[200px]" :title="`Business unit: ${query.businessUnit.name} (${query.businessUnit.accountId})`">{{ query.businessUnit.name }}</span>
          <span v-if="query.businessUnit?.name && filtered" aria-hidden="true">·</span>
          <span v-if="filtered">Filtered by WHERE</span>
        </span>
      </span>
      <span class="basis-[130px] shrink-0 text-[13px] text-foreground/80 leading-snug">
        <template v-if="when">{{ when.date }}<br><span class="text-xs text-muted-foreground">{{ when.time }}</span></template>
        <span v-else class="text-xs text-muted-foreground">Unknown date</span>
      </span>
    </button>
  </div>
</template>
