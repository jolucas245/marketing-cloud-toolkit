// Public DNS checks for the Domains page (user, 2026-11-05): SPF, DKIM, DMARC, name
// servers, MX and custom domain CNAMEs, read through Cloudflare's DNS over HTTPS
// (JSON API). Only domain names are sent, and only after the user turns DNS checks
// on (setting DNS_SETTING; admin policy disableDnsLookup). See PRIVACY.md.
//
// Checked live on 2026-11-05 against an SFMC Sender Authentication Package domain:
// its name servers are ns1-4.exacttarget.com, SPF is
// "v=spf1 include:cust-spf.exacttarget.com -all", MX is reply.<stack>.exacttarget.com,
// and _domainkey exists but no well-known selector answers (DNS cannot list them),
// so the DKIM selector is read from a sent email's DKIM-Signature (s=) instead.

export const DOH_URL = 'https://cloudflare-dns.com/dns-query'
export const DNS_SETTING = '_dnsLookupEnabled'
export const SFMC_SPF_INCLUDE = 'cust-spf.exacttarget.com'
export const SPF_LOOKUP_LIMIT = 10

const TYPE_CODES = { A: 1, NS: 2, CNAME: 5, MX: 15, TXT: 16 }
const CACHE_MS = 5 * 60 * 1000
const cache = new Map()

export function clearDnsCache() { cache.clear() }

const trimDot = (s) => String(s || '').trim().toLowerCase().replace(/\.$/, '')

/** A TXT answer's text: quoted strings joined (long records come in 255-byte parts). */
export function txtValue(data) {
  const s = String(data ?? '')
  const parts = [...s.matchAll(/"((?:[^"\\]|\\.)*)"/g)].map((m) => m[1].replace(/\\(.)/g, '$1'))
  return parts.length ? parts.join('') : s
}

/**
 * One DNS question. Resolves to { status: 'ok' | 'none' | 'nxdomain' | 'error',
 * values: [...], chain: [CNAME targets], error? }; never rejects. 'none' means the
 * name exists but has no record of that type.
 */
export function resolveDns(name, type, fetchImpl = fetch, now = Date.now()) {
  const key = `${trimDot(name)}|${type}`
  const hit = cache.get(key)
  if (hit && now - hit.at < CACHE_MS) return hit.promise
  const promise = (async () => {
    try {
      const r = await fetchImpl(`${DOH_URL}?name=${encodeURIComponent(trimDot(name))}&type=${type}`, { headers: { accept: 'application/dns-json' } })
      if (!r.ok) return { status: 'error', values: [], chain: [], error: `DNS lookup failed (${r.status})` }
      const d = await r.json()
      if (d.Status === 3) return { status: 'nxdomain', values: [], chain: [] }
      if (d.Status !== 0) return { status: 'error', values: [], chain: [], error: `DNS lookup failed (code ${d.Status})` }
      const answers = Array.isArray(d.Answer) ? d.Answer : []
      const code = TYPE_CODES[type]
      const values = answers.filter((a) => a.type === code).map((a) => (type === 'TXT' ? txtValue(a.data) : trimDot(a.data)))
      const chain = answers.filter((a) => a.type === TYPE_CODES.CNAME).map((a) => trimDot(a.data))
      return { status: values.length ? 'ok' : 'none', values, chain }
    } catch (e) {
      return { status: 'error', values: [], chain: [], error: `DNS lookup failed: ${e?.message || e}` }
    }
  })()
  cache.set(key, { at: now, promise })
  promise.then((r) => { if (r.status === 'error') cache.delete(key) })
  return promise
}

// Two-label public suffixes common in SFMC accounts. Without the full Public Suffix
// List, the organizational domain of a.b.example.co.uk is example.co.uk only when
// co.uk is listed here; other multi-label suffixes are treated as one label.
const TWO_LABEL_SUFFIXES = new Set([
  'co.uk', 'org.uk', 'ac.uk', 'gov.uk', 'com.au', 'net.au', 'org.au', 'co.nz', 'co.jp', 'co.in',
  'co.za', 'com.br', 'com.mx', 'com.sg', 'com.cn', 'com.hk', 'co.kr', 'com.tr', 'com.ar', 'co.id',
  'com.my', 'com.ph', 'com.tw', 'co.il', 'com.co', 'com.pe',
])

/** The organizational domain (DMARC's fallback): bell.ca for sales.bell.ca. */
export function orgDomain(domain) {
  const labels = trimDot(domain).split('.').filter(Boolean)
  if (labels.length <= 2) return labels.join('.')
  const lastTwo = labels.slice(-2).join('.')
  return labels.slice(TWO_LABEL_SUFFIXES.has(lastTwo) ? -3 : -2).join('.')
}

/** True when `domain` is `parent` or a subdomain of it. */
export const isWithin = (domain, parent) => { const d = trimDot(domain); const p = trimDot(parent); return !!p && (d === p || d.endsWith(`.${p}`)) }

// ── SPF ───────────────────────────────────────────────────

const ALL_MEANING = {
  '-': 'Fail (-all): mail from any other server should be rejected.',
  '~': 'Soft fail (~all): mail from other servers should be accepted but marked as suspicious.',
  '?': 'Neutral (?all): says nothing about other servers.',
  '+': 'Pass (+all): any server in the world may send for this domain. This makes SPF useless.',
}

/** Terms of one SPF record: { mechanisms: [{ qualifier, name, value }], redirect, all }. */
export function parseSpf(record) {
  const terms = String(record || '').trim().split(/\s+/).slice(1)
  const mechanisms = []
  let redirect = null
  let all = null
  for (const t of terms) {
    const mod = t.match(/^(redirect|exp)=(.+)$/i)
    if (mod) { if (mod[1].toLowerCase() === 'redirect') redirect = trimDot(mod[2]); continue }
    const m = t.match(/^([+\-~?]?)([a-z0-9]+)(?:[:/](.*))?$/i)
    if (!m) continue
    const mech = { qualifier: m[1] || '+', name: m[2].toLowerCase(), value: m[3] ? trimDot(m[3]) : '' }
    if (mech.name === 'all') all = mech.qualifier
    else mechanisms.push(mech)
  }
  return { mechanisms, redirect, all }
}

const COUNTS_LOOKUP = new Set(['include', 'a', 'mx', 'ptr', 'exists'])
const spfOf = (values) => values.filter((v) => /^v=spf1(\s|$)/i.test(v))

/**
 * SPF of a domain: the record, what its "all" means, the DNS lookups it needs
 * (RFC 7208 allows 10, counted through includes and redirect), and whether it
 * authorizes Marketing Cloud (include:cust-spf.exacttarget.com, at any depth).
 */
export async function checkSpf(domain, resolve = resolveDns) {
  const top = await resolve(domain, 'TXT')
  if (top.status === 'error') return { status: 'error', error: top.error }
  const records = spfOf(top.values)
  if (!records.length) return { status: 'missing', problems: ['No SPF record: receivers cannot tell which servers may send for this domain.'] }
  const problems = []
  if (records.length > 1) problems.push('More than one SPF record: receivers treat this as an error (permerror), so SPF fails.')
  const parsed = parseSpf(records[0])

  let lookups = 0
  let includesSfmc = false
  let budget = 30
  const seen = new Set()
  async function walk(p) {
    for (const m of p.mechanisms) {
      if (COUNTS_LOOKUP.has(m.name)) lookups++
      if (m.name === 'include' && m.value) {
        if (isWithin(m.value, SFMC_SPF_INCLUDE)) includesSfmc = true
        await follow(m.value)
      }
    }
    if (p.redirect) { lookups++; await follow(p.redirect) }
  }
  async function follow(name) {
    if (seen.has(name) || budget-- <= 0 || lookups > SPF_LOOKUP_LIMIT) return
    seen.add(name)
    const r = await resolve(name, 'TXT')
    const rec = spfOf(r.values)[0]
    if (rec) await walk(parseSpf(rec))
  }
  await walk(parsed)

  if (lookups > SPF_LOOKUP_LIMIT) problems.push(`Needs more than ${SPF_LOOKUP_LIMIT} DNS lookups: receivers stop and SPF fails (permerror).`)
  if (parsed.all === '+') problems.push(ALL_MEANING['+'])
  if (!parsed.all && !parsed.redirect) problems.push('No "all" at the end: servers not listed get a neutral result.')
  return {
    status: problems.length ? 'warn' : 'ok',
    record: records[0],
    all: parsed.all,
    allMeaning: ALL_MEANING[parsed.all] || '',
    includes: parsed.mechanisms.filter((m) => m.name === 'include').map((m) => m.value),
    lookups,
    includesSfmc,
    problems,
  }
}

// ── DMARC ─────────────────────────────────────────────────

const POLICY_MEANING = {
  none: 'none: only monitor. Failing mail is delivered as usual; reports are sent if rua is set.',
  quarantine: 'quarantine: failing mail should go to spam (junk).',
  reject: 'reject: failing mail should be refused.',
}

/** DMARC tags as an object (lower-case keys). */
export function parseDmarc(record) {
  const tags = {}
  for (const part of String(record || '').split(';')) {
    const i = part.indexOf('=')
    if (i > 0) tags[part.slice(0, i).trim().toLowerCase()] = part.slice(i + 1).trim()
  }
  return tags
}

/**
 * DMARC for a domain. When the domain has no record, the organizational domain's
 * applies (its sp= for subdomains, else p=), as receivers do (RFC 7489 6.6.3).
 */
export async function checkDmarc(domain, resolve = resolveDns) {
  const name = trimDot(domain)
  const org = orgDomain(name)
  let from = name
  let r = await resolve(`_dmarc.${name}`, 'TXT')
  if (r.status === 'error') return { status: 'error', error: r.error }
  let rec = r.values.find((v) => /^v=DMARC1/i.test(v))
  if (!rec && org !== name) {
    r = await resolve(`_dmarc.${org}`, 'TXT')
    rec = r.values.find((v) => /^v=DMARC1/i.test(v))
    from = org
  }
  if (!rec) return { status: 'missing', problems: ['No DMARC record: receivers apply their own rules, and you get no reports about mail sent in your name.'] }
  const tags = parseDmarc(rec)
  const inherited = from !== name
  const policy = String((inherited && tags.sp) || tags.p || '').toLowerCase()
  const pct = tags.pct == null ? 100 : Number(tags.pct)
  const problems = []
  if (!POLICY_MEANING[policy]) problems.push(`Policy "${policy || '(none)'}" is not valid: receivers may ignore the record.`)
  if (policy === 'none') problems.push('Policy none: nothing is blocked; it only monitors.')
  if (Number.isFinite(pct) && pct < 100) problems.push(`pct=${pct}: the policy applies to only ${pct}% of failing mail.`)
  if (!tags.rua) problems.push('No rua: nobody receives aggregate reports.')
  return {
    status: policy === 'reject' || policy === 'quarantine' ? (problems.length ? 'warn' : 'ok') : 'warn',
    record: rec,
    from,
    inherited,
    policy,
    policyMeaning: POLICY_MEANING[policy] || '',
    pct,
    adkim: (tags.adkim || 'r').toLowerCase(),
    aspf: (tags.aspf || 'r').toLowerCase(),
    rua: tags.rua || '',
    ruf: tags.ruf || '',
    problems,
  }
}

// ── DKIM ──────────────────────────────────────────────────

/** RSA key size from the p= value (DER SubjectPublicKeyInfo length), or 0. */
export function dkimKeyBits(p) {
  const b64 = String(p || '').replace(/\s+/g, '')
  if (!b64) return 0
  const bytes = Math.floor((b64.replace(/=+$/, '').length * 3) / 4)
  if (bytes >= 540) return 4096
  if (bytes >= 270) return 2048
  if (bytes >= 140) return 1024
  return 512
}

/**
 * Whether the domain publishes any DKIM keys (_domainkey exists; DNS cannot list
 * the selectors under it) and, when a selector is given, that key.
 */
export async function checkDkim(domain, selector = '', resolve = resolveDns) {
  const base = await resolve(`_domainkey.${trimDot(domain)}`, 'TXT')
  const hasKeys = base.status === 'ok' || base.status === 'none'
  const out = { status: base.status === 'error' ? 'error' : hasKeys ? 'ok' : 'missing', hasKeys, error: base.error }
  const sel = String(selector || '').trim().toLowerCase()
  if (!sel) return out
  const r = await resolve(`${sel}._domainkey.${trimDot(domain)}`, 'TXT')
  const rec = r.values.find((v) => /(^|;)\s*(v=DKIM1|p=)/i.test(v)) || ''
  if (!rec) return { ...out, selector: { name: sel, status: r.status === 'error' ? 'error' : 'missing', chain: r.chain } }
  const tags = parseDmarc(rec)
  const bits = tags.p ? dkimKeyBits(tags.p) : 0
  const problems = []
  if (!tags.p) problems.push('Empty p=: this key has been revoked.')
  else if (bits && bits < 1024) problems.push(`About ${bits}-bit key: too short; many receivers ignore it.`)
  if (/y/i.test(tags.t || '')) problems.push('t=y: testing mode; receivers may not act on the result.')
  return { ...out, selector: { name: sel, status: problems.length ? 'warn' : 'ok', record: rec, keyType: tags.k || 'rsa', bits, chain: r.chain, problems } }
}

// ── Name servers, MX, CNAME ───────────────────────────────

/** Name servers, and whether Salesforce hosts the domain's DNS (ns*.exacttarget.com). */
export async function checkNs(domain, resolve = resolveDns) {
  const r = await resolve(domain, 'NS')
  return { status: r.status, servers: r.values, salesforce: r.values.length > 0 && r.values.every((v) => isWithin(v, 'exacttarget.com')) }
}

/** MX hosts, and whether replies go to Marketing Cloud (reply.<stack>.exacttarget.com). */
export async function checkMx(domain, resolve = resolveDns) {
  const r = await resolve(domain, 'MX')
  const hosts = r.values.map((v) => v.replace(/^\d+\s+/, ''))
  return { status: r.status, hosts, salesforce: hosts.some((h) => isWithin(h, 'exacttarget.com')) }
}

/** A custom domain's live CNAME compared with the target SFMC expects. */
export async function checkCname(name, expected, resolve = resolveDns) {
  const r = await resolve(name, 'CNAME')
  const actual = r.values[0] || r.chain[0] || ''
  const want = trimDot(expected)
  return { status: r.status === 'error' ? 'error' : !actual ? 'missing' : !want || actual === want ? 'ok' : 'mismatch', actual, expected: want, error: r.error }
}

// ── From addresses ────────────────────────────────────────

/**
 * How a verified From address's domain relates to the account's authenticated
 * domains (SAP and Private Domains):
 * - 'covered': the domain is one of them, or a subdomain of one;
 * - 'relaxed': it shares the organizational domain with one (bell.ca and
 *   sales.bell.ca), so DMARC can pass only with relaxed alignment;
 * - 'none': SFMC does not sign for it, so its DMARC cannot pass.
 */
export function fromCoverage(mailDomain, authDomains) {
  const d = trimDot(mailDomain)
  const exact = authDomains.find((a) => isWithin(d, a))
  if (exact) return { kind: 'covered', via: exact }
  const org = orgDomain(d)
  const sibling = authDomains.find((a) => orgDomain(a) === org)
  if (sibling) return { kind: 'relaxed', via: sibling }
  return { kind: 'none', via: '' }
}

/**
 * What the From domain's DMARC means for mail sent from it through SFMC:
 * { level: 'ok' | 'warn' | 'bad' | 'info', text }.
 */
export function fromRisk(coverage, dmarc) {
  const p = dmarc?.policy || ''
  if (coverage.kind === 'covered') return { level: 'ok', text: `Authenticated through ${coverage.via}.` }
  if (coverage.kind === 'relaxed') {
    if (dmarc?.adkim === 's' && dmarc?.aspf === 's') return { level: 'bad', text: `Shares its organizational domain with ${coverage.via}, but this domain's DMARC asks for strict alignment (adkim=s, aspf=s), so mail signed for ${coverage.via} fails DMARC${p === 'reject' ? ' and is refused' : p === 'quarantine' ? ' and goes to spam' : ''}.` }
    return { level: 'ok', text: `Passes DMARC through relaxed alignment with ${coverage.via} (same organizational domain), when SFMC signs the send with that domain.` }
  }
  if (!dmarc || dmarc.status === 'error') return { level: 'info', text: 'Not a SAP or Private Domain here, so SFMC does not sign mail with this domain. Turn on DNS checks to see what its DMARC policy does to that mail.' }
  if (p === 'reject') return { level: 'bad', text: `Not authenticated by SFMC, and this domain's DMARC is reject: mailbox providers that honor DMARC refuse mail sent from this address.` }
  if (p === 'quarantine') return { level: 'bad', text: `Not authenticated by SFMC, and this domain's DMARC is quarantine: mail sent from this address is likely to land in spam.` }
  return { level: 'warn', text: 'Not authenticated by SFMC for this domain. Its DMARC does not block the mail today, but it is unauthenticated and more likely to be filtered.' }
}
