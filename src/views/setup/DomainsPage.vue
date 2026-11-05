<script setup>
// Domains (user, 2026-11-05): the account's Sender Authentication Package and Private
// Domains with their SPF, DKIM and DMARC, verified From addresses and what their
// domain's DMARC does to mail sent from them, and custom (SSL) domains with their
// certificates. SFMC data from Setup's own calls (utils/setupApi.js); DNS records,
// only when the user turns DNS checks on, from public DNS (utils/dnsCheck.js).
import { computed, reactive, ref, watch } from 'vue'
import { Loader2, RefreshCw, ShieldCheck, Mail, Globe, BookOpen, ChevronDown, ChevronRight, Search } from 'lucide-vue-next'
import Button from '@/components/ui/button/Button.vue'
import SfmcErrorNotice from '@/components/results/SfmcErrorNotice.vue'
import { useStack, whenStack } from '@/composables/useStack.js'
import { useStoredSetting } from '@/composables/useStoredSetting.js'
import { policy, POLICY_NOTE } from '@/utils/policy.js'
import { withReconnect, searchError } from '@/utils/sfmcErrors.js'
import { fetchSenderDomains, fetchCustomDomains, DOMAIN_TYPES } from '@/utils/setupApi.js'
import { DNS_SETTING, SPF_LOOKUP_LIMIT, checkSpf, checkDmarc, checkDkim, checkNs, checkMx, checkCname, fromCoverage, fromRisk, clearDnsCache } from '@/utils/dnsCheck.js'
import { groupSenderDomains, customDomainsUnder, certExpiry, customDomainIssues, slotUse, runPool } from '@/utils/domainsReport.js'
import { DOMAIN_HELP } from '@/data/domainHelp.js'
import { formatDate, formatDateTime } from '@/utils/format.js'

const { stack } = useStack()
const { value: dnsSetting } = useStoredSetting(DNS_SETTING, false, (v) => v === true)
const dnsOn = computed(() => dnsSetting.value && !policy.disableDnsLookup)
const { value: selectors } = useStoredSetting('toolkit_dkim_selectors', {}, (v) => (v && typeof v === 'object' ? v : {}))

const TABS = [
  { id: 'auth', label: 'Sender authentication', icon: ShieldCheck },
  { id: 'from', label: 'From addresses', icon: Mail },
  { id: 'custom', label: 'Custom domains', icon: Globe },
  { id: 'help', label: 'What these mean', icon: BookOpen },
]
const tab = ref('auth')

const senders = ref(null)
const sendersError = ref(null)
const custom = ref(null)
const customError = ref(null)
const loading = ref(false)

async function load() {
  if (!stack.value) return
  loading.value = true
  sendersError.value = null
  customError.value = null
  const s = stack.value
  await Promise.all([
    withReconnect(s, () => fetchSenderDomains(s)).then((r) => { senders.value = r }, (e) => { sendersError.value = searchError(e, 'read the sender domains') }),
    withReconnect(s, () => fetchCustomDomains(s)).then((r) => { custom.value = r }, (e) => { customError.value = searchError(e, 'read the custom domains') }),
  ])
  loading.value = false
}
function refresh() { clearDnsCache(); load() }

const grouped = computed(() => groupSenderDomains(senders.value || []))
const authNames = computed(() => grouped.value.auth.map((d) => d.domain))
const customItems = computed(() => custom.value?.items || [])
const slots = computed(() => slotUse(custom.value?.utilization))

// ── DNS ──
const dns = reactive({}) // `${kind}:${name}` → result
const dnsBusy = ref(false)
const dk = (kind, name) => `${kind}:${name}`
async function runDns() {
  if (!dnsOn.value || (!senders.value && !custom.value)) return
  dnsBusy.value = true
  const tasks = []
  for (const d of grouped.value.auth) {
    tasks.push(async () => {
      const [spf, dmarc, dkim, ns, mx] = await Promise.all([checkSpf(d.domain), checkDmarc(d.domain), checkDkim(d.domain, selectors.value[d.domain]), checkNs(d.domain), checkMx(d.domain)])
      dns[dk('auth', d.domain)] = { spf, dmarc, dkim, ns, mx }
    })
  }
  for (const g of grouped.value.addressDomains) {
    tasks.push(async () => { dns[dk('from', g.domain)] = { dmarc: await checkDmarc(g.domain) } })
  }
  for (const c of customItems.value) {
    tasks.push(async () => { dns[dk('cname', c.name)] = await checkCname(c.name, c.cnameTarget) })
  }
  await runPool(tasks, 4)
  dnsBusy.value = false
}
watch([dnsOn, senders, custom], () => runDns())

const selectorDraft = reactive({})
async function checkSelector(domain) {
  const sel = String(selectorDraft[domain] ?? selectors.value[domain] ?? '').trim().toLowerCase()
  selectors.value = { ...selectors.value, [domain]: sel }
  const entry = dns[dk('auth', domain)]
  if (entry) dns[dk('auth', domain)] = { ...entry, dkim: await checkDkim(domain, sel) }
}

// ── From addresses ──
const fromRows = computed(() => grouped.value.addressDomains.map((g) => {
  const coverage = fromCoverage(g.domain, authNames.value)
  const dmarc = dns[dk('from', g.domain)]?.dmarc || null
  return { ...g, coverage, dmarc, risk: fromRisk(coverage, dnsOn.value ? dmarc : null) }
}))
const fromAtRisk = computed(() => fromRows.value.filter((r) => r.risk.level === 'bad').reduce((t, r) => t + r.addresses.length, 0))
const addressCount = computed(() => grouped.value.addressDomains.reduce((t, g) => t + g.addresses.length, 0))

// ── Custom domains ──
const customRows = computed(() => customItems.value.map((c) => ({ ...c, cert: certExpiry(c.certExpires), issues: customDomainIssues(c), cname: dns[dk('cname', c.name)] || null })))
const customIssues = computed(() => customRows.value.filter((c) => c.issues.length || c.cname?.status === 'mismatch').length)

const LEVEL = {
  ok: 'bg-green-100 text-green-800 dark:bg-green-950 dark:text-green-300',
  warn: 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300',
  bad: 'bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-300',
  info: 'bg-muted text-foreground',
  unknown: 'bg-muted text-foreground',
}
const levelOf = (status) => ({ ok: 'ok', warn: 'warn', missing: 'bad', error: 'unknown', mismatch: 'bad' }[status] || 'info')
const statusTone = (s) => (/^(verified|secured|delegated)$/i.test(s) ? LEVEL.ok : /pending|progress/i.test(s) ? LEVEL.warn : s ? LEVEL.bad : LEVEL.info)
const open = reactive({})

whenStack(load)
</script>

<template>
  <div class="h-full overflow-y-auto p-4 space-y-4 text-sm">
    <div class="flex flex-wrap items-center gap-2">
      <h1 class="text-base font-semibold flex-1">Domains</h1>
      <span v-if="dnsBusy" class="text-xs text-muted-foreground inline-flex items-center gap-1"><Loader2 class="h-3.5 w-3.5 animate-spin" /> Checking DNS</span>
      <Button variant="outline" size="sm" class="h-8 text-xs" :disabled="loading || !stack" @click="refresh">
        <Loader2 v-if="loading" class="h-3.5 w-3.5 mr-1 animate-spin" /><RefreshCw v-else class="h-3.5 w-3.5 mr-1" /> Refresh
      </Button>
    </div>

    <!-- DNS checks: off until turned on (only domain names go to cloudflare-dns.com) -->
    <div v-if="policy.disableDnsLookup" class="rounded-lg border border-border bg-card px-3 py-2 text-xs text-muted-foreground">DNS checks: {{ POLICY_NOTE }} SPF, DKIM and DMARC records are not shown.</div>
    <div v-else-if="!dnsSetting" class="flex flex-wrap items-center gap-3 rounded-[14px] border border-primary/25 bg-primary/5 px-4 py-3" role="status">
      <Search class="h-4 w-4 text-primary shrink-0" />
      <span class="flex-1 min-w-[12rem]">
        <span class="font-semibold">Check SPF, DKIM and DMARC in public DNS?</span>
        <span class="text-muted-foreground"> Marketing Cloud lists your domains but not their DNS records. The Toolkit can read them through Cloudflare's DNS resolver (cloudflare-dns.com): only the domain names are sent. You can turn this off in Settings.</span>
      </span>
      <Button size="sm" class="h-8 text-xs" @click="dnsSetting = true">Turn on DNS checks</Button>
    </div>

    <!-- At a glance -->
    <section class="grid grid-cols-2 lg:grid-cols-4 gap-3">
      <div class="rounded-lg border border-border bg-card p-3">
        <div class="text-xs text-muted-foreground">Authenticated sender domains</div>
        <div class="text-2xl font-semibold tabular-nums">{{ senders ? grouped.auth.length : '…' }}</div>
        <div class="text-[11px] text-muted-foreground">Sender Authentication Package and Private Domains</div>
      </div>
      <div class="rounded-lg border border-border bg-card p-3">
        <div class="text-xs text-muted-foreground">Verified From addresses</div>
        <div class="text-2xl font-semibold tabular-nums">{{ senders ? addressCount : '…' }}</div>
        <div class="text-[11px]" :class="fromAtRisk ? 'text-red-700 dark:text-red-400' : 'text-muted-foreground'">{{ senders ? `${grouped.addressDomains.length} domain${grouped.addressDomains.length === 1 ? '' : 's'}` : '' }}<template v-if="fromAtRisk"> · {{ fromAtRisk }} likely to fail DMARC</template></div>
      </div>
      <div class="rounded-lg border border-border bg-card p-3">
        <div class="text-xs text-muted-foreground">Custom domains</div>
        <div class="text-2xl font-semibold tabular-nums">{{ custom ? customItems.length : '…' }}</div>
        <div class="text-[11px]" :class="customIssues ? 'text-amber-700 dark:text-amber-400' : 'text-muted-foreground'">{{ custom ? (customIssues ? `${customIssues} need a look` : 'No problems reported') : '' }}</div>
      </div>
      <div class="rounded-lg border border-border bg-card p-3">
        <div class="text-xs text-muted-foreground">SSL certificate slots</div>
        <div class="text-2xl font-semibold tabular-nums">{{ slots ? `${slots.used} / ${slots.allocated}` : '…' }}</div>
        <div class="text-[11px]" :class="slots?.full ? 'text-amber-700 dark:text-amber-400' : 'text-muted-foreground'">{{ slots ? (slots.full ? 'All used: a new custom domain needs a free slot' : `${slots.free} free`) : '' }}</div>
      </div>
    </section>

    <div class="flex flex-wrap gap-1 border-b border-border" role="tablist">
      <button v-for="t in TABS" :key="t.id" type="button" role="tab" :aria-selected="tab === t.id" class="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium border-b-2 -mb-px" :class="tab === t.id ? 'border-primary text-foreground' : 'border-transparent text-muted-foreground hover:text-foreground'" @click="tab = t.id">
        <component :is="t.icon" class="h-3.5 w-3.5" /> {{ t.label }}
      </button>
    </div>

    <!-- Sender authentication -->
    <template v-if="tab === 'auth'">
      <SfmcErrorNotice v-if="sendersError" :error="sendersError" :retrying="loading" @retry="load" />
      <p v-if="senders && !grouped.auth.length" class="text-xs text-muted-foreground">This account has no Sender Authentication Package or Private Domain. Mail is sent with Marketing Cloud's own domain, or from verified From addresses (see From addresses).</p>
      <section v-for="d in grouped.auth" :key="d.domain" class="rounded-lg border border-border bg-card p-3 space-y-3" data-auth-domain>
        <div class="flex flex-wrap items-center gap-2">
          <h2 class="font-semibold font-mono">{{ d.domain }}</h2>
          <span class="rounded px-1.5 text-[11px] font-medium bg-primary/10 text-primary">{{ DOMAIN_TYPES[d.type] || d.type }}</span>
          <span class="rounded px-1.5 text-[11px] font-medium" :class="statusTone(d.status)">{{ d.status || 'Unknown' }}</span>
          <span class="rounded px-1.5 text-[11px] font-medium" :class="d.sendable ? LEVEL.ok : LEVEL.bad">{{ d.sendable ? 'Sendable' : 'Not sendable' }}</span>
          <span v-if="d.emailSendTime" class="text-xs text-muted-foreground ml-auto" title="SFMC's emailSendTime for this domain">Since {{ formatDate(d.emailSendTime) }}</span>
        </div>

        <div v-if="customDomainsUnder(d.domain, customItems).length" class="text-xs flex flex-wrap items-center gap-1.5">
          <span class="text-muted-foreground">Custom domains:</span>
          <span v-for="c in customDomainsUnder(d.domain, customItems)" :key="c.name" class="rounded border border-border px-1.5 font-mono" :title="`${c.type}: DNS ${c.dnsStatus}, TLS ${c.tlsStatus}`">{{ c.name }}</span>
        </div>

        <p v-if="!dnsOn" class="text-xs text-muted-foreground">With DNS checks on, this shows the records receivers read: SPF in the TXT record of <code class="font-mono">{{ d.domain }}</code>, DMARC at <code class="font-mono">_dmarc.{{ d.domain }}</code>, DKIM keys at <code class="font-mono">&lt;selector&gt;._domainkey.{{ d.domain }}</code>, and the name servers and MX.</p>
        <p v-else-if="!dns[dk('auth', d.domain)]" class="text-xs text-muted-foreground inline-flex items-center gap-1"><Loader2 class="h-3.5 w-3.5 animate-spin" /> Reading DNS…</p>
        <div v-else class="grid gap-3 lg:grid-cols-2 text-xs">
          <!-- SPF -->
          <div class="rounded-md border border-border p-2 space-y-1">
            <div class="flex items-center gap-2"><span class="font-semibold">SPF</span><span class="rounded px-1.5 text-[11px] font-medium" :class="LEVEL[levelOf(dns[dk('auth', d.domain)].spf.status)]">{{ dns[dk('auth', d.domain)].spf.status }}</span></div>
            <p class="m-0 text-muted-foreground">Which servers may send mail for this domain.</p>
            <template v-if="dns[dk('auth', d.domain)].spf.record">
              <code class="block font-mono break-all bg-muted rounded px-1.5 py-1">{{ dns[dk('auth', d.domain)].spf.record }}</code>
              <p class="m-0">{{ dns[dk('auth', d.domain)].spf.includesSfmc ? 'Authorizes Marketing Cloud (include:cust-spf.exacttarget.com).' : 'Does not include cust-spf.exacttarget.com: Marketing Cloud is not authorized by this record.' }}</p>
              <p v-if="dns[dk('auth', d.domain)].spf.allMeaning" class="m-0">{{ dns[dk('auth', d.domain)].spf.allMeaning }}</p>
              <p class="m-0">DNS lookups: {{ dns[dk('auth', d.domain)].spf.lookups }} of {{ SPF_LOOKUP_LIMIT }}.</p>
            </template>
            <p v-for="p in dns[dk('auth', d.domain)].spf.problems || []" :key="p" class="m-0 text-amber-700 dark:text-amber-400">{{ p }}</p>
            <p v-if="dns[dk('auth', d.domain)].spf.error" class="m-0 text-red-600">{{ dns[dk('auth', d.domain)].spf.error }}</p>
          </div>
          <!-- DMARC -->
          <div class="rounded-md border border-border p-2 space-y-1">
            <div class="flex items-center gap-2"><span class="font-semibold">DMARC</span><span class="rounded px-1.5 text-[11px] font-medium" :class="LEVEL[levelOf(dns[dk('auth', d.domain)].dmarc.status)]">{{ dns[dk('auth', d.domain)].dmarc.policy || dns[dk('auth', d.domain)].dmarc.status }}</span></div>
            <p class="m-0 text-muted-foreground">What receivers do with mail that claims to be from this domain but fails SPF and DKIM alignment.</p>
            <template v-if="dns[dk('auth', d.domain)].dmarc.record">
              <code class="block font-mono break-all bg-muted rounded px-1.5 py-1">{{ dns[dk('auth', d.domain)].dmarc.record }}</code>
              <p v-if="dns[dk('auth', d.domain)].dmarc.inherited" class="m-0">No record of its own: the record of {{ dns[dk('auth', d.domain)].dmarc.from }} applies.</p>
              <p class="m-0">Policy {{ dns[dk('auth', d.domain)].dmarc.policyMeaning }}</p>
              <p class="m-0">Alignment: DKIM {{ dns[dk('auth', d.domain)].dmarc.adkim === 's' ? 'strict' : 'relaxed' }}, SPF {{ dns[dk('auth', d.domain)].dmarc.aspf === 's' ? 'strict' : 'relaxed' }}. Applies to {{ dns[dk('auth', d.domain)].dmarc.pct }}% of failing mail.</p>
              <p v-if="dns[dk('auth', d.domain)].dmarc.rua" class="m-0 break-all">Aggregate reports to {{ dns[dk('auth', d.domain)].dmarc.rua }}</p>
            </template>
            <p v-for="p in dns[dk('auth', d.domain)].dmarc.problems || []" :key="p" class="m-0 text-amber-700 dark:text-amber-400">{{ p }}</p>
            <p v-if="dns[dk('auth', d.domain)].dmarc.error" class="m-0 text-red-600">{{ dns[dk('auth', d.domain)].dmarc.error }}</p>
          </div>
          <!-- DKIM -->
          <div class="rounded-md border border-border p-2 space-y-1">
            <div class="flex items-center gap-2"><span class="font-semibold">DKIM</span><span class="rounded px-1.5 text-[11px] font-medium" :class="LEVEL[levelOf(dns[dk('auth', d.domain)].dkim.selector?.status || dns[dk('auth', d.domain)].dkim.status)]">{{ dns[dk('auth', d.domain)].dkim.selector ? dns[dk('auth', d.domain)].dkim.selector.status : dns[dk('auth', d.domain)].dkim.hasKeys ? 'keys published' : dns[dk('auth', d.domain)].dkim.status }}</span></div>
            <p class="m-0 text-muted-foreground">A signature on each message that proves it came from this domain and was not changed.</p>
            <p class="m-0">{{ dns[dk('auth', d.domain)].dkim.hasKeys ? `DKIM keys are published under _domainkey.${d.domain}.` : `Nothing is published under _domainkey.${d.domain}: no DKIM keys.` }} DNS cannot list selectors: copy s= from the DKIM-Signature header of an email sent from this domain to check its key.</p>
            <form class="flex flex-wrap items-center gap-1.5" @submit.prevent="checkSelector(d.domain)">
              <input v-model="selectorDraft[d.domain]" :placeholder="selectors[d.domain] || 'selector (s=)'" class="h-7 w-40 rounded-md border border-border bg-background px-2 font-mono" :aria-label="`DKIM selector for ${d.domain}`" />
              <Button type="submit" variant="outline" size="sm" class="h-7 text-xs">Check key</Button>
            </form>
            <template v-if="dns[dk('auth', d.domain)].dkim.selector">
              <p v-if="dns[dk('auth', d.domain)].dkim.selector.status === 'missing'" class="m-0 text-red-600">No key at {{ dns[dk('auth', d.domain)].dkim.selector.name }}._domainkey.{{ d.domain }}.</p>
              <template v-else-if="dns[dk('auth', d.domain)].dkim.selector.record">
                <p class="m-0">Selector {{ dns[dk('auth', d.domain)].dkim.selector.name }}: {{ dns[dk('auth', d.domain)].dkim.selector.keyType.toUpperCase() }}<template v-if="dns[dk('auth', d.domain)].dkim.selector.bits">, about {{ dns[dk('auth', d.domain)].dkim.selector.bits }}-bit</template><template v-if="dns[dk('auth', d.domain)].dkim.selector.chain.length"> (via CNAME {{ dns[dk('auth', d.domain)].dkim.selector.chain.join(' → ') }})</template>.</p>
                <code class="block font-mono break-all bg-muted rounded px-1.5 py-1 max-h-20 overflow-auto">{{ dns[dk('auth', d.domain)].dkim.selector.record }}</code>
              </template>
              <p v-for="p in dns[dk('auth', d.domain)].dkim.selector.problems || []" :key="p" class="m-0 text-amber-700 dark:text-amber-400">{{ p }}</p>
            </template>
          </div>
          <!-- DNS hosting and replies -->
          <div class="rounded-md border border-border p-2 space-y-1">
            <div class="font-semibold">DNS hosting and replies</div>
            <p class="m-0"><span class="text-muted-foreground">Name servers:</span> {{ dns[dk('auth', d.domain)].ns.servers.join(', ') || 'none found' }}</p>
            <p class="m-0">{{ dns[dk('auth', d.domain)].ns.salesforce ? 'Salesforce hosts this domain\'s DNS, so it publishes and maintains the SPF, DKIM and MX records.' : 'Your own DNS provider hosts this domain: the SPF, DKIM and DMARC records Salesforce gave you must be kept there.' }}</p>
            <p class="m-0"><span class="text-muted-foreground">MX:</span> {{ dns[dk('auth', d.domain)].mx.hosts.join(', ') || 'none' }}</p>
            <p class="m-0">{{ dns[dk('auth', d.domain)].mx.salesforce ? 'Replies go to Marketing Cloud (Reply Mail Management).' : dns[dk('auth', d.domain)].mx.hosts.length ? 'Replies go to your own mail servers.' : 'No MX: replies to this domain cannot be delivered.' }}</p>
          </div>
        </div>
      </section>
      <section v-if="grouped.other.length" class="rounded-lg border border-border bg-card p-3 text-xs">
        <h2 class="font-semibold mb-1">Other domains</h2>
        <p v-for="d in grouped.other" :key="d.domain" class="m-0"><span class="font-mono">{{ d.domain }}</span> · {{ d.type }} · {{ d.status }}</p>
      </section>
    </template>

    <!-- From addresses -->
    <template v-if="tab === 'from'">
      <SfmcErrorNotice v-if="sendersError" :error="sendersError" :retrying="loading" @retry="load" />
      <p class="text-xs text-muted-foreground">Addresses verified for use as From, by domain. Verifying an address does not authenticate its domain: mail passes DMARC only when Marketing Cloud signs it for the same (or, with relaxed alignment, a related) domain.<template v-if="!dnsOn"> Turn on DNS checks to see each domain's DMARC policy.</template></p>
      <p v-if="senders && !fromRows.length" class="text-xs text-muted-foreground">No verified From addresses.</p>
      <table v-if="fromRows.length" class="w-full text-xs">
        <thead><tr class="text-left text-muted-foreground border-b border-border"><th class="py-1 pr-3">Domain</th><th class="py-1 pr-3">Addresses</th><th class="py-1 pr-3">DMARC</th><th class="py-1 pr-3">What happens to mail sent from it</th></tr></thead>
        <tbody>
          <tr v-for="r in fromRows" :key="r.domain" class="border-b border-border/50 align-top" data-from-domain>
            <td class="py-1.5 pr-3 font-mono">{{ r.domain }}</td>
            <td class="py-1.5 pr-3">
              <button type="button" class="inline-flex items-center gap-1 hover:underline" @click="open['from:' + r.domain] = !open['from:' + r.domain]"><ChevronDown v-if="open['from:' + r.domain]" class="h-3 w-3" /><ChevronRight v-else class="h-3 w-3" /> {{ r.addresses.length }} address{{ r.addresses.length === 1 ? '' : 'es' }}</button>
              <ul v-if="open['from:' + r.domain]" class="m-0 mt-1 pl-4 list-none space-y-0.5">
                <li v-for="a in r.addresses" :key="a.domain" class="font-mono">{{ a.domain }}<span v-if="a.status !== 'Verified' || !a.sendable" class="ml-1 text-amber-700 dark:text-amber-400 font-sans">({{ a.status }}{{ a.sendable ? '' : ', not sendable' }})</span><span v-if="a.emailSendTime" class="ml-1 text-muted-foreground font-sans" title="SFMC's emailSendTime: when the verification email was sent">{{ formatDate(a.emailSendTime) }}</span></li>
              </ul>
            </td>
            <td class="py-1.5 pr-3 whitespace-nowrap">
              <span v-if="!dnsOn" class="text-muted-foreground">not checked</span>
              <Loader2 v-else-if="!r.dmarc" class="h-3.5 w-3.5 animate-spin" />
              <span v-else class="rounded px-1.5 text-[11px] font-medium" :class="LEVEL[levelOf(r.dmarc.status)]" :title="r.dmarc.record || ''">{{ r.dmarc.policy || r.dmarc.status }}<template v-if="r.dmarc.inherited"> (from {{ r.dmarc.from }})</template></span>
            </td>
            <td class="py-1.5 pr-3"><span class="rounded px-1.5 mr-1 text-[11px] font-medium" :class="LEVEL[r.risk.level]">{{ { ok: 'OK', warn: 'Unauthenticated', bad: 'At risk', info: 'Unknown' }[r.risk.level] }}</span>{{ r.risk.text }}</td>
          </tr>
        </tbody>
      </table>
    </template>

    <!-- Custom domains -->
    <template v-if="tab === 'custom'">
      <SfmcErrorNotice v-if="customError" :error="customError" :retrying="loading" @retry="load" />
      <p v-if="custom" class="text-xs text-muted-foreground">Your subdomains for links, images, web versions and CloudPages, each with an SSL certificate.<template v-if="custom.lastUpdate"> Last updated in SFMC {{ formatDateTime(custom.lastUpdate) }}.</template></p>
      <p v-if="custom && !customItems.length" class="text-xs text-muted-foreground">No custom domains.</p>
      <div v-if="customRows.length" class="overflow-x-auto">
        <table class="w-full text-xs">
          <thead><tr class="text-left text-muted-foreground border-b border-border"><th class="py-1 pr-3">Domain</th><th class="py-1 pr-3">Type</th><th class="py-1 pr-3">DNS</th><th class="py-1 pr-3">TLS</th><th class="py-1 pr-3">Certificate</th><th class="py-1 pr-3">Last validated</th><th class="py-1 pr-3">Business units</th><th class="py-1 pr-3">Live CNAME</th></tr></thead>
          <tbody>
            <template v-for="c in customRows" :key="c.name">
              <tr class="border-b border-border/50 align-top" data-custom-domain>
                <td class="py-1.5 pr-3">
                  <button type="button" class="inline-flex items-center gap-1 font-mono hover:underline" @click="open['custom:' + c.name] = !open['custom:' + c.name]"><ChevronDown v-if="open['custom:' + c.name]" class="h-3 w-3" /><ChevronRight v-else class="h-3 w-3" /> {{ c.name }}</button>
                  <p v-for="i in c.issues" :key="i" class="m-0 mt-0.5 text-amber-700 dark:text-amber-400">{{ i }}</p>
                </td>
                <td class="py-1.5 pr-3">{{ c.type }}</td>
                <td class="py-1.5 pr-3"><span class="rounded px-1.5 text-[11px] font-medium" :class="statusTone(c.dnsStatus)">{{ c.dnsStatus || '?' }}</span></td>
                <td class="py-1.5 pr-3"><span class="rounded px-1.5 text-[11px] font-medium" :class="statusTone(c.tlsStatus)">{{ c.tlsStatus || '?' }}</span></td>
                <td class="py-1.5 pr-3 whitespace-nowrap"><span class="rounded px-1.5 text-[11px] font-medium" :class="LEVEL[c.cert.level]" :title="c.cert.text">{{ c.cert.days === null ? '?' : c.cert.days < 0 ? 'expired' : `${c.cert.days} days` }}</span> <span class="text-muted-foreground">{{ formatDate(c.certExpires) }}</span></td>
                <td class="py-1.5 pr-3 whitespace-nowrap">{{ formatDateTime(c.lastValidated) }}</td>
                <td class="py-1.5 pr-3">{{ c.accounts.map((a) => a.name || a.mid).join(', ') }}</td>
                <td class="py-1.5 pr-3 whitespace-nowrap">
                  <span v-if="!dnsOn" class="text-muted-foreground">not checked</span>
                  <Loader2 v-else-if="!c.cname" class="h-3.5 w-3.5 animate-spin" />
                  <span v-else class="rounded px-1.5 text-[11px] font-medium" :class="LEVEL[levelOf(c.cname.status)]" :title="c.cname.actual ? `Points to ${c.cname.actual}` : c.cname.error || ''">{{ { ok: 'matches', mismatch: 'points elsewhere', missing: 'no CNAME', error: 'error' }[c.cname.status] }}</span>
                </td>
              </tr>
              <tr v-if="open['custom:' + c.name]" class="border-b border-border/50">
                <td colspan="8" class="py-2 px-3 bg-muted/40">
                  <dl class="grid grid-cols-[max-content_1fr] gap-x-4 gap-y-0.5 m-0">
                    <dt class="text-muted-foreground">CNAME target (SFMC)</dt><dd class="m-0 font-mono break-all">{{ c.cnameTarget || '?' }}</dd>
                    <template v-if="c.cname?.actual"><dt class="text-muted-foreground">CNAME in public DNS</dt><dd class="m-0 font-mono break-all">{{ c.cname.actual }}</dd></template>
                    <dt class="text-muted-foreground">Certificate expires</dt><dd class="m-0">{{ formatDateTime(c.certExpires) }} ({{ c.cert.text }})</dd>
                    <dt class="text-muted-foreground">Certificate admin email</dt><dd class="m-0">{{ c.adminEmail || '?' }}</dd>
                    <dt class="text-muted-foreground">Business units</dt><dd class="m-0">{{ c.accounts.map((a) => `${a.name} (${a.mid})`).join(', ') || '?' }}</dd>
                    <dt class="text-muted-foreground">As SFMC reports them</dt><dd class="m-0 font-mono">redirectState {{ c.redirect || '?' }} · certOwner {{ c.certOwner }} · isDseValid {{ c.dseValid }} · isSni {{ c.sni }} · isProxyConfigured {{ c.proxy }} · id {{ c.id }}</dd>
                  </dl>
                </td>
              </tr>
            </template>
          </tbody>
        </table>
      </div>
    </template>

    <!-- What these mean -->
    <template v-if="tab === 'help'">
      <section v-for="g in DOMAIN_HELP" :key="g.title" class="rounded-lg border border-border bg-card p-3 space-y-2">
        <h2 class="font-semibold">{{ g.title }}</h2>
        <dl class="m-0 space-y-1.5 text-xs">
          <div v-for="i in g.items" :key="i.term"><dt class="font-medium">{{ i.term }}</dt><dd class="m-0 text-muted-foreground">{{ i.text }}</dd></div>
        </dl>
      </section>
    </template>
  </div>
</template>
