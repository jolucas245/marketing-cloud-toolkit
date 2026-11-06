import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { ref, reactive } from 'vue'

// Domains (user, 2026-11-05): SFMC lists come from Setup's calls; DNS only after opt-in.
const senders = vi.fn()
const customs = vi.fn()
const dnsCalls = []
const dnsSetting = ref(false)
const policyState = reactive({ disableDnsLookup: false })

vi.mock('@/composables/useStack.js', () => ({ useStack: () => ({ stack: ref('s12') }), whenStack: (fn) => fn() }))
vi.mock('@/composables/useStoredSetting.js', () => ({
  useStoredSetting: (key, fallback) => ({ value: key === '_dnsLookupEnabled' ? dnsSetting : ref(fallback), loaded: ref(true) }),
}))
vi.mock('@/utils/policy.js', () => ({ policy: policyState, POLICY_NOTE: 'Turned off by your organization\'s policy.' }))
vi.mock('@/utils/messaging.js', () => ({ sendToBackground: async () => ({ ok: true }) }))
vi.mock('@/utils/sfmcLinks.js', () => ({ openInSfmc: () => {} }))
vi.mock('@/utils/setupApi.js', async (orig) => ({ ...(await orig()), fetchSenderDomains: (...a) => senders(...a), fetchCustomDomains: (...a) => customs(...a) }))
vi.mock('@/utils/dnsCheck.js', async (orig) => {
  const real = await orig()
  const note = (name) => (...a) => { dnsCalls.push([name, a[0]]); return Promise.resolve(DNS[name](...a)) }
  const DNS = {
    checkSpf: () => ({ status: 'ok', record: 'v=spf1 include:cust-spf.exacttarget.com -all', includesSfmc: true, all: '-', allMeaning: 'Fail (-all)', lookups: 1, problems: [] }),
    checkDmarc: (d) => (d === 'partner.example'
      ? { status: 'ok', policy: 'reject', record: 'v=DMARC1; p=reject', adkim: 'r', aspf: 'r', pct: 100, problems: [] }
      : { status: 'ok', policy: 'reject', record: 'v=DMARC1; p=reject', adkim: 'r', aspf: 'r', pct: 100, policyMeaning: 'reject: refused', problems: [] }),
    checkDkim: () => ({ status: 'ok', hasKeys: true }),
    checkNs: () => ({ status: 'ok', servers: ['ns1.exacttarget.com'], salesforce: true }),
    checkMx: () => ({ status: 'ok', hosts: ['reply.s12.exacttarget.com'], salesforce: true }),
    checkCname: (n, expected) => ({ status: 'ok', actual: expected, expected }),
  }
  return { ...real, ...Object.fromEntries(Object.keys(DNS).map((k) => [k, note(k)])) }
})

const S = (domain, domainType, isAddress) => ({ domain, type: domainType, status: 'Verified', sendable: true, emailSendTime: '2022-03-23T17:57:10Z', isAddress, mailDomain: isAddress ? domain.split('@')[1] : domain })
const SENDERS = [S('sales.example.ca', 'SAP', false), S('info@sales.example.ca', 'UserDomain', true), S('someone@partner.example', 'UserDomain', true)]
const CUSTOM = {
  total: 1, lastUpdate: '2022-11-02T06:20:39Z', utilization: { allocated: 16, used: 16 },
  items: [{ id: 1, name: 'click.sales.example.ca', type: 'click', dnsStatus: 'Delegated', tlsStatus: 'Secured', certExpires: '2099-01-01T00:00:00Z', lastValidated: '2026-11-04T19:30:19Z', errors: [], redirect: 'On', cnameTarget: 'x.click-sap.sfmc-marketing.com', accounts: [{ mid: 1, name: 'Parent' }] }],
}

const mountPage = async () => {
  const { default: Page } = await import('../DomainsPage.vue')
  const w = mount(Page, { global: { stubs: { RouterLink: true } } })
  await flushPromises()
  return w
}
const tabButton = (w, t) => w.findAll('[role="tab"]').find((b) => b.text().includes(t))

describe('Domains page (user, 2026-11-05)', () => {
  beforeEach(() => {
    senders.mockReset().mockResolvedValue(SENDERS)
    customs.mockReset().mockResolvedValue(CUSTOM)
    dnsCalls.length = 0
    dnsSetting.value = false
    policyState.disableDnsLookup = false
  })

  it('shows the SAP domain, totals and slots, and sends nothing to DNS until turned on', async () => {
    const w = await mountPage()
    expect(senders).toHaveBeenCalledWith('s12')
    expect(w.text()).toContain('sales.example.ca')
    expect(w.text()).toContain('Sender Authentication Package')
    expect(w.text()).toContain('16 / 16')
    expect(w.text()).toContain('All used')
    expect(w.text()).toContain('Check SPF, DKIM and DMARC in public DNS?')
    expect(w.text()).toContain('_dmarc.sales.example.ca')
    expect(dnsCalls).toEqual([])
  })

  it('reads SPF, DMARC, DKIM, NS, MX and CNAMEs once DNS checks are on', async () => {
    const w = await mountPage()
    const turnOn = w.findAll('button').find((b) => b.text() === 'Turn on DNS checks')
    await turnOn.trigger('click')
    await flushPromises()
    const names = dnsCalls.map(([n, d]) => `${n}:${d}`)
    expect(names).toEqual(expect.arrayContaining(['checkSpf:sales.example.ca', 'checkDmarc:sales.example.ca', 'checkDkim:sales.example.ca', 'checkNs:sales.example.ca', 'checkMx:sales.example.ca', 'checkDmarc:partner.example', 'checkCname:click.sales.example.ca']))
    expect(w.text()).toContain('v=spf1 include:cust-spf.exacttarget.com -all')
    expect(w.text()).toContain('Authorizes Marketing Cloud')
    expect(w.text()).toContain('Salesforce hosts this domain')
  })

  it('flags From addresses whose domain is not authenticated and has DMARC reject', async () => {
    dnsSetting.value = true
    const w = await mountPage()
    await flushPromises()
    await tabButton(w, 'From addresses').trigger('click')
    const rows = w.findAll('[data-from-domain]')
    const partner = rows.find((r) => r.text().includes('partner.example'))
    expect(partner.text()).toContain('At risk')
    expect(partner.text()).toMatch(/refuse/)
    expect(rows.find((r) => r.text().includes('sales.example.ca')).text()).toContain('OK')
  })

  it('never checks DNS under the admin policy', async () => {
    dnsSetting.value = true
    policyState.disableDnsLookup = true
    const w = await mountPage()
    expect(dnsCalls).toEqual([])
    expect(w.text()).toContain('Turned off by your organization\'s policy.')
  })

  it('lists custom domains with certificate days and business units', async () => {
    const w = await mountPage()
    await tabButton(w, 'Custom domains').trigger('click')
    const row = w.find('[data-custom-domain]')
    expect(row.text()).toContain('click.sales.example.ca')
    expect(row.text()).toContain('Secured')
    expect(row.text()).toMatch(/\d+ days/)
    expect(row.text()).toContain('Parent')
  })

  it('shows an SFMC error with Retry instead of an empty page', async () => {
    senders.mockReset().mockRejectedValueOnce(new Error('SFMC API error 500: boom')).mockResolvedValueOnce(SENDERS)
    const w = await mountPage()
    expect(w.find('[role="alert"]').text()).toContain('Could not read the sender domains: SFMC API error 500: boom')
    await w.findAll('button').find((b) => b.text().trim() === 'Retry').trigger('click')
    await flushPromises()
    expect(w.text()).toContain('sales.example.ca')
  })
})
