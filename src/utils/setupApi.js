// SFMC Setup data (user, 2026-11-05): sender authentication domains, custom (SSL)
// domains, the account's API endpoints and installed package secret expirations.
// The calls are the ones SFMC's own Setup screens make (user's network log on s12;
// checked live on s10, live test, 2026-11-07): From Address Management uses email-app,
// Domain SSL Certificates custom-domains-ui, Domain Allowlist mc-domainwhitelist-admin-app,
// each with its own session cookie (no Bearer token). Those hosts are apps in
// background/apps.js (covered by the *.marketingcloudapps.com permission), which also
// start their sessions the way Setup does. Secret expirations is a core call.
import { sfmcFetch } from './sfmcApi.js'
import { coreOrigin } from './sfmcHosts.js'

const EMAIL_APP = (stack) => `https://email-app.${stack}.marketingcloudapps.com/fuelapi/messaging/v1`
const CUSTOM_DOMAINS = (stack) => `https://custom-domains-ui.${stack}.marketingcloudapps.com/fuelapi/internal/v1/ssl/customdomains/`
const ENDPOINTS = (stack) => `https://mc-domainwhitelist-admin-app.${stack}.marketingcloudapps.com/fuelapi/platform/v1/endpoints`
const SECRETS = (stack) => `${coreOrigin(stack)}/cloud/fuelapi/internal/v1/packages/secretexpirations`

const PAGE_SIZE = 50
const MAX_PAGES = 40

const lower = (s) => String(s || '').trim().toLowerCase()

/** Domain type labels, as Setup names them. */
export const DOMAIN_TYPES = {
  SAP: 'Sender Authentication Package',
  PrivateDomain: 'Private Domain',
  UserDomain: 'Verified From address',
}

/**
 * One domainverification item. UserDomain entries are email addresses (a verified
 * From address); `mailDomain` is the domain part. SAP and PrivateDomain are domains.
 */
export function normalizeSenderDomain(r) {
  const domain = lower(r?.domain)
  const at = domain.lastIndexOf('@')
  return {
    domain,
    type: r?.domainType || '',
    status: r?.status || '',
    sendable: r?.isSendable === true,
    memberId: r?.memberId ?? null,
    enterpriseId: r?.enterpriseId ?? null,
    emailSendTime: r?.emailSendTime || '',
    isAddress: at > 0,
    mailDomain: at > 0 ? domain.slice(at + 1) : domain,
  }
}

/** Every sender domain and verified From address, all pages. */
export async function fetchSenderDomains(stack, fetch = sfmcFetch) {
  const out = []
  for (let page = 1; page <= MAX_PAGES; page++) {
    const d = await fetch(`${EMAIL_APP(stack)}/domainverification?$page=${page}&$pagesize=${PAGE_SIZE}&$orderby=domain%20asc`, 'GET')
    const items = Array.isArray(d?.items) ? d.items : []
    out.push(...items.map(normalizeSenderDomain))
    const total = Number(d?.count)
    if (items.length < PAGE_SIZE || (Number.isFinite(total) && out.length >= total)) break
  }
  return out
}

/** One custom domain (ssl/customdomains item). */
export function normalizeCustomDomain(item) {
  const d = item?.domainDetail || {}
  return {
    id: d.domainDetailId ?? null,
    name: lower(d.domainName),
    type: d.domainType || '',
    dnsStatus: d.dNSStatus || d.dnsStatus || '',
    tlsStatus: d.tLSStatus || d.tlsStatus || '',
    certOwner: d.certOwner ?? null,
    adminEmail: d.adminEmailAddress || '',
    certExpires: d.certExpirationDate || '',
    lastValidated: d.lastValidatedDate || '',
    errors: Array.isArray(d.errorTypes) ? d.errorTypes : [],
    redirect: d.redirectState || '',
    cnameTarget: lower(d.currentCnameTarget).replace(/\.$/, ''),
    dseValid: d.isDseValid ?? null,
    sni: d.isSni ?? null,
    proxy: d.isProxyConfigured ?? null,
    accounts: (Array.isArray(item?.accounts) ? item.accounts : []).map((a) => ({ mid: a.mid ?? null, name: a.name || '' })),
  }
}

/** Custom domains, all pages, with the certificate allocation and last update. */
export async function fetchCustomDomains(stack, fetch = sfmcFetch) {
  const items = []
  let first = null
  for (let page = 1; page <= MAX_PAGES; page++) {
    const d = await fetch(`${CUSTOM_DOMAINS(stack)}?$page=${page}&$pageSize=${PAGE_SIZE}&$orderBy=domainName+asc`, 'GET')
    first ||= d || {}
    const batch = Array.isArray(d?.items) ? d.items : []
    items.push(...batch.map(normalizeCustomDomain))
    const total = Number(d?.total)
    if (batch.length < PAGE_SIZE || (Number.isFinite(total) && items.length >= total)) break
  }
  const u = first?.utilizations
  return {
    items,
    total: Number(first?.total ?? items.length),
    lastUpdate: first?.lastUpdate || '',
    utilization: u && Number.isFinite(Number(u.allocated)) ? { allocated: Number(u.allocated), used: Number(u.used) || 0 } : null,
  }
}

// The endpoints an installed package calls, as Salesforce documents them. SFMC's list
// also holds its own internal services (restInternal, jsrest on an xt.local host,
// spellcheck, editorSupportAssetHandler), which no package can reach: those stay out.
const ENDPOINT_LABELS = {
  restAuth: 'REST authentication (OAuth token)',
  restProd: 'REST API',
  soap: 'SOAP API',
  ftp: 'SFTP',
  rest: 'REST API (legacy stack URL)',
}
const ENDPOINT_ORDER = Object.keys(ENDPOINT_LABELS)

/**
 * The account's API endpoints for installed packages, plus its tenant subdomain (the
 * first label of the auth, REST or SOAP host, e.g. mcq9c5q-b403hgdg8-6fnmtjbgm4).
 */
export async function fetchTenantEndpoints(stack, fetch = sfmcFetch) {
  const d = await fetch(ENDPOINTS(stack), 'GET')
  const items = (Array.isArray(d?.items) ? d.items : [])
    .filter((e) => e?.url && Object.hasOwn(ENDPOINT_LABELS, e.type))
    .map((e) => ({ type: e.type, label: ENDPOINT_LABELS[e.type], url: String(e.url) }))
    .sort((a, b) => rank(a.type) - rank(b.type))
  return { items, tenant: tenantSubdomain(items) }
}
const rank = (t) => ENDPOINT_ORDER.indexOf(t)

export function tenantSubdomain(items) {
  for (const e of items || []) {
    const m = String(e.url).match(/^[a-z]+:\/\/([a-z0-9-]+)\.(?:auth|rest|soap|ftp)\.marketingcloud(?:apis|ops)\.com/i)
    if (m) return m[1].toLowerCase()
  }
  return ''
}

/** Installed packages and when their client secret expires. */
export async function fetchSecretExpirations(stack, fetch = sfmcFetch) {
  const d = await fetch(SECRETS(stack), 'GET')
  const list = Array.isArray(d) ? d : Array.isArray(d?.items) ? d.items : []
  return list
    .filter((p) => p && (p.packageId || p.name))
    .map((p) => ({ packageId: p.packageId || '', name: p.name || '', expires: p.secretExpirationUTC || '' }))
    .sort((a, b) => (Date.parse(a.expires) || Infinity) - (Date.parse(b.expires) || Infinity))
}

// ── Automation Studio activity types and your access (user, 2026-11-05) ──
// The list Automation Studio reads for its activity palette ("workers"): each type,
// whether this account and user can use it (hasAccess), and the user's permissions
// on it. Same host as the other Automation Studio calls (app automationStudio).
const AS_WORKERS = (stack) => `https://mc.${stack}.marketingcloudapps.com/AutomationStudioFuel3/fuelapi/legacy/v1/beta/automations/workers/`

// "PredictiveIntelligenceRecommendationActivity" → "Predictive Intelligence Recommendation Activity".
export const spacedName = (s) => String(s || '').replace(/([a-z])([A-Z])/g, '$1 $2').replace(/([A-Z]+)([A-Z][a-z])/g, '$1 $2').trim()

/** One activity type: { id, name, access, url, granted: [names], denied: [names] }. */
export function normalizeActivityType(w) {
  const granted = new Set()
  const denied = new Set()
  for (const p of Array.isArray(w?.permissions) ? w.permissions : []) {
    if (!p?.permissionName) continue
    ;(p.hasPermission ? granted : denied).add(p.permissionName)
  }
  // The same permission can be listed twice (Query's Move): granted wins.
  for (const g of granted) denied.delete(g)
  return {
    id: Number(w?.categoryId ?? w?.key) || 0,
    name: spacedName(w?.name),
    access: w?.hasAccess === true,
    url: w?.url || '',
    granted: [...granted],
    denied: [...denied],
    listsPermissions: Array.isArray(w?.permissions),
  }
}

/** Every activity type, with access first and then by name. */
export async function fetchActivityTypeAccess(stack, fetch = sfmcFetch) {
  const d = await fetch(AS_WORKERS(stack), 'GET')
  const list = Array.isArray(d?.entry) ? d.entry : Array.isArray(d?.items) ? d.items : []
  return list.map(normalizeActivityType).sort((a, b) => Number(b.access) - Number(a.access) || a.name.localeCompare(b.name))
}
