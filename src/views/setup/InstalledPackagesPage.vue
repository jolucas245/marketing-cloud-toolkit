<script setup>
// Setup > Installed Packages (user, 2026-11-05; was Account under Settings, renamed and
// moved by feedback #1078): every installed package secret and when it expires (alerts
// for the next week are on top of every page and on Home), this Marketing Cloud
// account's API endpoints, and which Automation Studio activities the user can use.
import { computed, ref } from 'vue'
import { Loader2, RefreshCw, Copy, Check, X } from 'lucide-vue-next'
import Button from '@/components/ui/button/Button.vue'
import SfmcErrorNotice from '@/components/results/SfmcErrorNotice.vue'
import { useStack, whenStack } from '@/composables/useStack.js'
import { refreshSecrets, secretsState } from '@/composables/useSecretAlerts.js'
import { withReconnect, searchError } from '@/utils/sfmcErrors.js'
import { fetchTenantEndpoints, fetchActivityTypeAccess } from '@/utils/setupApi.js'
import { ALERT_DAYS, daysUntil, expiryText } from '@/utils/secretExpirations.js'
import { formatDateTime } from '@/utils/format.js'
import { showToast } from '@/composables/useToast.js'

const { stack } = useStack()

const endpoints = ref(null)
const endpointsError = ref(null)
const endpointsBusy = ref(false)
async function loadEndpoints() {
  endpointsBusy.value = true
  endpointsError.value = null
  const s = stack.value
  try { endpoints.value = await withReconnect(s, () => fetchTenantEndpoints(s)) } catch (e) { endpointsError.value = searchError(e, 'read the API endpoints') } finally { endpointsBusy.value = false }
}

const secretRows = computed(() => (secretsState.stack === stack.value ? secretsState.list || [] : []).map((p) => {
  const days = daysUntil(p.expires)
  const expired = Date.parse(p.expires) <= Date.now()
  const level = days === null ? 'info' : expired ? 'bad' : days <= ALERT_DAYS ? 'bad' : days <= 30 ? 'warn' : 'ok'
  return { ...p, days, level, text: expiryText(p) }
}))
const secretsError = computed(() => (secretsState.stack === stack.value && secretsState.error ? `Could not read installed package secrets: ${secretsState.error}. Only users who can see Setup > Apps > Installed Packages get this list.` : ''))
const loadSecrets = (force = true) => refreshSecrets(stack.value, { force }).catch(() => undefined)

const access = ref(null)
const accessError = ref(null)
const accessBusy = ref(false)
const accessFilter = ref('')
async function loadAccess() {
  accessBusy.value = true
  accessError.value = null
  const s = stack.value
  try { access.value = await withReconnect(s, () => fetchActivityTypeAccess(s)) } catch (e) { accessError.value = searchError(e, 'read Automation Studio activity types') } finally { accessBusy.value = false }
}
const accessRows = computed(() => {
  const q = accessFilter.value.trim().toLowerCase()
  return (access.value || []).filter((a) => !q || a.name.toLowerCase().includes(q))
})
const accessCount = computed(() => (access.value || []).filter((a) => a.access).length)

function loadAll() {
  if (!stack.value) return
  loadEndpoints()
  loadSecrets(false)
  loadAccess()
}

const copied = ref('')
async function copy(text) {
  try { await navigator.clipboard.writeText(text); copied.value = text; setTimeout(() => { if (copied.value === text) copied.value = '' }, 1500) } catch { showToast('Could not copy to the clipboard.') }
}
const LEVEL = {
  ok: 'bg-green-100 text-green-800 dark:bg-green-950 dark:text-green-300',
  warn: 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300',
  bad: 'bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-300',
  info: 'bg-muted text-foreground',
}

whenStack(loadAll)
</script>

<template>
  <div class="h-full overflow-y-auto p-4 space-y-4 text-sm">
    <div class="flex items-center gap-2">
      <h1 class="text-base font-semibold flex-1">Installed Packages</h1>
      <Button variant="outline" size="sm" class="h-8 text-xs" :disabled="!stack" @click="loadEndpoints(); loadSecrets(true); loadAccess()">
        <RefreshCw class="h-3.5 w-3.5 mr-1" /> Refresh
      </Button>
    </div>

    <!-- Installed package secrets -->
    <section class="rounded-lg border border-border bg-card p-3 space-y-2">
      <div class="flex items-center gap-2"><h2 class="font-semibold flex-1">Installed package secrets</h2><Loader2 v-if="secretsState.loading" class="h-4 w-4 animate-spin" /></div>
      <p class="m-0 text-xs text-muted-foreground">When each package's client secret expires. After that, anything that authenticates with it stops working until the secret is renewed in Setup > Apps > Installed Packages and updated where it is used. Secrets expiring within {{ ALERT_DAYS }} days also show at the top of every page and on Home.<template v-if="secretsState.at && secretsState.stack === stack"> Read {{ formatDateTime(new Date(secretsState.at).toISOString()) }}.</template></p>
      <p v-if="secretsError" class="text-xs text-red-600" role="alert">{{ secretsError }}</p>
      <p v-else-if="secretsState.list && !secretRows.length" class="text-xs text-muted-foreground">No installed package has a client secret with an expiry.</p>
      <table v-if="secretRows.length" class="w-full text-xs">
        <thead><tr class="text-left text-muted-foreground border-b border-border"><th class="py-1 pr-3">Package</th><th class="py-1 pr-3">Secret expires</th><th class="py-1 pr-3">Status</th><th class="py-1 pr-3">Package ID</th></tr></thead>
        <tbody>
          <tr v-for="p in secretRows" :key="p.packageId || p.name" class="border-b border-border/50" data-secret-row>
            <td class="py-1.5 pr-3 font-medium">{{ p.name }}</td>
            <td class="py-1.5 pr-3 whitespace-nowrap">{{ formatDateTime(p.expires) }}</td>
            <td class="py-1.5 pr-3"><span class="rounded px-1.5 text-[11px] font-medium" :class="LEVEL[p.level]">{{ p.text }}</span></td>
            <td class="py-1.5 pr-3 font-mono text-muted-foreground">{{ p.packageId }}</td>
          </tr>
        </tbody>
      </table>
    </section>

    <!-- API endpoints -->
    <section class="rounded-lg border border-border bg-card p-3 space-y-2">
      <div class="flex items-center gap-2"><h2 class="font-semibold flex-1">API endpoints</h2><Loader2 v-if="endpointsBusy" class="h-4 w-4 animate-spin" /></div>
      <SfmcErrorNotice v-if="endpointsError" :error="endpointsError" :retrying="endpointsBusy" @retry="loadEndpoints" />
      <template v-if="endpoints">
        <p class="m-0 text-xs text-muted-foreground">The addresses an installed package uses for this account. Get a token from the authentication URL (/v2/token), then call the REST or SOAP API with it.<template v-if="endpoints.tenant"> Tenant subdomain: <code class="font-mono text-foreground">{{ endpoints.tenant }}</code></template></p>
        <table class="w-full text-xs">
          <tbody>
            <tr v-for="e in endpoints.items" :key="e.type" class="border-b border-border/50">
              <td class="py-1.5 pr-3 whitespace-nowrap text-muted-foreground">{{ e.label }}</td>
              <td class="py-1.5 pr-3 font-mono break-all">{{ e.url }}</td>
              <td class="py-1.5 w-8"><button type="button" class="p-1 rounded hover:bg-accent" :title="`Copy ${e.label}`" :aria-label="`Copy ${e.label}`" @click="copy(e.url)"><Check v-if="copied === e.url" class="h-3.5 w-3.5 text-green-600" /><Copy v-else class="h-3.5 w-3.5" /></button></td>
            </tr>
          </tbody>
        </table>
      </template>
    </section>

    <!-- Automation Studio access -->
    <section class="rounded-lg border border-border bg-card p-3 space-y-2">
      <div class="flex flex-wrap items-center gap-2">
        <h2 class="font-semibold flex-1">Automation Studio activities you can use</h2>
        <input v-if="access?.length" v-model="accessFilter" placeholder="Filter" class="h-7 w-40 rounded-md border border-border bg-background px-2 text-xs" aria-label="Filter activity types" />
        <Loader2 v-if="accessBusy" class="h-4 w-4 animate-spin" />
      </div>
      <SfmcErrorNotice v-if="accessError" :error="accessError" :retrying="accessBusy" @retry="loadAccess" />
      <template v-if="access">
        <p class="m-0 text-xs text-muted-foreground">Every activity type Automation Studio offers, as it reads them for you: {{ accessCount }} of {{ access.length }} have Access for you in this business unit, as Automation Studio reports it (hasAccess). Permissions are your role's rights on each type.</p>
        <table class="w-full text-xs">
          <thead><tr class="text-left text-muted-foreground border-b border-border"><th class="py-1 pr-3">Activity type</th><th class="py-1 pr-3">Access</th><th class="py-1 pr-3">Your permissions</th></tr></thead>
          <tbody>
            <tr v-for="a in accessRows" :key="a.id" class="border-b border-border/50 align-top" data-activity-type>
              <td class="py-1.5 pr-3">{{ a.name }} <span class="text-muted-foreground">({{ a.id }})</span></td>
              <td class="py-1.5 pr-3"><span class="rounded px-1.5 text-[11px] font-medium" :class="a.access ? LEVEL.ok : LEVEL.info">{{ a.access ? 'Yes' : 'No' }}</span></td>
              <td class="py-1.5 pr-3">
                <span v-if="!a.listsPermissions" class="text-muted-foreground">Not listed</span>
                <span v-for="g in a.granted" :key="g" class="inline-flex items-center gap-0.5 mr-1 mb-0.5 rounded border border-border px-1"><Check class="h-3 w-3 text-green-600" />{{ g }}</span>
                <span v-for="d in a.denied" :key="d" class="inline-flex items-center gap-0.5 mr-1 mb-0.5 rounded border border-red-300 dark:border-red-900 px-1 text-red-700 dark:text-red-400"><X class="h-3 w-3" />{{ d }}</span>
              </td>
            </tr>
          </tbody>
        </table>
      </template>
    </section>
  </div>
</template>
