// Per-app session warm-up (from SFMC Automation Viewer's sfmcAuth.js, verified live
// on s10). Being logged in to Marketing Cloud does not give every app a session;
// opening the app does. When a marketingcloudapps.com call needs a session, the app's
// landing page is opened in an inactive tab until its probe URL answers 200, then
// the tab is closed and the call is retried once.

import { SFMC_APPS, findApp } from './apps.js'
import { createTab, removeTab, getCookie, delay } from './chromeAsync.js'
import { coreHost } from '../utils/sfmcHosts.js'

export const LOGIN_REQUIRED = 'SFMC_LOGIN_REQUIRED'
export const SESSION_UNAVAILABLE = 'SFMC_SESSION_UNAVAILABLE'

// slowLandingMs: apps with `slowLanding` whose landing loads the whole shell (Content Builder, #1099).
export const timing = { pollMs: 1000, landingTimeoutMs: 15000, slowLandingMs: 25000, cooldownMs: 30000 }

const LOGIN_COOKIES = [
  { host: (s) => coreHost(s), name: 'platformAuthCookie' },
  { host: (s) => coreHost(s, 'members'), name: 'ETAuthCookie' },
]

const inFlight = new Map()
const failedAt = new Map()
const starting = new Set() // `${stack}:${appId}` being started by warmUpMissing
const warmedAt = new Map() // stack → when warmUpMissing last ran
export const WARM_UP_EVERY = 10 * 60 * 1000

export class SfmcAuthError extends Error {
  constructor(code, message) {
    super(message)
    this.code = code
  }
}

export async function isLoggedIn(stack) {
  for (const c of LOGIN_COOKIES) {
    if (await getCookie({ url: `https://${c.host(stack)}/`, name: c.name })) return true
  }
  return false
}

export async function probeSession(app, stack) {
  try {
    const res = await fetch(app.probeUrl(stack), { credentials: 'include', redirect: 'manual' })
    return res.status === 200
  } catch {
    return false
  }
}

// How long one landing may take: the app's own `landingTimeoutMs` (a number, or a
// function of the landing URL) when it has one, else the shared default.
export function landingTimeout(app, landingUrl) {
  const t = typeof app.landingTimeoutMs === 'function' ? app.landingTimeoutMs(landingUrl) : app.landingTimeoutMs
  if (Number.isFinite(t) && t > 0) return t
  return app.slowLanding ? timing.slowLandingMs : timing.landingTimeoutMs
}

// The SESSION_UNAVAILABLE error, with the app's own hint (what to open in SFMC) if any.
function unavailable(app, stack) {
  const hint = app.sessionHint ? ` ${app.sessionHint}` : ''
  return new SfmcAuthError(SESSION_UNAVAILABLE, `Could not start a ${app.name} session on stack ${stack}.${hint}`)
}

async function tryLanding(app, stack, landingUrl) {
  const tab = await createTab({ url: landingUrl, active: false })
  if (!tab) return false
  try {
    const deadline = Date.now() + landingTimeout(app, landingUrl)
    while (Date.now() < deadline) {
      await delay(timing.pollMs)
      if (await probeSession(app, stack)) return true
    }
    return false
  } finally {
    removeTab(tab.id)
  }
}

// One warm-up per app and stack at a time; concurrent callers share it. After a
// failure, fail fast for a while instead of opening a tab on every call.
export function ensureSession(app, stack, { onLoggedOut } = {}) {
  const key = `${stack}:${app.id}`
  if (inFlight.has(key)) return inFlight.get(key)
  const last = failedAt.get(key)
  if (last && Date.now() - last < timing.cooldownMs) {
    return Promise.reject(unavailable(app, stack))
  }
  const promise = (async () => {
    if (await probeSession(app, stack)) return
    if (!(await isLoggedIn(stack))) {
      await onLoggedOut?.(stack)
      throw new SfmcAuthError(LOGIN_REQUIRED, `Not logged in to Marketing Cloud on stack ${stack}.`)
    }
    for (const url of app.landings(stack)) {
      if (await tryLanding(app, stack, url)) return
    }
    throw unavailable(app, stack)
  })()
    .then(() => { failedAt.delete(key) })
    .catch((err) => { failedAt.set(key, Date.now()); throw err })
    .finally(() => { inFlight.delete(key) })
  inFlight.set(key, promise)
  return promise
}

// Session status per app, for the connection menu. Never opens a tab.
export async function sessionStatus(stack) {
  const loggedIn = await isLoggedIn(stack)
  const apps = await Promise.all(SFMC_APPS.filter((app) => !app.onDemand).map(async (app) => ({
    id: app.id,
    name: app.name,
    ok: loggedIn && (await probeSession(app, stack)),
    starting: starting.has(`${stack}:${app.id}`),
  })))
  return { stack, loggedIn, apps }
}

// Starts an app's session even during the cooldown. An app with `retryGapMs` keeps a
// failure younger than that: the page's automatic reconnect (withReconnect) comes
// right after the failed start and would only repeat it; a later Retry starts again.
export async function connectApp(stack, appId, opts) {
  const app = findApp(appId)
  if (!app) throw new Error(`Unknown SFMC app: ${appId}`)
  const key = `${stack}:${app.id}`
  const last = failedAt.get(key)
  if (app.retryGapMs && last && Date.now() - last < app.retryGapMs) throw unavailable(app, stack)
  failedAt.delete(key)
  await ensureSession(app, stack, opts)
}

/**
 * Starts the app sessions that are missing, but only when at least one app already
 * has a session: then the user is logged in and SFMC answers, so the rest can be
 * started. With none, the user is most likely not logged in and opening tabs would
 * not help. Apps are started one at a time (one inactive tab each), at most once
 * every 10 minutes per stack unless `force`.
 * @returns {{ skipped?: string, started?: string[], failed?: string[] }}
 */
export async function warmUpMissing(stack, { force = false, onLoggedOut } = {}) {
  if (!stack) return { skipped: 'no stack' }
  const last = warmedAt.get(stack)
  if (!force && last && Date.now() - last < WARM_UP_EVERY) return { skipped: 'recently' }
  const status = await sessionStatus(stack)
  if (!status.loggedIn) return { skipped: 'not logged in' }
  if (!status.apps.some((a) => a.ok)) return { skipped: 'no app session' }
  warmedAt.set(stack, Date.now())
  const missing = status.apps.filter((a) => !a.ok).map((a) => findApp(a.id))
  const started = []
  const failed = []
  for (const app of missing) starting.add(`${stack}:${app.id}`)
  try {
    for (const app of missing) {
      try {
        failedAt.delete(`${stack}:${app.id}`)
        await ensureSession(app, stack, { onLoggedOut })
        started.push(app.id)
      } catch (e) {
        failed.push(app.id)
        if (e.code === LOGIN_REQUIRED) break
      } finally {
        starting.delete(`${stack}:${app.id}`)
      }
    }
  } finally {
    for (const app of missing) starting.delete(`${stack}:${app.id}`)
  }
  return { started, failed }
}
