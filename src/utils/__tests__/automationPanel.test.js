import { describe, it, expect } from 'vitest'
import { JSDOM } from 'jsdom'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const SCRIPT = readFileSync(join(process.cwd(), 'public/automationPanel.js'), 'utf8')
// What the service worker's AUTOMATION_SUMMARY sends back (background/automationSummary.js).
const SUMMARY = {
  name: 'Hot_Price_Audience', status: 6, lastRunTime: '2026-10-20T10:00:00Z', lastRunStatus: 'Complete', key: 'k1',
  schedule: { status: 'Scheduled', next: '2026-10-21T10:00:00Z' },
  steps: [{ name: 'Build', activities: [
    { type: 'SQL Query', title: 'Loyalty_Engaged_120D', rows: [['Target', 'Loyalty DE']], code: { text: 'SELECT 1', cut: false } },
    { type: 'Send Email', title: 'Weekly email', rows: [] },
  ] }],
}

function page(url, { setting, viewerTab } = {}) {
  const dom = new JSDOM(`<!doctype html><body>${viewerTab ? '<div id="query-studio-opener"></div>' : ''}</body>`, { url, runScripts: 'outside-only' })
  const sent = []
  dom.window.chrome = {
    runtime: { id: 'ext', lastError: undefined, sendMessage: (m, cb) => { sent.push(m); setTimeout(() => cb(m.type === 'AUTOMATION_SUMMARY' ? { summary: SUMMARY } : { ok: true }), 0) } },
    storage: { local: { get: (k, cb) => cb(setting === undefined ? {} : { _automationPanel: setting }) }, onChanged: { addListener() {} } },
  }
  dom.window.setInterval = () => 0
  dom.window.eval(SCRIPT)
  const host = () => dom.window.document.getElementById('sfmc-toolkit-automation-summary')
  return { dom, sent, host }
}
const tick = () => new Promise((r) => setTimeout(r, 10))
const AS = 'https://mc.s13.exacttarget.com/cloud/#app/Automation%20Studio/AutomationStudioFuel3/%23Instance/MHlaTDByMVFK'

describe('Automation Summary tab (feedback #45)', () => {
  it('shows on an automation page and loads the summary when opened', async () => {
    const { sent, host } = page(AS)
    expect(host()).toBeTruthy()
    const root = host().shadowRoot
    root.querySelector('.tab').click()
    await tick()
    expect(sent[0]).toEqual({ type: 'AUTOMATION_SUMMARY', stack: 's13', id: 'MHlaTDByMVFK' })
    const text = root.querySelector('.body').textContent
    expect(text).toContain('Hot_Price_Audience')
    expect(text).toContain('Scheduled')
    expect(text).toContain('SQL Query')
    expect(text).toContain('Loyalty_Engaged_120D')
    expect(text).toContain('Loyalty DE')
    expect(root.querySelector('pre').textContent).toBe('SELECT 1')
    root.querySelector('.foot .btn').click()
    await tick()
    expect(sent.at(-1)).toEqual({ type: 'OPEN_APP', path: '/automations/MHlaTDByMVFK' })
  })
  it('stays away from other pages, when switched off, and when Automation Viewer shows its own tab', () => {
    expect(page('https://mc.s13.exacttarget.com/cloud/#app/Automation%20Studio/AutomationStudioFuel3/').host()).toBeNull()
    expect(page(AS, { setting: false }).host()).toBeNull()
    expect(page(AS, { viewerTab: true }).host()).toBeNull()
  })
  it('puts names in as text, not HTML', async () => {
    SUMMARY.name = '<img src=x onerror=alert(1)>'
    const { host } = page(AS)
    host().shadowRoot.querySelector('.tab').click()
    await tick()
    expect(host().shadowRoot.querySelector('img')).toBeNull()
    SUMMARY.name = 'Hot_Price_Audience'
  })
})

describe('Automation Summary tab after the extension is updated', () => {
  it('says so and offers to reload the page instead of failing', async () => {
    const { dom, host } = page(AS)
    const root = host().shadowRoot
    dom.window.chrome.runtime.id = undefined // what Chrome leaves to an old content script
    root.querySelector('.tab').click()
    await tick()
    const body = root.querySelector('.body')
    expect(body.textContent).toMatch(/was updated since this page was opened/)
    expect([...body.querySelectorAll('button')].map((b) => b.textContent)).toEqual(['Reload this page'])
  })
})

// Opening an automation inside Automation Studio changes its frame's URL; the shell does not
// always copy that into the address, but the frame reports it (live test, 2026-11-07).
describe('Automation Summary tab follows Automation Studio\'s frame', () => {
  const ROOT = 'https://mc.s10.exacttarget.com/cloud/#app/Automation%20Studio/AutomationStudioFuel3/'
  const FRAME = 'https://mc.s10.marketingcloudapps.com'
  const urlChange = (url) => JSON.stringify({ msg: 'urlChange', url, checkpoint: false, from: 'canvas-5d9cad85', version: '4.1.3' })
  const post = (dom, data, origin = FRAME) => dom.window.dispatchEvent(new dom.window.MessageEvent('message', { data, origin }))

  it('shows when the frame opens an automation although the address stays on the list', async () => {
    const { dom, sent, host } = page(ROOT)
    expect(host()).toBeNull()
    post(dom, urlChange(`${FRAME}/AutomationStudioFuel3/?hub=1#Instance/OEduOWIwNmcyVWlZSXBNUDlPUGtkQToyNTow`))
    expect(host()).toBeTruthy()
    host().shadowRoot.querySelector('.tab').click()
    await tick()
    expect(sent[0]).toEqual({ type: 'AUTOMATION_SUMMARY', stack: 's10', id: 'OEduOWIwNmcyVWlZSXBNUDlPUGtkQToyNTow' })
    // Back to the list inside the frame: the tab goes.
    post(dom, urlChange(`${FRAME}/AutomationStudioFuel3/?hub=1#`))
    expect(host()).toBeNull()
  })
  it('loads the new automation when the frame moves to another one with the panel open', async () => {
    const { dom, sent, host } = page(ROOT)
    post(dom, urlChange(`${FRAME}/AutomationStudioFuel3/?hub=1#Instance/A1`))
    host().shadowRoot.querySelector('.tab').click()
    await tick()
    post(dom, urlChange(`${FRAME}/AutomationStudioFuel3/?hub=1#Instance/B2`))
    await tick()
    expect(sent.filter((m) => m.type === 'AUTOMATION_SUMMARY').map((m) => m.id)).toEqual(['A1', 'B2'])
  })
  it('trusts the frame over an address that still names the previous automation', () => {
    const { dom, host } = page(`${ROOT}%23Instance/A1`)
    expect(host()).toBeTruthy()
    post(dom, urlChange(`${FRAME}/AutomationStudioFuel3/?hub=1#`))
    expect(host()).toBeNull()
  })
  it('ignores messages from other origins and other apps, and anything but urlChange', () => {
    const { dom, host } = page(ROOT)
    post(dom, urlChange(`${FRAME}/AutomationStudioFuel3/#Instance/A1`), 'https://evil.example')
    post(dom, urlChange(`${FRAME}/AutomationStudioFuel3/#Instance/A1`), 'https://mc.s10.exacttarget.com')
    post(dom, urlChange('https://mc.s10.marketingcloudapps.com/contactsmeta/#Instance/A1'))
    post(dom, JSON.stringify({ msg: 'registerAppMenu', url: `${FRAME}/AutomationStudioFuel3/#Instance/A1` }))
    post(dom, 'not json urlChange')
    post(dom, { msg: 'urlChange', url: 42 })
    expect(host()).toBeNull()
    // An object (not a string) is read too.
    post(dom, { msg: 'urlChange', url: `${FRAME}/AutomationStudioFuel3/#Instance/A1` })
    expect(host()).toBeTruthy()
  })
  it('forgets the frame once the address leaves Automation Studio', () => {
    const { dom, host } = page(ROOT)
    post(dom, urlChange(`${FRAME}/AutomationStudioFuel3/?hub=1#Instance/A1`))
    expect(host()).toBeTruthy()
    dom.reconfigure({ url: 'https://mc.s10.exacttarget.com/cloud/#app/Email/C12/Default.aspx' })
    dom.window.dispatchEvent(new dom.window.HashChangeEvent('hashchange'))
    expect(host()).toBeNull()
    dom.reconfigure({ url: ROOT })
    dom.window.dispatchEvent(new dom.window.HashChangeEvent('hashchange'))
    expect(host()).toBeNull()
  })
})
