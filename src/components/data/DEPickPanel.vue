<script setup>
// A data extension picked from its folders, right on the page (Email validation, user
// 2026-11-06, in place of the Choose data extension dialog): the Query Builder's tree and
// search on the left, the picked DE's properties (rows, sendable and its relationship,
// retention, key, folder, dates) and fields on the right. With `sendableOnly`, the tree
// leaves out DEs SFMC's list marks not sendable, and a DE the list says nothing about is
// refused when picked if its record says it is not sendable.
import { ref, watch } from 'vue'
import { Loader2, ExternalLink } from 'lucide-vue-next'
import DEBrowser from '@/components/builder/DEBrowser.vue'
import { fetchDEDetail, fetchDEFieldList, fetchDEFolderPath, fieldTypeLabel, deContactBuilderUrl } from '@/utils/deApi.js'
import { deProperties } from '@/utils/deProperties.js'

const props = defineProps({
  stack: { type: String, default: null },
  sendableOnly: { type: Boolean, default: false },
  notSendableMessage: { type: String, default: 'Pick a sendable data extension.' },
  disabled: { type: Boolean, default: false },
})
// pick: { de: { id, name, key, customerKey }, detail }
const emit = defineEmits(['pick'])

const de = ref(null)
const detail = ref(null)
const fields = ref(null)
const folderPath = ref('')
const loading = ref(false)
const error = ref('')
const fieldsError = ref('')
let token = 0

async function choose(node) {
  if (props.disabled || node.isDataView) return
  const mine = ++token
  de.value = { id: node.id, name: node.name, key: node.key || node.customerKey || '', customerKey: node.key || node.customerKey || '' }
  detail.value = null
  fields.value = null
  folderPath.value = ''
  error.value = ''
  fieldsError.value = ''
  loading.value = true
  // The fields load alongside the record (cached, so the page's own read reuses them).
  fetchDEFieldList(props.stack, node.id)
    .then((f) => { if (mine === token) fields.value = f })
    .catch((e) => { if (mine === token) fieldsError.value = e.message })
  try {
    const d = await fetchDEDetail(props.stack, node.id)
    if (mine !== token) return
    detail.value = d
    const key = de.value.key || d?.customerKey || d?.key || ''
    de.value = { ...de.value, key, customerKey: key }
    if (props.sendableOnly && d?.isSendable === false) {
      error.value = `${node.name} is not sendable. ${props.notSendableMessage}`
      return
    }
    if (!key) throw new Error('SFMC sent no customer key for this data extension')
    emit('pick', { de: de.value, detail: d })
    if (d?.categoryId != null) {
      fetchDEFolderPath(props.stack, d.categoryId).then((p) => { if (mine === token) folderPath.value = p }).catch(() => {})
    }
  } catch (e) {
    if (mine === token) error.value = `Could not read ${node.name}: ${e.message}`
  } finally {
    if (mine === token) loading.value = false
  }
}

watch(() => props.stack, () => { token++; de.value = null; detail.value = null; fields.value = null; error.value = '' })
</script>

<template>
  <div class="grid gap-3 md:[grid-template-columns:minmax(240px,340px)_1fr]" data-de-pick-panel>
    <div class="h-80 overflow-hidden rounded-lg border border-border" :class="disabled ? 'pointer-events-none opacity-60' : ''">
      <DEBrowser :stack="stack" :selected-ids="de ? [de.id] : []" hide-data-views :sendable-only="sendableOnly" selected-label="selected" class="h-full" @select-de="choose" />
    </div>

    <div class="h-80 overflow-y-auto rounded-lg border border-border p-3 text-xs" aria-live="polite" data-de-details>
      <p v-if="!de" class="text-muted-foreground">Pick a data extension on the left to see its rows, sendable field and fields.</p>
      <template v-else>
        <div class="flex flex-wrap items-center gap-2">
          <h3 class="text-sm font-semibold break-all flex-1">{{ de.name }}</h3>
          <a v-if="stack" :href="deContactBuilderUrl(stack, de)" target="_blank" rel="noopener" class="inline-flex items-center gap-1 text-primary hover:underline">Open in SFMC <ExternalLink class="h-3 w-3" /></a>
        </div>
        <p v-if="detail?.description" class="mt-1 text-muted-foreground">{{ detail.description }}</p>
        <p v-if="loading" class="mt-2 flex items-center gap-1.5 text-muted-foreground"><Loader2 class="h-3.5 w-3.5 animate-spin" /> Reading the data extension</p>
        <p v-if="error" class="mt-2 text-red-700 dark:text-red-300" role="alert" data-de-error>{{ error }}</p>

        <dl v-if="detail" class="mt-2 grid grid-cols-[max-content_1fr] gap-x-3 gap-y-1" data-de-properties>
          <template v-for="p in deProperties(detail, { folderPath })" :key="p.key">
            <dt class="text-muted-foreground">{{ p.label }}</dt>
            <dd class="break-all" :data-prop="p.key" :class="p.key === 'rows' || (p.key === 'sendable' && p.value === 'Yes') ? 'font-semibold' : ''">{{ p.value }}</dd>
          </template>
        </dl>

        <div class="mt-3">
          <p v-if="fieldsError" class="text-red-700 dark:text-red-300">Could not read the fields: {{ fieldsError }}</p>
          <template v-else-if="fields">
            <p class="font-semibold mb-1">{{ fields.length }} {{ fields.length === 1 ? 'field' : 'fields' }}</p>
            <table class="w-full border-collapse" data-de-fields>
              <thead>
                <tr class="text-left text-muted-foreground">
                  <th class="font-medium py-1 pr-2">Name</th><th class="font-medium py-1 pr-2">Type</th><th class="font-medium py-1 pr-2">Primary key</th><th class="font-medium py-1">Required</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="f in fields" :key="f.name" class="border-t border-border/60">
                  <td class="py-1 pr-2 break-all">{{ f.name }}</td>
                  <td class="py-1 pr-2 whitespace-nowrap">{{ fieldTypeLabel(f) }}</td>
                  <td class="py-1 pr-2">{{ f.isPrimaryKey ? 'Yes' : '' }}</td>
                  <td class="py-1">{{ f.isNullable === false || f.isPrimaryKey ? 'Yes' : '' }}</td>
                </tr>
              </tbody>
            </table>
          </template>
        </div>
      </template>
    </div>
  </div>
</template>
