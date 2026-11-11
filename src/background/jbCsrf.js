// Journey Builder's CSRF token. Journey Builder (jbinteractions.<stack>.marketingcloudapps.com)
// refuses POSTs without the X-CSRF-Token its own page sends ("invalid csrf token",
// EBADCSRFTOKEN; checked live 2026-11-02). Its `_csrf` cookie is only the secret behind
// the token, so the token is read from Journey Builder's own API requests (webRequest),
// kept per stack in memory and session storage, and never logged. When none has been
// seen, Journey Builder is opened in an inactive tab until it makes such a request.
// GETs work without it, which is why the Journeys pages never needed it.

import { storageGet, storageSet, createTab, removeTab } from './chromeAsync.js'
import { coreOrigin } from '../utils/sfmcHosts.js'

const MAX_AGE = 30 * 60 * 1000
const KEY = '_jbCsrf'
const cache = {} // { [stack]: { token, at } }

const stackOf = (url) => String(url || '').match(/^https:\/\/jbinteractions\.([^.]+)\.marketingcloudapps\.com\//i)?.[1]?.toLowerCase() || null

export const isJourneyBuilderUrl = (url) => !!stackOf(url)

export async function restoreJbCsrf() {
  try {
    const { [KEY]: stored = {} } = await storageGet('session', KEY)
    const now = Date.now()
    for (const [stack, e] of Object.entries(stored)) if (e?.token && now - (e.at || 0) < MAX_AGE) cache[stack] = e
  } catch { /* no session storage */ }
}

async function persist() {
  try { await storageSet('session', { [KEY]: cache }) } catch { /* ignore */ }
}

/** webRequest.onBeforeSendHeaders listener for jbinteractions: only SFMC's own page requests count. */
export function sniffJbCsrf(details) {
  if (!details?.requestHeaders || details.tabId < 0) return
  if (String(details.initiator || '').startsWith('chrome-extension://')) return
  const stack = stackOf(details.url)
  if (!stack) return
  const token = details.requestHeaders.find((h) => h.name.toLowerCase() === 'x-csrf-token')?.value
  if (!token || token === cache[stack]?.token) { if (token) cache[stack].at = Date.now(); return }
  cache[stack] = { token, at: Date.now() }
  persist()
}

export function jbCsrfFor(stack) {
  const e = stack && cache[stack]
  return e && Date.now() - e.at < MAX_AGE ? e.token : null
}

export function dropJbCsrf(stack) {
  delete cache[stack]
  persist()
}

export const jbTiming = { waitMs: 30000, pollMs: 500 }
const inFlight = new Map()

/** Opens Journey Builder in an inactive tab until a token has been seen, then closes it. One at a time per stack. */
export function captureJbCsrf(stack) {
  if (inFlight.has(stack)) return inFlight.get(stack)
  const p = (async () => {
    if (jbCsrfFor(stack)) return jbCsrfFor(stack)
    const tab = await createTab({ url: `${coreOrigin(stack)}/cloud/#app/Journey%20Builder`, active: false })
    if (!tab) return null
    try {
      const deadline = Date.now() + jbTiming.waitMs
      while (Date.now() < deadline) {
        await new Promise((r) => setTimeout(r, jbTiming.pollMs))
        if (jbCsrfFor(stack)) return jbCsrfFor(stack)
      }
      return null
    } finally {
      removeTab(tab.id)
    }
  })().finally(() => inFlight.delete(stack))
  inFlight.set(stack, p)
  return p
}
