<script setup>
// Settings > Clean up (feedback #30, redesign #1031): lists the data extensions and Query
// activities Run Query created in SFMC (named SFMCQS_...) and deletes the ticked ones
// after an inline confirm. Names are checked again in deleteToolkitObjects.
import ReportErrorButton from '@/components/results/ReportErrorButton.vue'
import { computed, ref, watch } from 'vue'
import { Loader2, Trash2, Brush, Workflow, Database, Clock, RefreshCw, TriangleAlert } from 'lucide-vue-next'
import CleanupRow from '@/components/cleanup/CleanupRow.vue'
import { ageDays, reasons } from '@/components/cleanup/cleanupView.js'
import { useStack, whenStack } from '@/composables/useStack.js'
import { showToast } from '@/composables/useToast.js'
import { listToolkitDEs, listToolkitQueryActivities, deleteToolkitObjects, TOOLKIT_PREFIX } from '@/utils/cleanup.js'

const OLD_DAYS = 7

const { stack } = useStack()
const loading = ref(false)
const loaded = ref(false)
const error = ref('')
const des = ref([])
const activities = ref([])
const ticked = ref(new Set()) // `de:<id>` / `activity:<id>`
const confirming = ref(false)
const deleting = ref(false)
const progress = ref({ done: 0, total: 0 })
const failures = ref([])
const now = ref(Date.now())

const keyOf = (kind, item) => `${kind}:${item.id}`
const why = computed(() => reasons(activities.value, des.value))
const sections = computed(() => [
  { kind: 'activity', title: 'Query activities', items: activities.value, empty: `No Query activities named ${TOOLKIT_PREFIX}.` },
  { kind: 'de', title: 'Data extensions', items: des.value, empty: `No data extensions named ${TOOLKIT_PREFIX}.` },
])
const allItems = computed(() => [
  ...activities.value.map((it) => ({ kind: 'activity', it })),
  ...des.value.map((it) => ({ kind: 'de', it })),
])
const ages = computed(() => {
  const m = new Map()
  allItems.value.forEach(({ kind, it }) => m.set(keyOf(kind, it), ageDays(it, now.value)))
  return m
})
const oldKeys = computed(() => [...ages.value].filter(([, d]) => d != null && d > OLD_DAYS).map(([k]) => k))
const tickedCount = computed(() => ticked.value.size)
const everythingTicked = computed(() => allItems.value.length > 0 && tickedCount.value === allItems.value.length)
const stats = computed(() => [
  { label: 'toolkit leftovers', value: allItems.value.length, icon: Brush, tone: 'bg-orange-50 text-orange-700 dark:bg-orange-950/40 dark:text-orange-300' },
  { label: 'query activities', value: activities.value.length, icon: Workflow, tone: 'bg-violet-50 text-violet-700 dark:bg-violet-950/40 dark:text-violet-300' },
  { label: 'data extensions', value: des.value.length, icon: Database, tone: 'bg-teal-50 text-teal-700 dark:bg-teal-950/40 dark:text-teal-300' },
  { label: `older than ${OLD_DAYS} days`, value: oldKeys.value.length, icon: Clock, tone: 'bg-muted text-muted-foreground' },
])
const confirmText = computed(() => {
  const a = activities.value.filter((x) => ticked.value.has(keyOf('activity', x))).length
  const d = des.value.filter((x) => ticked.value.has(keyOf('de', x))).length
  const parts = [a && `${a} Query activit${a === 1 ? 'y' : 'ies'}`, d && `${d} data extension${d === 1 ? '' : 's'}`].filter(Boolean)
  return `Delete ${parts.join(' and ')}?`
})

// A changed selection needs a fresh confirm.
watch(ticked, () => { confirming.value = false })

async function load() {
  if (!stack.value) { error.value = 'Not connected to Marketing Cloud. Log in to SFMC in this browser.'; return }
  loading.value = true
  error.value = ''
  failures.value = []
  confirming.value = false
  try {
    const [a, d] = await Promise.all([listToolkitQueryActivities(stack.value), listToolkitDEs(stack.value)])
    activities.value = a
    des.value = d
    ticked.value = new Set()
    now.value = Date.now()
    loaded.value = true
  } catch (e) {
    error.value = `Could not list what Run Query created: ${e.message}`
  } finally {
    loading.value = false
  }
}

function toggle(kind, item) {
  const next = new Set(ticked.value)
  const k = keyOf(kind, item)
  next.has(k) ? next.delete(k) : next.add(k)
  ticked.value = next
}

function allTicked(section) {
  return section.items.length > 0 && section.items.every((it) => ticked.value.has(keyOf(section.kind, it)))
}

function toggleSection(section) {
  const next = new Set(ticked.value)
  const on = !allTicked(section)
  section.items.forEach((it) => (on ? next.add(keyOf(section.kind, it)) : next.delete(keyOf(section.kind, it))))
  ticked.value = next
}

function toggleEverything() {
  ticked.value = everythingTicked.value ? new Set() : new Set(allItems.value.map(({ kind, it }) => keyOf(kind, it)))
}

function selectOld() {
  ticked.value = new Set(oldKeys.value)
}

function askDelete() {
  if (tickedCount.value && !deleting.value) confirming.value = true
}

async function deleteTicked() {
  const pickA = activities.value.filter((a) => ticked.value.has(keyOf('activity', a)))
  const pickD = des.value.filter((d) => ticked.value.has(keyOf('de', d)))
  confirming.value = false
  if (!pickA.length && !pickD.length) return
  deleting.value = true
  failures.value = []
  progress.value = { done: 0, total: pickA.length + pickD.length }
  try {
    const r = await deleteToolkitObjects(stack.value, { activities: pickA, des: pickD }, (done, total) => { progress.value = { done, total } })
    const gone = new Set(r.deleted.map((x) => keyOf(x.kind, x)))
    activities.value = activities.value.filter((a) => !gone.has(keyOf('activity', a)))
    des.value = des.value.filter((d) => !gone.has(keyOf('de', d)))
    ticked.value = new Set([...ticked.value].filter((k) => !gone.has(k)))
    failures.value = r.failed
    showToast(r.failed.length ? `Deleted ${r.deleted.length}; ${r.failed.length} could not be deleted.` : `Deleted ${r.deleted.length}.`)
  } catch (e) {
    showToast(`Delete stopped: ${e.message}`)
  } finally {
    deleting.value = false
  }
}

whenStack(load)
</script>

<template>
  <div class="h-full overflow-y-auto bg-background">
    <div class="max-w-[1060px] px-7 pt-6 pb-10 flex flex-col gap-4">
      <header class="flex flex-col gap-1.5">
        <div class="flex items-center gap-3">
          <span class="h-10 w-10 shrink-0 rounded-xl bg-orange-50 text-orange-700 dark:bg-orange-950/40 dark:text-orange-300 flex items-center justify-center" aria-hidden="true">
            <Brush class="h-5 w-5" />
          </span>
          <h1 class="text-2xl font-bold">Clean up toolkit runs</h1>
        </div>
        <p class="text-sm text-muted-foreground max-w-[760px]">
          Run Query (and SFMC Query Saver) leave a query activity and a result data extension behind in this business unit.
          Only items named <code class="font-mono text-xs text-foreground">{{ TOOLKIT_PREFIX }}...</code> are listed, so nothing else can be picked by mistake.
          Saved queries and their run history in the Toolkit are kept.
        </p>
      </header>

      <p v-if="error" class="rounded-xl border border-red-200 bg-red-50 text-red-700 dark:border-red-900 dark:bg-red-950/30 dark:text-red-300 px-4 py-3 text-sm" role="alert">{{ error }}<ReportErrorButton /></p>

      <div v-if="loaded" class="grid gap-3 [grid-template-columns:repeat(auto-fit,minmax(200px,1fr))]">
        <div v-for="s in stats" :key="s.label" class="rounded-[14px] border border-border bg-card px-4 py-3.5 flex items-center gap-3">
          <span class="h-[34px] w-[34px] shrink-0 rounded-xl flex items-center justify-center" :class="s.tone" aria-hidden="true">
            <component :is="s.icon" class="h-[17px] w-[17px]" />
          </span>
          <div class="flex flex-col">
            <span class="text-[22px] font-bold leading-[26px]">{{ s.value.toLocaleString() }}</span>
            <span class="text-xs text-muted-foreground">{{ s.label }}</span>
          </div>
        </div>
      </div>

      <div class="rounded-[14px] border border-border bg-card px-4 py-3 flex flex-wrap items-center gap-2.5">
        <button
          type="button"
          class="h-9 inline-flex items-center gap-1.5 px-3.5 rounded-full border border-border bg-card text-[13px] font-medium hover:bg-accent disabled:opacity-50 disabled:cursor-not-allowed"
          :disabled="!loaded || deleting || !oldKeys.length"
          @click="selectOld"
        >
          <Clock class="h-3.5 w-3.5" /> Select everything older than {{ OLD_DAYS }} days
        </button>
        <button
          type="button"
          class="h-9 px-3.5 rounded-full border border-border bg-card text-[13px] font-medium hover:bg-accent disabled:opacity-50 disabled:cursor-not-allowed"
          :disabled="!allItems.length || deleting"
          @click="toggleEverything"
        >
          {{ everythingTicked ? 'Clear selection' : 'Select all' }}
        </button>
        <span class="text-[13px] text-muted-foreground" aria-live="polite">{{ tickedCount ? `${tickedCount.toLocaleString()} selected` : 'Nothing selected' }}</span>
        <span class="ml-auto flex flex-wrap gap-2">
          <button
            type="button"
            class="h-9 inline-flex items-center gap-1.5 px-3.5 rounded-full border border-border bg-card text-sm font-medium whitespace-nowrap hover:bg-accent disabled:opacity-50 disabled:cursor-not-allowed"
            :disabled="loading || deleting"
            @click="load"
          >
            <Loader2 v-if="loading" class="h-4 w-4 animate-spin" /><RefreshCw v-else class="h-4 w-4" /> Find again
          </button>
          <button
            type="button"
            class="h-9 inline-flex items-center gap-1.5 px-4 rounded-full text-[13px] font-semibold whitespace-nowrap"
            :class="tickedCount && !deleting ? 'bg-red-700 text-white hover:bg-red-800' : 'bg-muted text-muted-foreground cursor-not-allowed'"
            :disabled="!tickedCount || deleting"
            @click="askDelete"
          >
            <Loader2 v-if="deleting" class="h-3.5 w-3.5 animate-spin" /><Trash2 v-else class="h-3.5 w-3.5" />
            {{ deleting ? `Deleting ${progress.done} of ${progress.total}` : tickedCount ? `Delete ${tickedCount.toLocaleString()} selected` : 'Delete selected' }}
          </button>
        </span>
      </div>

      <div
        v-if="confirming && tickedCount && !deleting"
        role="alertdialog"
        aria-label="Confirm delete"
        class="flex flex-wrap items-center gap-3 px-4 py-3.5 rounded-xl border border-red-200 bg-red-50 text-red-800 dark:border-red-900 dark:bg-red-950/40 dark:text-red-200"
      >
        <TriangleAlert class="h-[18px] w-[18px] shrink-0" aria-hidden="true" />
        <span class="text-sm"><span class="font-bold">{{ confirmText }}</span> This cannot be undone in Marketing Cloud.</span>
        <span class="ml-auto flex gap-2">
          <button type="button" class="h-[34px] px-3.5 rounded-full border border-red-200 bg-white text-red-800 text-[13px] font-semibold dark:border-red-800 dark:bg-transparent dark:text-red-200" @click="confirming = false">Cancel</button>
          <button type="button" class="h-[34px] px-4 rounded-full bg-red-700 hover:bg-red-800 text-white text-[13px] font-semibold" @click="deleteTicked">Delete</button>
        </span>
      </div>

      <div v-if="failures.length" class="rounded-xl border border-red-200 bg-red-50 dark:border-red-900 dark:bg-red-950/30 px-4 py-3 text-xs" role="alert">
        <div class="font-semibold mb-1">Not deleted</div>
        <ul class="space-y-0.5"><li v-for="f in failures" :key="f.item.kind + f.item.id">{{ f.item.name }}: {{ f.error }}</li></ul>
      </div>

      <p v-if="loading && !loaded" class="text-sm text-muted-foreground flex items-center gap-2"><Loader2 class="h-4 w-4 animate-spin" /> Finding what Run Query created...</p>

      <section v-for="s in sections" v-show="loaded" :key="s.kind" class="rounded-[14px] border border-border bg-card overflow-hidden">
        <div class="flex items-center gap-2.5 px-[18px] py-3">
          <input
            type="checkbox"
            class="h-4 w-4 accent-red-600"
            :checked="allTicked(s)"
            :disabled="!s.items.length || deleting"
            :aria-label="`Select every ${s.title.toLowerCase()} item`"
            @change="toggleSection(s)"
          />
          <h2 class="text-[15px] font-bold">{{ s.title }}</h2>
          <span class="text-xs font-semibold px-2 py-0.5 rounded-md bg-muted text-muted-foreground">{{ s.items.length.toLocaleString() }}</span>
        </div>
        <CleanupRow
          v-for="it in s.items"
          :key="it.id"
          :item="it"
          :kind="s.kind"
          :checked="ticked.has(keyOf(s.kind, it))"
          :disabled="deleting"
          :age="ages.get(keyOf(s.kind, it))"
          :reason="s.kind === 'activity' ? why.activity(it) : why.de(it)"
          @toggle="toggle(s.kind, it)"
        />
        <p v-if="!s.items.length" class="px-[18px] py-4 border-t border-border/70 text-center text-sm text-muted-foreground">{{ s.empty }}</p>
      </section>
    </div>
  </div>
</template>
