// Checks watched automations (feedback #50) and journeys (#59) and turns changes into notices: when
// the app asks (WATCH_CHECK, on opening) and when an SFMC page loads (at most every
// 15 minutes per stack). Unread notices show as a count on the toolbar icon; with
// the optional notifications permission granted and switched on, also as desktop
// notifications.
import { sfmcFetch } from './fetchProxy.js'
import { storageGet } from './chromeAsync.js'
import {
  WATCHES_KEY, NOTICES_KEY, NOTIFY_KEY, watchHere, diffAutomation, diffJourney, journeySnapshot, watchType, addNotices, unreadCount, automationStatusName,
} from '../utils/watches.js'

const AS = (stack) => `https://mc.${stack}.marketingcloudapps.com/AutomationStudioFuel3/fuelapi`
const JB = (stack) => `https://jbinteractions.${stack}.marketingcloudapps.com/fuelapi/interaction/v1`
const CHECKED_KEY = 'toolkit_watch_checked' // { stack: time }
const PAGE_INTERVAL = 15 * 60 * 1000
const running = new Set()

// The business unit SFMC is signed in to on this stack. Watches remember the BU they
// were first checked in, and other BUs' watches are skipped: the automation and
// journey calls only see the current BU, so they would answer 404 (feedback #1026).
async function currentMid(stack) {
  try {
    const d = await sfmcFetch({ url: `https://mc.${stack}.exacttarget.com/cloud/fuelapi/platform-internal/v1/accounts/@current` })
    const mid = d?.accountId ?? d?.id ?? d?.memberId
    return mid != null ? String(mid) : null
  } catch { return null }
}

// By key when known: each journey version has its own ID, and the key call returns
// the latest version, so a watch follows the journey through new versions.
async function journeySnap(stack, w) {
  const d = await sfmcFetch({ url: `${JB(stack)}/interactions/${w.key ? `key:${encodeURIComponent(w.key)}` : encodeURIComponent(w.id)}` })
  return { ...journeySnapshot(d), name: d?.name || w.name, id: d?.id || w.id }
}

async function snapshot(stack, w) {
  const d = await sfmcFetch({ url: `${AS(stack)}/automation/v1/automations/${encodeURIComponent(w.id)}` })
  const snap = { status: d?.status ?? null, lastRunTime: d?.lastRunTime ?? null, lastRunStatus: d?.lastRunStatus ?? null, name: d?.name || w.name }
  // The same run as last time: keep the status already known.
  if (!snap.lastRunStatus && snap.lastRunTime && snap.lastRunTime === w.last?.lastRunTime) snap.lastRunStatus = w.last?.lastRunStatus ?? null
  // Still no status (a new run, or a watch started where the list's status was not
  // known): read it from the run log around the run's own day, not only the last 7
  // days (live test, 2026-11-07: a March run stayed without its Error status).
  if (snap.lastRunTime && !snap.lastRunStatus) {
    try {
      const at = Date.parse(snap.lastRunTime)
      const t = Number.isNaN(at) ? Date.now() : at
      const day = (ms) => new Date(ms).toISOString().slice(0, 10)
      const runs = await sfmcFetch({ url: `${AS(stack)}/legacy/v1/beta/automations/automation/instance/?definition_id=${encodeURIComponent(w.id)}&$top=1`
        + `&begin_date=${day(t - 86400000)}&end_date=${day(t + 86400000)}&order_by=${encodeURIComponent('StartTime desc')}&to_server_time=1` })
      const r = (runs?.entry || runs?.items || [])[0]
      snap.lastRunStatus = r?.status ?? r?.statusName ?? r?.StatusName ?? null
    } catch { /* keep it without a status */ }
  }
  return snap
}

export async function updateBadge(list) {
  const notices = list ?? (await storageGet('local', [NOTICES_KEY]))[NOTICES_KEY]
  const n = unreadCount(notices)
  try {
    await chrome.action?.setBadgeText?.({ text: n ? String(Math.min(n, 99)) : '' })
    if (n) await chrome.action?.setBadgeBackgroundColor?.({ color: '#d03b3b' })
  } catch { /* no action API */ }
}

/** Checks the stack's watched automations; `force` skips the 15-minute wait. Returns { checked, notices }. */
export async function checkWatches(stack, { force = false } = {}) {
  if (!stack || running.has(stack)) return { checked: 0, notices: 0 }
  const store = await storageGet('local', [WATCHES_KEY, NOTICES_KEY, CHECKED_KEY, NOTIFY_KEY])
  const watches = store[WATCHES_KEY] || {}
  const mine = Object.entries(watches).filter(([, w]) => w.stack === stack)
  const checkedAt = store[CHECKED_KEY] || {}
  if (!mine.length || (!force && Date.now() - (checkedAt[stack] || 0) < PAGE_INTERVAL)) return { checked: 0, notices: 0 }
  running.add(stack)
  try {
    const mid = await currentMid(stack)
    let notices = store[NOTICES_KEY] || []
    const fresh = []
    let checked = 0
    for (const [k, w] of mine) {
      if (!watchHere(w, mid)) continue
      checked++
      try {
        if (watchType(w) === 'journey') {
          const cur = await journeySnap(stack, w)
          const changes = diffJourney(w.last, cur, w.on)
          // The notice opens the version that changed.
          const watch = { ...w, name: cur.name, id: cur.id }
          if (changes.length) {
            notices = addNotices(notices, watch, changes)
            fresh.push(...changes.map((c) => `${cur.name} ${c.text}`))
          }
          // The stored ID stays the one watched, so the watch keeps its key in storage.
          watches[k] = { ...w, ...(mid ? { mid } : {}), name: cur.name, latestId: cur.id, last: journeySnapshot(cur), checkedAt: Date.now(), error: undefined, notFound: undefined }
          continue
        }
        const cur = await snapshot(stack, w)
        const changes = diffAutomation(w.last, cur, w.on)
        if (changes.length) {
          notices = addNotices(notices, { ...w, name: cur.name }, changes)
          fresh.push(...changes.map((c) => `${cur.name} ${c.text}`))
        }
        watches[k] = { ...w, name: cur.name, last: { status: cur.status, statusName: automationStatusName(cur.status), lastRunTime: cur.lastRunTime, lastRunStatus: cur.lastRunStatus }, ...(mid ? { mid } : {}), checkedAt: Date.now(), error: undefined, notFound: undefined }
      } catch (e) {
        // 404: not in this BU (watched before BUs were recorded, or deleted). Said
        // plainly instead of the raw API error; the watch stays until unwatched.
        if (e?.status === 404 || /error 404/.test(e?.message || '')) watches[k] = { ...w, notFound: true, error: undefined, checkedAt: Date.now() }
        else watches[k] = { ...w, error: e?.message || String(e), notFound: undefined, checkedAt: Date.now() }
      }
    }
    await chrome.storage.local.set({ [WATCHES_KEY]: watches, [NOTICES_KEY]: notices, [CHECKED_KEY]: { ...checkedAt, [stack]: Date.now() } })
    await updateBadge(notices)
    if (fresh.length && store[NOTIFY_KEY] && chrome.notifications?.create) {
      chrome.notifications.create({ type: 'basic', iconUrl: chrome.runtime.getURL('images/icon128x128.png'), title: 'Marketing Cloud Toolkit: watched automations and journeys', message: fresh.slice(0, 3).join('\n') + (fresh.length > 3 ? `\n+${fresh.length - 3} more` : '') })
    }
    return { checked, notices: fresh.length }
  } finally {
    running.delete(stack)
  }
}
