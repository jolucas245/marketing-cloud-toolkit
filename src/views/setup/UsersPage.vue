<script setup>
// Setup > Users and roles (user, 2026-11-10): every Marketing Cloud user of the
// enterprise with last login, active, API user, locked, default business unit and named
// roles, and what needs a look (active people with no login for 90+ days or never).
// SOAP AccountUser with QueryAllAccounts. Read-only: users are managed in SFMC Setup.
import { computed, ref } from 'vue'
import { Loader2, RefreshCw } from 'lucide-vue-next'
import Button from '@/components/ui/button/Button.vue'
import SfmcErrorNotice from '@/components/results/SfmcErrorNotice.vue'
import DataTable from '@/components/results/DataTable.vue'
import DownloadMenu from '@/components/results/DownloadMenu.vue'
import { useStack, whenStack } from '@/composables/useStack.js'
import { searchError } from '@/utils/sfmcErrors.js'
import { fetchUsers, userFlags, daysSince } from '@/utils/messagingApi.js'
import { formatDateTime } from '@/utils/format.js'

const { stack } = useStack()
const list = ref(null)
const busy = ref(false)
const error = ref(null)
const show = ref('people') // people | api | all
const onlyFlagged = ref(false)
async function load() {
  busy.value = true
  error.value = null
  try { list.value = await fetchUsers(stack.value) } catch (e) { error.value = searchError(e, 'read the users') } finally { busy.value = false }
}
whenStack(load)

const yesNo = (v) => (v ? 'Yes' : 'No')
const rows = computed(() => (list.value || [])
  .filter((u) => show.value === 'all' || (show.value === 'api' ? u.apiUser : !u.apiUser))
  .map((u) => ({
    ...u, flags: userFlags(u).join('; '), status: u.active ? 'Active' : 'Inactive', api: yesNo(u.apiUser), lockedText: yesNo(u.locked),
    lastLoginText: u.lastLogin ? formatDateTime(u.lastLogin) : 'Never', daysAgo: daysSince(u.lastLogin), rolesText: u.roles.join(', '), created: formatDateTime(u.createdDate),
  }))
  .filter((u) => !onlyFlagged.value || u.flags))
const summary = computed(() => {
  const all = list.value || []
  const people = all.filter((u) => !u.apiUser)
  return { all: all.length, people: people.length, active: people.filter((u) => u.active).length, api: all.length - people.length, flagged: all.filter((u) => userFlags(u).length).length }
})
const roleCounts = computed(() => {
  const m = new Map()
  for (const u of list.value || []) if (u.active) for (const r of u.roles) m.set(r, (m.get(r) || 0) + 1)
  return [...m].sort((a, b) => b[1] - a[1])
})
const columns = [
  { key: 'name', label: 'Name' }, { key: 'username', label: 'Username' }, { key: 'email', label: 'Email', hidden: true }, { key: 'status', label: 'Status' },
  { key: 'flags', label: 'Needs a look' }, { key: 'lastLoginText', label: 'Last login' }, { key: 'daysAgo', label: 'Days since login', hidden: true },
  { key: 'rolesText', label: 'Roles' }, { key: 'api', label: 'API user', hidden: true }, { key: 'lockedText', label: 'Locked', hidden: true },
  { key: 'defaultBusinessUnit', label: 'Default business unit', hidden: true }, { key: 'created', label: 'Created', hidden: true }, { key: 'id', label: 'User ID', hidden: true },
]
const getDoc = () => ({ title: 'Users and roles', blocks: [{ type: 'table', columns: columns.map((c) => c.label), rows: rows.value.map((r) => columns.map((c) => String(r[c.key] ?? ''))) }] })
</script>

<template>
  <div class="p-4 space-y-4 max-w-7xl">
    <div class="flex flex-wrap items-center gap-2">
      <h1 class="text-lg font-semibold">Users and roles</h1>
      <span class="text-xs text-muted-foreground">Every user of this Marketing Cloud account (all business units). Read only: manage users in SFMC Setup.</span>
      <div class="flex-1" />
      <DownloadMenu :get-doc="getDoc" file-name="users" :disabled="!rows.length" />
      <Button variant="outline" size="sm" class="gap-1" :disabled="busy" @click="load"><Loader2 v-if="busy" class="h-3.5 w-3.5 animate-spin" /><RefreshCw v-else class="h-3.5 w-3.5" /> Refresh</Button>
    </div>
    <SfmcErrorNotice v-if="error" :error="error" :retrying="busy" @retry="load" />
    <section class="rounded-lg border border-border bg-card">
      <div class="flex flex-wrap items-center gap-3 px-3 py-2 border-b border-border text-xs">
        <span v-if="list">{{ summary.people }} people ({{ summary.active }} active), {{ summary.api }} API users, <span :class="summary.flagged ? 'font-semibold text-amber-700 dark:text-amber-400' : ''">{{ summary.flagged }} need a look</span></span>
        <div class="flex gap-0.5 border border-border rounded-md p-0.5" role="group" aria-label="Show">
          <button v-for="[k, l] in [['people', 'People'], ['api', 'API users'], ['all', 'All']]" :key="k" class="px-2 py-0.5 rounded" :class="show === k ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-accent'" :aria-pressed="show === k" @click="show = k">{{ l }}</button>
        </div>
        <label class="flex items-center gap-1.5"><input v-model="onlyFlagged" type="checkbox" data-users-flagged /> Only those that need a look</label>
        <span class="text-muted-foreground">Needs a look: active people with no login for 90 days or more, or never; locked users.</span>
      </div>
      <div v-if="busy && !list" class="flex items-center gap-2 p-4 text-sm text-muted-foreground"><Loader2 class="h-4 w-4 animate-spin" /> Reading the users…</div>
      <DataTable v-else :columns="columns" :rows="rows" storage-key="users" empty-text="No users to show.">
        <template #cell-flags="{ row }"><span class="text-amber-700 dark:text-amber-400">{{ row.flags }}</span></template>
        <template #cell-status="{ row }"><span :class="row.active ? '' : 'text-muted-foreground'">{{ row.status }}</span></template>
      </DataTable>
    </section>
    <section v-if="roleCounts.length" class="rounded-lg border border-border bg-card p-3 text-xs">
      <h2 class="text-sm font-semibold mb-2">Roles of active users</h2>
      <p class="text-muted-foreground mb-2">Every user also has a private individual role; only named roles are listed.</p>
      <div class="flex flex-wrap gap-1.5"><span v-for="[r, n] in roleCounts" :key="r" class="rounded-full border border-border px-2 py-0.5">{{ r }} <span class="text-muted-foreground">{{ n }}</span></span></div>
    </section>
  </div>
</template>
