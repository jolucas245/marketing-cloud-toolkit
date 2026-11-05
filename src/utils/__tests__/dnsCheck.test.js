import { describe, it, expect, beforeEach } from 'vitest'
import {
  txtValue, resolveDns, clearDnsCache, orgDomain, isWithin, parseSpf, checkSpf, parseDmarc, checkDmarc,
  dkimKeyBits, checkDkim, checkNs, checkMx, checkCname, fromCoverage, fromRisk, DOH_URL,
} from '../dnsCheck.js'

// A fake resolver: { 'name|TYPE': ['value', ...] | 'nxdomain' | 'error' }.
function zone(records) {
  const calls = []
  const resolve = async (name, type) => {
    calls.push(`${name}|${type}`)
    const v = records[`${name}|${type}`]
    if (v === 'nxdomain') return { status: 'nxdomain', values: [], chain: [] }
    if (v === 'error') return { status: 'error', values: [], chain: [], error: 'DNS lookup failed (500)' }
    if (v && !Array.isArray(v)) return { status: 'ok', values: v.values, chain: v.chain || [] }
    return { status: v?.length ? 'ok' : 'none', values: v || [], chain: [] }
  }
  return { resolve, calls }
}

describe('DNS over HTTPS (user, 2026-11-05)', () => {
  beforeEach(() => clearDnsCache())

  it('joins TXT parts and strips quotes', () => {
    expect(txtValue('"v=spf1 include:a.example" " -all"')).toBe('v=spf1 include:a.example -all')
    expect(txtValue('"say \\"hi\\""')).toBe('say "hi"')
    expect(txtValue('plain')).toBe('plain')
  })

  it('asks Cloudflare for JSON and maps NOERROR, NXDOMAIN and failures', async () => {
    const seen = []
    const fetchImpl = async (url, opts) => {
      seen.push([url, opts.headers.accept])
      if (url.includes('name=gone.example')) return { ok: true, json: async () => ({ Status: 3 }) }
      if (url.includes('name=broken.example')) return { ok: false, status: 502 }
      return { ok: true, json: async () => ({ Status: 0, Answer: [{ type: 5, data: 'target.example.' }, { type: 16, data: '"v=spf1 -all"' }] }) }
    }
    const ok = await resolveDns('Example.COM.', 'TXT', fetchImpl)
    expect(seen[0]).toEqual([`${DOH_URL}?name=example.com&type=TXT`, 'application/dns-json'])
    expect(ok).toEqual({ status: 'ok', values: ['v=spf1 -all'], chain: ['target.example'] })
    expect((await resolveDns('gone.example', 'TXT', fetchImpl)).status).toBe('nxdomain')
    expect((await resolveDns('broken.example', 'TXT', fetchImpl)).status).toBe('error')
    expect((await resolveDns('example.com', 'MX', fetchImpl)).status).toBe('none')
  })

  it('caches answers but not errors', async () => {
    let n = 0
    const fetchImpl = async () => { n++; return { ok: n > 1, status: 500, json: async () => ({ Status: 0, Answer: [] }) } }
    expect((await resolveDns('a.example', 'TXT', fetchImpl)).status).toBe('error')
    await Promise.resolve()
    await resolveDns('a.example', 'TXT', fetchImpl)
    await resolveDns('a.example', 'TXT', fetchImpl)
    expect(n).toBe(2)
  })
})

describe('domains', () => {
  it('finds the organizational domain', () => {
    expect(orgDomain('news.sales.example.ca')).toBe('example.ca')
    expect(orgDomain('example.com')).toBe('example.com')
    expect(orgDomain('mail.shop.example.co.uk')).toBe('example.co.uk')
  })
  it('knows subdomains', () => {
    expect(isWithin('click.sales.example.ca', 'sales.example.ca')).toBe(true)
    expect(isWithin('sales.example.ca', 'sales.example.ca')).toBe(true)
    expect(isWithin('badsales.example.ca', 'sales.example.ca')).toBe(false)
  })
})

describe('SPF', () => {
  it('parses mechanisms, redirect and all', () => {
    const p = parseSpf('v=spf1 ip4:1.2.3.4 include:cust-spf.exacttarget.com ~all')
    expect(p.all).toBe('~')
    expect(p.mechanisms.map((m) => m.name)).toEqual(['ip4', 'include'])
    expect(parseSpf('v=spf1 redirect=_spf.example.com').redirect).toBe('_spf.example.com')
  })

  it('a SAP domain: authorizes Marketing Cloud with -all (as seen live on 2026-11-05)', async () => {
    const { resolve } = zone({
      'sales.example.ca|TXT': ['v=spf1 include:cust-spf.exacttarget.com -all'],
      'cust-spf.exacttarget.com|TXT': ['v=spf1 ip4:10.0.0.0/8 -all'],
    })
    const r = await checkSpf('sales.example.ca', resolve)
    expect(r).toMatchObject({ status: 'ok', includesSfmc: true, all: '-', lookups: 1, problems: [] })
    expect(r.allMeaning).toMatch(/rejected/)
  })

  it('finds Marketing Cloud through a nested include and counts lookups through it', async () => {
    const { resolve } = zone({
      'example.com|TXT': ['google-site-verification=x', 'v=spf1 include:_spf.example.com mx ~all'],
      '_spf.example.com|TXT': ['v=spf1 include:cust-spf.exacttarget.com a -all'],
    })
    const r = await checkSpf('example.com', resolve)
    expect(r.includesSfmc).toBe(true)
    expect(r.lookups).toBe(4) // include, mx, then include and a inside _spf
  })

  it('flags more than 10 lookups, several records, +all and a missing record', async () => {
    const many = Array.from({ length: 11 }, (_, i) => `include:s${i}.example.com`).join(' ')
    expect((await checkSpf('a.example', zone({ 'a.example|TXT': [`v=spf1 ${many} -all`] }).resolve)).problems.join(' ')).toMatch(/more than 10/)
    expect((await checkSpf('b.example', zone({ 'b.example|TXT': ['v=spf1 -all', 'v=spf1 ~all'] }).resolve)).problems.join(' ')).toMatch(/More than one/)
    expect((await checkSpf('c.example', zone({ 'c.example|TXT': ['v=spf1 +all'] }).resolve)).status).toBe('warn')
    expect((await checkSpf('d.example', zone({}).resolve)).status).toBe('missing')
    expect((await checkSpf('e.example', zone({ 'e.example|TXT': 'error' }).resolve)).status).toBe('error')
  })

  it('does not loop on include cycles', async () => {
    const { resolve } = zone({
      'a.example|TXT': ['v=spf1 include:b.example -all'],
      'b.example|TXT': ['v=spf1 include:a.example -all'],
    })
    const r = await checkSpf('a.example', resolve)
    expect(r.lookups).toBeLessThanOrEqual(11)
  })
})

describe('DMARC', () => {
  it('parses tags', () => {
    expect(parseDmarc('v=DMARC1; p=reject; adkim=r; aspf=r; pct=100;')).toEqual({ v: 'DMARC1', p: 'reject', adkim: 'r', aspf: 'r', pct: '100' })
  })

  it('reads the domain\'s own record', async () => {
    const r = await checkDmarc('sales.example.ca', zone({ '_dmarc.sales.example.ca|TXT': ['v=DMARC1; p=reject; adkim=r; aspf=r; pct=100; rua=mailto:d@example.ca'] }).resolve)
    expect(r).toMatchObject({ status: 'ok', policy: 'reject', inherited: false, pct: 100, adkim: 'r', aspf: 'r', rua: 'mailto:d@example.ca' })
  })

  it('falls back to the organizational domain and its sp=', async () => {
    const { resolve } = zone({
      '_dmarc.news.example.com|TXT': 'nxdomain',
      '_dmarc.example.com|TXT': ['v=DMARC1; p=reject; sp=quarantine; rua=mailto:r@example.com'],
    })
    const r = await checkDmarc('news.example.com', resolve)
    expect(r).toMatchObject({ inherited: true, from: 'example.com', policy: 'quarantine' })
  })

  it('warns about none, partial pct and missing reports; reports a missing record', async () => {
    const r = await checkDmarc('a.example', zone({ '_dmarc.a.example|TXT': ['v=DMARC1; p=none; pct=50'] }).resolve)
    expect(r.status).toBe('warn')
    expect(r.problems.join(' ')).toMatch(/only monitors.*50%.*No rua/)
    expect((await checkDmarc('b.example', zone({}).resolve)).status).toBe('missing')
  })
})

describe('DKIM', () => {
  it('estimates key sizes', () => {
    expect(dkimKeyBits('A'.repeat(216))).toBe(1024)
    expect(dkimKeyBits('A'.repeat(392))).toBe(2048)
    expect(dkimKeyBits('A'.repeat(100))).toBe(512)
    expect(dkimKeyBits('')).toBe(0)
  })

  it('tells whether keys are published under _domainkey (NOERROR without data counts)', async () => {
    expect((await checkDkim('sales.example.ca', '', zone({ '_domainkey.sales.example.ca|TXT': [] }).resolve)).hasKeys).toBe(true)
    expect((await checkDkim('x.example', '', zone({ '_domainkey.x.example|TXT': 'nxdomain' }).resolve))).toMatchObject({ hasKeys: false, status: 'missing' })
  })

  it('checks one selector, through a CNAME, and flags revoked, short and test keys', async () => {
    const { resolve } = zone({
      '_domainkey.example.com|TXT': [],
      's1._domainkey.example.com|TXT': { values: [`v=DKIM1; k=rsa; p=${'A'.repeat(392)}`], chain: ['s1.dkim.provider.example'] },
      'old._domainkey.example.com|TXT': ['v=DKIM1; p='],
      'tiny._domainkey.example.com|TXT': [`v=DKIM1; t=y; p=${'A'.repeat(100)}`],
    })
    const good = await checkDkim('example.com', 'S1', resolve)
    expect(good.selector).toMatchObject({ name: 's1', status: 'ok', bits: 2048, keyType: 'rsa', chain: ['s1.dkim.provider.example'] })
    expect((await checkDkim('example.com', 'old', resolve)).selector.problems.join(' ')).toMatch(/revoked/)
    expect((await checkDkim('example.com', 'tiny', resolve)).selector.problems.join(' ')).toMatch(/too short.*testing/)
    expect((await checkDkim('example.com', 'nope', resolve)).selector.status).toBe('missing')
  })
})

describe('name servers, MX and CNAME', () => {
  it('recognizes Salesforce-hosted DNS and reply mail', async () => {
    const { resolve } = zone({
      'sales.example.ca|NS': ['ns1.exacttarget.com', 'ns2.exacttarget.com'],
      'sales.example.ca|MX': ['10 reply.s12.exacttarget.com'],
      'example.ca|NS': ['ns1.example.ca'],
      'example.ca|MX': ['10 mx.example.ca'],
    })
    expect((await checkNs('sales.example.ca', resolve)).salesforce).toBe(true)
    expect(await checkMx('sales.example.ca', resolve)).toMatchObject({ hosts: ['reply.s12.exacttarget.com'], salesforce: true })
    expect((await checkNs('example.ca', resolve)).salesforce).toBe(false)
    expect((await checkMx('example.ca', resolve)).salesforce).toBe(false)
  })

  it('compares the live CNAME with the target SFMC expects', async () => {
    const { resolve } = zone({
      'click.example.ca|CNAME': ['abc.click-sap.sfmc-marketing.com'],
      'view.example.ca|CNAME': ['elsewhere.example.net'],
    })
    expect((await checkCname('click.example.ca', 'ABC.click-sap.sfmc-marketing.com.', resolve)).status).toBe('ok')
    expect((await checkCname('view.example.ca', 'xyz.view-sap.sfmc-marketing.com', resolve))).toMatchObject({ status: 'mismatch', actual: 'elsewhere.example.net' })
    expect((await checkCname('image.example.ca', 'x', resolve)).status).toBe('missing')
  })
})

describe('From addresses', () => {
  const auth = ['sales.example.ca', 'ventes.example.ca']
  it('sorts domains into covered, relaxed and none', () => {
    expect(fromCoverage('sales.example.ca', auth)).toEqual({ kind: 'covered', via: 'sales.example.ca' })
    expect(fromCoverage('news.sales.example.ca', auth).kind).toBe('covered')
    expect(fromCoverage('example.ca', auth)).toEqual({ kind: 'relaxed', via: 'sales.example.ca' })
    expect(fromCoverage('partner.example', auth)).toEqual({ kind: 'none', via: '' })
  })
  it('says what DMARC does to the mail', () => {
    expect(fromRisk({ kind: 'covered', via: 'a' }, null).level).toBe('ok')
    expect(fromRisk({ kind: 'relaxed', via: 'a' }, { policy: 'reject', adkim: 'r', aspf: 'r' }).level).toBe('ok')
    expect(fromRisk({ kind: 'relaxed', via: 'a' }, { policy: 'reject', adkim: 's', aspf: 's' })).toMatchObject({ level: 'bad' })
    expect(fromRisk({ kind: 'none', via: '' }, { status: 'ok', policy: 'reject' }).text).toMatch(/refuse/)
    expect(fromRisk({ kind: 'none', via: '' }, { status: 'warn', policy: 'quarantine' }).text).toMatch(/spam/)
    expect(fromRisk({ kind: 'none', via: '' }, { status: 'missing', policy: '' }).level).toBe('warn')
    expect(fromRisk({ kind: 'none', via: '' }, null).level).toBe('info')
  })
})
