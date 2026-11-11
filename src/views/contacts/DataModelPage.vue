<script setup>
// Contacts > Data model (user, 2026-11-10): Contact Builder's Data Designer, read only.
// Each attribute group with its attribute sets (data extensions), how they link (fields
// and cardinality) and a diagram; sets no group reaches are listed apart. Changes are
// made in Contact Builder's Data Designer. Calls and what is unverified: utils/dataModel.js.
import { computed, ref } from 'vue'
import { Loader2, RefreshCw, ExternalLink, ChevronDown, ChevronRight } from 'lucide-vue-next'
import Button from '@/components/ui/button/Button.vue'
import SfmcErrorNotice from '@/components/results/SfmcErrorNotice.vue'
import DataTable from '@/components/results/DataTable.vue'
import DownloadMenu from '@/components/results/DownloadMenu.vue'
import { useStack, whenStack } from '@/composables/useStack.js'
import { searchError } from '@/utils/sfmcErrors.js'
import { fetchDataModel, linksOfSet, groupSvg } from '@/utils/dataModel.js'

const { stack } = useStack()
const model = ref(null)
const busy = ref(false)
const error = ref(null)
const open = ref(new Set())
const view = ref('list') // list | diagram
async function load() {
  busy.value = true
  error.value = null
  try {
    model.value = await fetchDataModel(stack.value)
    open.value = new Set(model.value.groups.slice(0, 1).map((g) => g.id))
  } catch (e) { error.value = searchError(e, 'read the data model') } finally { busy.value = false }
}
whenStack(load)

const toggle = (id) => { const s = new Set(open.value); s.has(id) ? s.delete(id) : s.add(id); open.value = s }
const yesNo = (v) => (v ? 'Yes' : 'No')
const rowsOf = (sets, links) => sets.map((s) => ({ ...s, rootText: yesNo(s.root), sendableText: yesNo(s.sendable), linksText: linksOfSet(s, links).join('; ') }))
const columns = [
  { key: 'name', label: 'Attribute set' }, { key: 'linksText', label: 'Relationships' }, { key: 'rootText', label: 'Root' },
  { key: 'sendableText', label: 'Sendable' }, { key: 'storage', label: 'Storage' }, { key: 'key', label: 'Key', hidden: true },
  { key: 'fullyQualifiedName', label: 'Full name', hidden: true }, { key: 'fieldCount', label: 'Attributes', hidden: true }, { key: 'id', label: 'ID', hidden: true },
]
const groups = computed(() => (model.value?.groups || []).map((g) => ({ ...g, rows: rowsOf(g.sets, g.links) })))
const unplacedRows = computed(() => rowsOf(model.value?.unplaced || [], model.value?.relationships || []))
const svgs = computed(() => Object.fromEntries(view.value === 'diagram' ? groups.value.filter((g) => open.value.has(g.id) && g.sets.length).map((g) => [g.id, groupSvg(g)]) : []))
const designerUrl = computed(() => `https://mc.${stack.value}.marketingcloudapps.com/contactsmeta/admin.html`)

const tableBlock = (rows) => ({ type: 'table', columns: columns.map((c) => c.label), rows: rows.map((r) => columns.map((c) => String(r[c.key] ?? ''))) })
const getDoc = () => {
  const blocks = []
  for (const g of groups.value) {
    blocks.push({ type: 'h', level: 2, text: g.name })
    if (g.sets.length) blocks.push({ type: 'svg', svg: groupSvg(g) })
    blocks.push(tableBlock(g.rows))
  }
  if (unplacedRows.value.length) blocks.push({ type: 'h', level: 2, text: 'Attribute sets in no attribute group' }, tableBlock(unplacedRows.value))
  return { title: 'Data model', blocks }
}
</script>

<template>
  <div class="p-4 space-y-4 max-w-7xl" data-data-model>
    <div class="flex flex-wrap items-center gap-2">
      <h1 class="text-lg font-semibold">Data model</h1>
      <span class="text-xs text-muted-foreground">Contact Builder's attribute groups and how their data extensions link. Read only: change it in Data Designer.</span>
      <div class="flex-1" />
      <div class="flex gap-0.5 border border-border rounded-md p-0.5 text-xs" role="group" aria-label="View">
        <button v-for="[k, l] in [['list', 'List'], ['diagram', 'Diagram']]" :key="k" type="button" class="px-2 py-0.5 rounded" :class="view === k ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-accent'" :aria-pressed="view === k" :data-view="k" @click="view = k">{{ l }}</button>
      </div>
      <a :href="designerUrl" target="_blank" rel="noopener" class="inline-flex items-center gap-1 text-xs text-primary hover:underline"><ExternalLink class="h-3.5 w-3.5" /> Open Contact Builder</a>
      <DownloadMenu :get-doc="getDoc" file-name="data-model" :disabled="!model" />
      <Button variant="outline" size="sm" class="gap-1" :disabled="busy" @click="load"><Loader2 v-if="busy" class="h-3.5 w-3.5 animate-spin" /><RefreshCw v-else class="h-3.5 w-3.5" /> Refresh</Button>
    </div>
    <SfmcErrorNotice v-if="error" :error="error" :retrying="busy" @retry="load" />
    <div v-if="busy && !model" class="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 class="h-4 w-4 animate-spin" /> Reading the data model (attribute sets 50 at a time)…</div>
    <template v-if="model">
      <p class="text-xs text-muted-foreground">
        {{ model.groups.length }} attribute groups, {{ model.sets.length }} attribute sets, {{ model.relationships.length }} relationships.
        <template v-if="!model.groupSource"> SFMC did not list the attribute groups, so they are named by their ID from the relationships.</template>
      </p>
      <section v-for="g in groups" :key="g.id" class="rounded-lg border border-border bg-card" :data-group="g.id">
        <button type="button" class="w-full flex items-center gap-2 px-3 py-2 text-left" :aria-expanded="open.has(g.id)" @click="toggle(g.id)">
          <ChevronDown v-if="open.has(g.id)" class="h-4 w-4" /><ChevronRight v-else class="h-4 w-4" />
          <span class="font-semibold text-sm">{{ g.name }}</span>
          <span class="text-xs text-muted-foreground">{{ g.sets.length }} attribute sets</span>
        </button>
        <template v-if="open.has(g.id)">
          <div v-if="view === 'diagram'" class="border-t border-border p-3 overflow-auto bg-white rounded-b-lg">
            <!-- eslint-disable-next-line vue/no-v-html -- built by groupSvg, every value escaped -->
            <div v-if="svgs[g.id]" v-html="svgs[g.id]" />
            <p v-else class="text-xs text-slate-600">No attribute sets linked to this group.</p>
          </div>
          <div v-else class="border-t border-border">
            <DataTable :columns="columns" :rows="g.rows" storage-key="data-model" empty-text="No attribute sets linked to this group." />
          </div>
        </template>
      </section>
      <section v-if="unplacedRows.length" class="rounded-lg border border-border bg-card">
        <div class="px-3 py-2 border-b border-border text-sm font-semibold">Attribute sets in no attribute group <span class="text-xs font-normal text-muted-foreground">{{ unplacedRows.length }}</span></div>
        <DataTable :columns="columns" :rows="unplacedRows" storage-key="data-model" empty-text="None." />
      </section>
    </template>
  </div>
</template>
