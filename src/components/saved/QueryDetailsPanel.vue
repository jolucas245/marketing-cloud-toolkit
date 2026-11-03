<script setup>
// Details of one saved query, shown beside the list: name, when it was saved, what it
// reads, the actions (Open in editor, Open in Query Builder, Copy SQL, Share, Explain)
// and the SQL with line numbers. Replaces the old preview dialog.
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { Copy, Check, ExternalLink, X, Share2, Blocks, Star } from 'lucide-vue-next'
import ShareQueryDialog from '@/components/workspace/ShareQueryDialog.vue'
import CodeView from '@/components/results/CodeView.vue'
import AiButton from '@/components/ai/AiButton.vue'
import AskAiDialog from '@/components/ai/AskAiDialog.vue'
import { useAi } from '@/composables/useAi.js'
import { AI_TEXT_SYSTEM, buildAiTaskPrompt } from '@/utils/aiAssist.js'
import { SHARE_SETTING, shareAllowed } from '@/utils/share.js'
import { useStoredSetting } from '@/composables/useStoredSetting.js'
import { extractSelectColumns } from '@/utils/sqlParser.js'
import { queryDisplayName, queryTables, queryHasWhere } from './queryMeta.js'

const props = defineProps({
  card: { type: Object, required: true },
})
const emit = defineEmits(['close', 'open-editor', 'open-builder', 'toggle-favourite'])

const savedAt = computed(() => (props.card.timeStamp ? new Date(props.card.timeStamp).toLocaleString() : 'Unknown date'))
const displayName = computed(() => queryDisplayName(props.card))
const sql = computed(() => props.card.queryText || '')
const tables = computed(() => queryTables(sql.value))
const filtered = computed(() => queryHasWhere(sql.value))
// Only for the open query: the full parser is too slow to run on every row.
const fieldCount = computed(() => { try { return extractSelectColumns(sql.value).length } catch { return 0 } })

// Explain this query (feedback #1029, experimental).
const ai = useAi()
const explainOpen = ref(false)

const copied = ref(false)
async function copySql() {
  try {
    await navigator.clipboard.writeText(sql.value)
  } catch {
    // Fallback for environments without the async clipboard API
    const ta = document.createElement('textarea')
    ta.value = sql.value
    ta.style.position = 'fixed'
    ta.style.opacity = '0'
    document.body.appendChild(ta)
    ta.select()
    try { document.execCommand('copy') } catch { /* ignore */ }
    document.body.removeChild(ta)
  }
  copied.value = true
  setTimeout(() => { copied.value = false }, 1500)
}

// Share: only when turned on in Settings and allowed by policy; the dialog shows what is sent.
const shareOpen = ref(false)
const { value: shareSetting } = useStoredSetting(SHARE_SETTING, true, (v) => v !== false)
const canShare = computed(() => shareAllowed(shareSetting.value) && !!sql.value.trim())

// Esc closes the panel, unless a dialog on top of it is open.
function onKey(e) {
  if (e.key !== 'Escape' || shareOpen.value || explainOpen.value) return
  if (document.querySelector('[role="dialog"]')) return
  emit('close')
}
onMounted(() => window.addEventListener('keydown', onKey))
onUnmounted(() => window.removeEventListener('keydown', onKey))

const pill = 'inline-flex items-center gap-1.5 h-9 px-3.5 rounded-full border border-border bg-card text-sm font-medium text-foreground hover:bg-accent transition-colors whitespace-nowrap'
</script>

<template>
  <aside aria-label="Query details" class="flex flex-col min-h-0 bg-card">
    <div class="px-5 py-4 flex flex-col gap-3 border-b border-border shrink-0">
      <div class="flex items-start justify-between gap-2.5">
        <div class="min-w-0 flex flex-col gap-1">
          <h2 class="m-0 text-xl font-bold text-foreground break-words">{{ displayName }}</h2>
          <span class="text-xs text-muted-foreground">Saved {{ savedAt }}</span>
        </div>
        <div class="flex items-center gap-1.5 shrink-0">
          <button type="button" class="h-[34px] w-[34px] rounded-full border border-border bg-card flex items-center justify-center hover:bg-accent transition-colors"
            :class="card.isFavourite ? 'text-amber-500 dark:text-amber-400' : 'text-muted-foreground'"
            :aria-pressed="card.isFavourite" :title="card.isFavourite ? 'Remove from favourites' : 'Add to favourites'"
            aria-label="Favourite" @click="emit('toggle-favourite', card.id)">
            <Star class="h-4 w-4" :fill="card.isFavourite ? 'currentColor' : 'none'" />
          </button>
          <button type="button" class="h-[34px] w-[34px] rounded-full border border-border bg-card text-muted-foreground flex items-center justify-center hover:bg-accent hover:text-foreground transition-colors"
            title="Close (Esc)" aria-label="Close" @click="emit('close')">
            <X class="h-4 w-4" />
          </button>
        </div>
      </div>

      <div class="flex flex-wrap gap-1.5">
        <span v-if="card.businessUnit?.name" class="inline-flex items-center rounded-md bg-muted px-2 py-0.5 text-xs font-semibold text-foreground/80 max-w-full truncate"
          :title="`Business unit: ${card.businessUnit.name} (${card.businessUnit.accountId})`">{{ card.businessUnit.name }}</span>
        <span v-for="t in tables" :key="t" class="inline-flex items-center rounded-md bg-primary/10 px-2 py-0.5 text-xs font-semibold font-mono text-primary max-w-full truncate">Reads {{ t }}</span>
        <span v-if="fieldCount" class="inline-flex items-center rounded-md bg-muted px-2 py-0.5 text-xs font-semibold text-foreground/80">{{ fieldCount }} {{ fieldCount === 1 ? 'field' : 'fields' }}</span>
        <span v-if="filtered" class="inline-flex items-center rounded-md bg-muted px-2 py-0.5 text-xs font-semibold text-foreground/80">Filtered by WHERE</span>
      </div>

      <div class="flex flex-wrap items-center gap-2">
        <button type="button" class="inline-flex items-center gap-1.5 h-9 px-4 rounded-full bg-primary text-primary-foreground text-sm font-semibold hover:bg-primary/90 transition-colors"
          title="Open in the full editor to validate or run this query" @click="emit('open-editor', card.id)">
          <ExternalLink class="h-3.5 w-3.5" /> Open in editor
        </button>
        <button v-if="card.source !== 'builder' && sql.trim()" type="button" :class="pill"
          title="Draw this query as tables and joins in the Query Builder" @click="emit('open-builder', card)">
          <Blocks class="h-3.5 w-3.5" /> Open in Query Builder
        </button>
        <button type="button" :class="[pill, copied && 'border-emerald-300 text-emerald-700 bg-emerald-50 dark:bg-emerald-950/40 dark:text-emerald-400 dark:border-emerald-700']" @click="copySql">
          <component :is="copied ? Check : Copy" class="h-3.5 w-3.5" /> {{ copied ? 'Copied' : 'Copy SQL' }}
        </button>
        <button v-if="canShare" type="button" :class="pill"
          title="Share: create a link anyone can open for 24 hours (you see what is sent first)" @click="shareOpen = true">
          <Share2 class="h-3.5 w-3.5" /> Share
        </button>
        <AiButton label="Explain" :disabled="!sql.trim()" title="Explain this query in plain words (experimental, Gemini Nano in Chrome)" @click="explainOpen = true" />
      </div>
    </div>

    <div class="flex-1 min-h-0 overflow-auto bg-[#0f172a] p-2">
      <CodeView v-if="sql.trim()" :key="card.id" :code="sql" lang="sql" max-height="none" />
      <p v-else class="p-3 text-xs text-slate-400">This query has no SQL.</p>
    </div>

    <ShareQueryDialog :open="shareOpen" :name="displayName" :sql="sql" @close="shareOpen = false" />
    <AskAiDialog v-if="ai.shown.value" :open="explainOpen" title="Explain this query" :system="AI_TEXT_SYSTEM"
      :prompt="(extra) => buildAiTaskPrompt('explainQuery', { sql, name: displayName }) + (extra.trim() ? `\n\nAlso answer: ${extra.trim()}` : '')"
      extra-label="Anything else to ask about it?" @close="explainOpen = false" />
  </aside>
</template>
