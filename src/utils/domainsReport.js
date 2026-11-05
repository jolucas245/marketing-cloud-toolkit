// How the Domains page groups and rates what SFMC returns (user, 2026-11-05). Pure
// functions; the SFMC calls are in setupApi.js and the DNS checks in dnsCheck.js.
import { isWithin } from './dnsCheck.js'
import { daysUntil } from './secretExpirations.js'

export const CERT_WARN_DAYS = 30

/**
 * Sender domains split into authenticated domains (SAP and Private Domain) and
 * verified From addresses grouped by their domain.
 */
export function groupSenderDomains(list) {
  const auth = (list || []).filter((d) => !d.isAddress && (d.type === 'SAP' || d.type === 'PrivateDomain'))
  const other = (list || []).filter((d) => !d.isAddress && d.type !== 'SAP' && d.type !== 'PrivateDomain')
  const byDomain = new Map()
  for (const a of (list || []).filter((d) => d.isAddress)) {
    if (!byDomain.has(a.mailDomain)) byDomain.set(a.mailDomain, [])
    byDomain.get(a.mailDomain).push(a)
  }
  const addressDomains = [...byDomain.entries()]
    .map(([domain, addresses]) => ({ domain, addresses: addresses.sort((x, y) => x.domain.localeCompare(y.domain)) }))
    .sort((a, b) => b.addresses.length - a.addresses.length || a.domain.localeCompare(b.domain))
  return { auth, other, addressDomains }
}

/** The custom domains that sit under `domain` (click.sales.bell.ca under sales.bell.ca). */
export function customDomainsUnder(domain, customDomains) {
  return (customDomains || []).filter((c) => isWithin(c.name, domain) && c.name !== domain)
}

/** Certificate expiry: { days, level: 'ok' | 'warn' | 'bad' | 'unknown', text }. */
export function certExpiry(iso, now = Date.now()) {
  const days = daysUntil(iso, now)
  if (days === null) return { days: null, level: 'unknown', text: 'Expiry unknown' }
  if (Date.parse(iso) <= now) return { days, level: 'bad', text: 'Certificate expired' }
  if (days <= CERT_WARN_DAYS) return { days, level: 'warn', text: `Certificate expires in ${days} day${days === 1 ? '' : 's'}` }
  return { days, level: 'ok', text: `Certificate valid for ${days} more days` }
}

/** What needs a look on one custom domain, as short sentences. */
export function customDomainIssues(d, now = Date.now()) {
  const out = []
  if (d.errors?.length) out.push(`SFMC reports: ${d.errors.map((e) => (typeof e === 'string' ? e : e?.name || e?.errorType || JSON.stringify(e))).join(', ')}`)
  if (d.tlsStatus && !/^secured$/i.test(d.tlsStatus)) out.push(`TLS is ${d.tlsStatus}: links on this domain may not open over HTTPS.`)
  if (d.dnsStatus && !/^delegated$/i.test(d.dnsStatus)) out.push(`DNS is ${d.dnsStatus}, not Delegated.`)
  const c = certExpiry(d.certExpires, now)
  if (c.level === 'bad' || c.level === 'warn') out.push(`${c.text}.`)
  if (d.dseValid === false) out.push('isDseValid is false.')
  return out
}

/** Certificate slots: { allocated, used, free, full }, or null. */
export function slotUse(utilization) {
  if (!utilization) return null
  const free = Math.max(0, utilization.allocated - utilization.used)
  return { ...utilization, free, full: utilization.allocated > 0 && free === 0 }
}

/** Runs `tasks` (functions returning promises) `limit` at a time. */
export async function runPool(tasks, limit = 4) {
  const results = new Array(tasks.length)
  let next = 0
  async function worker() {
    while (next < tasks.length) {
      const i = next++
      try { results[i] = await tasks[i]() } catch (e) { results[i] = { status: 'error', error: e?.message || String(e) } }
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, tasks.length) }, worker))
  return results
}
