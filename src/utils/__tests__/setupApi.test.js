import { describe, it, expect } from 'vitest'
import {
  fetchSenderDomains, fetchCustomDomains, fetchTenantEndpoints, fetchSecretExpirations, fetchActivityTypeAccess,
  tenantSubdomain, spacedName, normalizeActivityType,
} from '../setupApi.js'
import { groupSenderDomains, customDomainsUnder, certExpiry, customDomainIssues, slotUse, runPool } from '../domainsReport.js'

// Shapes as SFMC's Setup screens return them (user's network log, s12, 2026-11-05),
// with example data.
const sender = (domain, domainType) => ({ enterpriseId: 1, domain, status: 'Verified', domainType, isSendable: true, memberId: 1, emailSendTime: '2022-03-23T17:57:10Z' })
const customItem = (name, type, extra = {}) => ({
  accounts: [{ mid: 1, name: 'Parent' }, { mid: 2, name: 'Sandbox' }],
  domainDetail: { domainDetailId: 7, domainName: name, domainType: type, dNSStatus: 'Delegated', tLSStatus: 'Secured', certOwner: true, adminEmailAddress: 'admin@example.ca', certExpirationDate: '2027-02-27T05:59:59Z', lastValidatedDate: '2026-11-04T19:30:19Z', errorTypes: [], redirectState: 'On', currentCnameTarget: `x.${type}-sap.sfmc-marketing.com`, isDseValid: true, isSni: false, isProxyConfigured: false, ...extra },
})

function recorder(pages) {
  const urls = []
  const fetch = async (url, method) => { urls.push([url, method]); return typeof pages === 'function' ? pages(url) : pages.shift() }
  return { fetch, urls }
}

describe('sender domains (user, 2026-11-05)', () => {
  it('reads every page and splits addresses from domains', async () => {
    const page1 = { page: 1, pageSize: 50, count: 52, items: [...Array.from({ length: 49 }, (_, i) => sender(`a${i}@example.ca`, 'UserDomain')), sender('sales.example.ca', 'SAP')] }
    const page2 = { page: 2, pageSize: 50, count: 52, items: [sender('Info@Partner.example', 'UserDomain'), sender('ventes.example.ca', 'PrivateDomain')] }
    const { fetch, urls } = recorder([page1, page2])
    const list = await fetchSenderDomains('s12', fetch)
    expect(urls).toEqual([
      ['https://email-app.s12.marketingcloudapps.com/fuelapi/messaging/v1/domainverification?$page=1&$pagesize=50&$orderby=domain%20asc', 'GET'],
      ['https://email-app.s12.marketingcloudapps.com/fuelapi/messaging/v1/domainverification?$page=2&$pagesize=50&$orderby=domain%20asc', 'GET'],
    ])
    expect(list).toHaveLength(52)
    expect(list.find((d) => d.domain === 'info@partner.example')).toMatchObject({ isAddress: true, mailDomain: 'partner.example', type: 'UserDomain', sendable: true })
    expect(list.find((d) => d.domain === 'sales.example.ca')).toMatchObject({ isAddress: false, mailDomain: 'sales.example.ca', type: 'SAP' })

    const g = groupSenderDomains(list)
    expect(g.auth.map((d) => d.domain)).toEqual(['sales.example.ca', 'ventes.example.ca'])
    expect(g.addressDomains[0]).toMatchObject({ domain: 'example.ca' })
    expect(g.addressDomains[0].addresses).toHaveLength(49)
    expect(g.addressDomains[1].domain).toBe('partner.example')
  })

  it('stops on a short page', async () => {
    const { fetch, urls } = recorder([{ count: 3, items: [sender('a@example.com', 'UserDomain')] }])
    await fetchSenderDomains('s1', fetch)
    expect(urls).toHaveLength(1)
  })
})

describe('custom domains', () => {
  it('normalizes items, utilization and links them to their SAP domain', async () => {
    const { fetch, urls } = recorder([{ total: 2, batchID: 1, status: 2, lastUpdate: '2022-11-02T06:20:39Z', utilizations: { utilizationName: '', allocated: 16, used: 16 }, items: [customItem('click.sales.example.ca', 'click'), customItem('cloud.sales.example.ca', 'cloud')] }])
    const r = await fetchCustomDomains('s12', fetch)
    expect(urls[0][0]).toBe('https://custom-domains-ui.s12.marketingcloudapps.com/fuelapi/internal/v1/ssl/customdomains/?$page=1&$pageSize=50&$orderBy=domainName+asc')
    expect(r.total).toBe(2)
    expect(r.utilization).toEqual({ allocated: 16, used: 16 })
    expect(r.items[0]).toMatchObject({ name: 'click.sales.example.ca', type: 'click', dnsStatus: 'Delegated', tlsStatus: 'Secured', redirect: 'On', cnameTarget: 'x.click-sap.sfmc-marketing.com', accounts: [{ mid: 1, name: 'Parent' }, { mid: 2, name: 'Sandbox' }] })
    expect(slotUse(r.utilization)).toEqual({ allocated: 16, used: 16, free: 0, full: true })
    expect(customDomainsUnder('sales.example.ca', r.items).map((c) => c.type)).toEqual(['click', 'cloud'])
    expect(customDomainsUnder('ventes.example.ca', r.items)).toEqual([])
  })

  it('rates certificates and lists what needs a look', () => {
    const now = Date.parse('2026-11-05T00:00:00Z')
    expect(certExpiry('2027-02-27T05:59:59Z', now).level).toBe('ok')
    expect(certExpiry('2026-11-20T00:00:00Z', now)).toMatchObject({ level: 'warn', days: 15 })
    expect(certExpiry('2026-11-01T00:00:00Z', now).level).toBe('bad')
    expect(certExpiry('', now).level).toBe('unknown')
    const bad = { tlsStatus: 'Pending', dnsStatus: 'NotDelegated', errors: ['CnameMismatch'], certExpires: '2026-11-01T00:00:00Z', dseValid: false }
    expect(customDomainIssues(bad, now)).toHaveLength(5)
    expect(customDomainIssues({ tlsStatus: 'Secured', dnsStatus: 'Delegated', errors: [], certExpires: '2027-02-27T05:59:59Z' }, now)).toEqual([])
  })
})

describe('account', () => {
  it('reads endpoints in a useful order with the tenant subdomain', async () => {
    const { fetch, urls } = recorder([{ count: 6, items: [
      { type: 'ftp', url: 'ftp://mctenant-abc.ftp.marketingcloudops.com' },
      { type: 'rest', url: 'https://restapi.s12.exacttarget.com' },
      { type: 'restAuth', url: 'https://mctenant-abc.auth.marketingcloudapis.com' },
      { type: 'restInternal', url: 'https://mctenant-abc.rest.marketingcloudapis.com' },
      { type: 'restProd', url: 'https://mctenant-abc.rest.marketingcloudapis.com' },
      { type: 'soap', url: 'https://mctenant-abc.soap.marketingcloudapis.com/Service.asmx' },
    ] }])
    const r = await fetchTenantEndpoints('s12', fetch)
    expect(urls[0][0]).toBe('https://mc-domainwhitelist-admin-app.s12.marketingcloudapps.com/fuelapi/platform/v1/endpoints')
    expect(r.tenant).toBe('mctenant-abc')
    expect(r.items.map((e) => e.type)).toEqual(['restAuth', 'restProd', 'soap', 'ftp', 'restInternal', 'rest'])
    expect(tenantSubdomain([{ url: 'https://restapi.s12.exacttarget.com' }])).toBe('')
  })

  it('reads secret expirations soonest first (a bare array, as SFMC returns it)', async () => {
    const { fetch, urls } = recorder([[
      { packageId: 'p1', name: 'Later', secretExpirationUTC: '2027-01-04T19:38:05Z' },
      { packageId: 'p2', name: 'Soon', secretExpirationUTC: '2026-11-17T17:46:52Z' },
    ]])
    const r = await fetchSecretExpirations('s12', fetch)
    expect(urls[0][0]).toBe('https://mc.s12.exacttarget.com/cloud/fuelapi/internal/v1/packages/secretexpirations')
    expect(r.map((p) => p.name)).toEqual(['Soon', 'Later'])
    expect(r[0]).toEqual({ packageId: 'p2', name: 'Soon', expires: '2026-11-17T17:46:52Z' })
  })

  it('reads Automation Studio activity types with access and permissions', async () => {
    const { fetch, urls } = recorder([{ startIndex: 0, itemsPerPage: 50, totalResults: 3, entry: [
      { key: '300', name: 'Query', categoryId: 300, hasAccess: true, permissions: [
        { operationId: 0, hasPermission: true, permissionName: 'Create' },
        { operationId: 13, hasPermission: false, permissionId: 451, permissionName: 'Move' },
        { operationId: 13, hasPermission: true, permissionId: 1039, permissionName: 'Move' },
      ] },
      { key: '1701', name: 'PredictiveIntelligenceRecommendationActivity', categoryId: 1701, hasAccess: false, permissions: [{ hasPermission: true, permissionName: 'View' }] },
      { key: '45', name: 'Group Refresh', categoryId: 45, hasAccess: true },
    ] }])
    const r = await fetchActivityTypeAccess('s12', fetch)
    expect(urls[0][0]).toBe('https://mc.s12.marketingcloudapps.com/AutomationStudioFuel3/fuelapi/legacy/v1/beta/automations/workers/')
    expect(r.map((a) => a.name)).toEqual(['Group Refresh', 'Query', 'Predictive Intelligence Recommendation Activity'])
    expect(r[1]).toMatchObject({ id: 300, access: true, granted: ['Create', 'Move'], denied: [] })
    expect(r[0].listsPermissions).toBe(false)
  })

  it('spaces names and keeps denied permissions', () => {
    expect(spacedName('DataVerificationActivity')).toBe('Data Verification Activity')
    expect(spacedName('MC List Refresh Activity')).toBe('MC List Refresh Activity')
    expect(normalizeActivityType({ categoryId: 3700, name: 'X', hasAccess: false, permissions: [{ hasPermission: false, permissionName: 'View' }] }).denied).toEqual(['View'])
  })
})

describe('runPool', () => {
  it('runs everything with a limit and turns throws into errors', async () => {
    let running = 0
    let peak = 0
    const task = (v) => async () => { running++; peak = Math.max(peak, running); await new Promise((r) => setTimeout(r, 5)); running--; if (v === 3) throw new Error('boom'); return v }
    const r = await runPool([1, 2, 3, 4, 5].map(task), 2)
    expect(peak).toBe(2)
    expect(r).toEqual([1, 2, { status: 'error', error: 'boom' }, 4, 5])
  })
})
