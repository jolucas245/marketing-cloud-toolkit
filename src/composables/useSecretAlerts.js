// Installed package secret expirations for the current stack, shared by the app-wide
// alert, Home and the Installed Packages page (user, 2026-11-05). Read when the stack is known
// (App.vue), at most every 6 hours, and kept in chrome.storage.local so a new tab
// shows alerts at once. A user without access to installed packages gets no alerts
// (the error shows only on the Installed Packages page).
import { computed, reactive } from 'vue'
import { fetchSecretExpirations } from '@/utils/setupApi.js'
import { SECRETS_CACHE_KEY, SECRETS_DISMISSED_KEY, SECRETS_MAX_AGE_MS, secretAlerts, alertKey } from '@/utils/secretExpirations.js'

export const secretsState = reactive({ stack: '', list: null, at: 0, error: '', loading: false, dismissed: {} })

const storage = () => { try { return chrome.storage?.local || null } catch { return null } }
const get = (key) => new Promise((resolve) => { const s = storage(); if (!s) return resolve(undefined); s.get(key, (r) => resolve(r?.[key])) })
const set = (obj) => { try { storage()?.set(obj) } catch { /* not in an extension */ } }

let inFlight = null

/** Reads the expirations for `stack` (from storage when fresh, unless `force`). */
export async function refreshSecrets(stack, { force = false, fetch } = {}) {
  if (!stack) return
  if (inFlight && inFlight.stack === stack && !force) return inFlight.promise
  const promise = (async () => {
    const [cache, dismissed] = await Promise.all([get(SECRETS_CACHE_KEY), get(SECRETS_DISMISSED_KEY)])
    secretsState.dismissed = dismissed || {}
    const hit = cache?.[stack]
    if (secretsState.stack !== stack) Object.assign(secretsState, { stack, list: null, at: 0, error: '' })
    if (hit?.list) Object.assign(secretsState, { list: hit.list, at: hit.at })
    if (!force && hit?.list && Date.now() - hit.at < SECRETS_MAX_AGE_MS) return
    secretsState.loading = true
    try {
      const list = await fetchSecretExpirations(stack, fetch)
      const at = Date.now()
      if (secretsState.stack === stack) Object.assign(secretsState, { list, at, error: '' })
      set({ [SECRETS_CACHE_KEY]: { ...(cache || {}), [stack]: { list, at } } })
    } catch (e) {
      if (secretsState.stack === stack) secretsState.error = e?.message || String(e)
    } finally {
      secretsState.loading = false
    }
  })()
  inFlight = { stack, promise }
  promise.finally(() => { if (inFlight?.promise === promise) inFlight = null })
  return promise
}

/** Secrets expiring within a week (or expired), and those not dismissed. */
export function useSecretAlerts() {
  const alerts = computed(() => secretAlerts(secretsState.list))
  const undismissed = computed(() => alerts.value.filter((s) => !secretsState.dismissed[alertKey(secretsState.stack, s)]))
  function dismissAll() {
    const next = { ...secretsState.dismissed }
    for (const s of alerts.value) next[alertKey(secretsState.stack, s)] = true
    secretsState.dismissed = next
    set({ [SECRETS_DISMISSED_KEY]: next })
  }
  return { state: secretsState, alerts, undismissed, dismissAll }
}
