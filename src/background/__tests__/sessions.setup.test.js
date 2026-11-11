// Setup apps' sessions (live test, 2026-11-07, stack s10): started through core
// SSO.aspx?appId=... (or the Setup page that embeds the app), never the app's root or
// bare #app/Setup; a failure ends in seconds and is not repeated by the immediate
// reconnect. Time is simulated: delay() moves the clock.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

const sim = vi.hoisted(() => ({ created: [], sessions: new Set(), works: new Set() }))

vi.mock('../chromeAsync.js', () => ({
  createTab: async ({ url }) => {
    sim.created.push(url)
    if (sim.works.has(url)) sim.sessions.add(url)
    return { id: sim.created.length }
  },
  removeTab: () => {},
  getCookie: async ({ name }) => (name === 'platformAuthCookie' ? { name, value: 'x' } : null),
  delay: async (ms) => { vi.setSystemTime(Date.now() + ms) },
}))

const { findApp } = await import('../apps.js')
const sessions = await import('../sessions.js')
const { ensureSession, connectApp, landingTimeout, timing, SESSION_UNAVAILABLE } = sessions

// An app answers 200 once one of its working landings was opened.
beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date('2026-11-07T10:00:00Z'))
  sim.created.length = 0
  sim.sessions.clear()
  sim.works.clear()
  globalThis.fetch = async (url) => {
    const app = ['emailApp', 'customDomains', 'domainAllowlist', 'journeyBuilder'].map(findApp).find((a) => a.matches(new URL(url)))
    const ok = app && app.landings('s10').some((l) => sim.sessions.has(l))
    return { status: ok ? 200 : 401 }
  }
})
afterEach(() => { vi.useRealTimers() })

const SSO = (appId) => new RegExp(`^https://mc\\.s10\\.exacttarget\\.com/cloud/tools/SSO\\.aspx\\?appId=${appId}`)

describe('Setup app landings', () => {
  it.each([
    ['emailApp', SSO('6df293a1-4fdc-41cd-aa08-89efc793c33c'), 'https://mc.s10.exacttarget.com/cloud/#app/Setup/FromAddressManagement'],
    ['domainAllowlist', SSO('FF14944B-7CDB-4FF1-82DB-40F022C2C2DC'), 'https://mc.s10.exacttarget.com/cloud/#app/Setup/DomainWhitelist'],
    ['customDomains', /^https:\/\/custom-domains-ui\.s10\.marketingcloudapps\.com\/$/, 'https://mc.s10.exacttarget.com/cloud/#app/Setup/CustomDomains'],
  ])('%s starts where SFMC starts it, then falls back to its Setup page', (id, first, second) => {
    const [a, b, ...rest] = findApp(id).landings('s10')
    expect(a).toMatch(first)
    expect(b).toBe(second)
    expect(rest).toEqual([])
  })

  it('a quick landing gets 6 s, the Setup page 15 s; other apps keep the shared default', () => {
    const email = findApp('emailApp')
    const [sso, setup] = email.landings('s10')
    expect(landingTimeout(email, sso)).toBe(6000)
    expect(landingTimeout(email, setup)).toBe(15000)
    const jb = findApp('journeyBuilder')
    expect(landingTimeout(jb, jb.landings('s10')[0])).toBe(timing.landingTimeoutMs)
  })

  it('Content Builder waits 25 s for its landing and says what to open (#1099)', () => {
    const cb = findApp('contentBuilder')
    expect(landingTimeout(cb, cb.landings('401')[0])).toBe(timing.slowLandingMs)
    expect(cb.sessionHint).toMatch(/Open Content Builder/)
  })
})

describe('starting a Setup app session', () => {
  it('opens the SSO hop and is done within seconds', async () => {
    const app = findApp('emailApp')
    sim.works.add(app.landings('s10')[0])
    const t0 = Date.now()
    await ensureSession(app, 's10')
    expect(sim.created).toEqual([app.landings('s10')[0]])
    expect(Date.now() - t0).toBeLessThan(5000)
  })

  it('falls back to the Setup page when the SSO hop does not start it', async () => {
    const app = findApp('domainAllowlist')
    sim.works.add(app.landings('s10')[1])
    await ensureSession(app, 's10')
    expect(sim.created).toEqual(app.landings('s10'))
  })

  it('fails in about 21 s with what to open in SFMC, and the immediate reconnect does not repeat it', async () => {
    const app = findApp('emailApp')
    const t0 = Date.now()
    const err = await ensureSession(app, 's10').catch((e) => e)
    expect(err.code).toBe(SESSION_UNAVAILABLE)
    expect(err.message).toMatch(/^Could not start a Sender authentication \(Setup\) session on stack s10\. Open Setup > .*From Address Management/)
    expect(Date.now() - t0).toBeLessThanOrEqual(22000)
    expect(sim.created).toHaveLength(2)

    // withReconnect's SFMC_CONNECT_APP comes right after: no new tabs, same message.
    const again = await connectApp('s10', 'emailApp').catch((e) => e)
    expect(again.code).toBe(SESSION_UNAVAILABLE)
    expect(again.message).toBe(err.message)
    expect(sim.created).toHaveLength(2)

    // A Retry later starts again.
    vi.setSystemTime(Date.now() + 11000)
    sim.works.add(app.landings('s10')[0])
    await connectApp('s10', 'emailApp')
    expect(sim.created).toHaveLength(3)
  })

  it('other apps still reconnect at once after a failure (unchanged)', async () => {
    const jb = findApp('journeyBuilder')
    await ensureSession(jb, 's10').catch(() => {})
    const tabs = sim.created.length
    sim.works.add(jb.landings('s10')[0])
    await connectApp('s10', 'journeyBuilder')
    expect(sim.created.length).toBe(tabs + 1)
  })
})
