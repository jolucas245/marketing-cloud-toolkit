// Chrome notifications for finished background jobs (feedback #1092). Shown only when
// the optional `notifications` permission is already granted (watches use the same
// permission); nothing asks for it here. A click focuses the Toolkit tab that ran the
// job and opens the job's page there; when that tab is gone, a new Toolkit tab opens on
// Activity history (the results lived in the closed tab).
// The text comes from composables/useJobs.js finishText: counts and names, never email
// addresses.

const PREFIX = 'tkjob|'
const APP_PAGE = 'app.html'

const safePath = (p) => (typeof p === 'string' && /^\/[A-Za-z0-9/_?=&%.-]*$/.test(p) ? p : '/activity')

/** The notification id carries the tab and the page: tkjob|<tabId>|<stamp>|<path>. */
export function notificationId(tabId, path, now = Date.now()) {
  return `${PREFIX}${Number.isInteger(tabId) ? tabId : ''}|${now.toString(36)}|${safePath(path)}`
}

export function parseNotificationId(id) {
  if (typeof id !== 'string' || !id.startsWith(PREFIX)) return null
  const [tab, , ...rest] = id.slice(PREFIX.length).split('|')
  const tabId = /^\d+$/.test(tab) ? Number(tab) : null
  return { tabId, path: safePath(rest.join('|')) }
}

/** JOB_NOTIFY { title, message, path } from an app page. */
export async function notifyJob(m, sender) {
  if (!chrome.notifications?.create) return { shown: false }
  const id = notificationId(sender?.tab?.id, m?.path)
  await new Promise((resolve) => {
    try {
      chrome.notifications.create(id, {
        type: 'basic',
        iconUrl: chrome.runtime.getURL('images/icon128x128.png'),
        title: `Marketing Cloud Toolkit: ${String(m?.title || 'Background task').slice(0, 120)}`,
        message: String(m?.message || '').slice(0, 300),
      }, () => resolve())
    } catch { resolve() }
  })
  return { shown: true }
}

const call = (fn) => new Promise((resolve) => {
  try { fn((v) => resolve(chrome.runtime.lastError ? null : v ?? null)) } catch { resolve(null) }
})

// Without the tabs permission Chrome hides tab URLs, so the extension's own contexts
// are asked instead (runtime.getContexts, Chrome 116+).
async function showsToolkit(tab, appUrl) {
  if (tab.url) return String(tab.url).startsWith(appUrl)
  try {
    const contexts = await chrome.runtime.getContexts?.({ contextTypes: ['TAB'], tabIds: [tab.id] })
    return !!contexts?.some((c) => String(c.documentUrl || '').startsWith(appUrl))
  } catch { return false }
}

export async function openFromNotification(id) {
  const target = parseNotificationId(id)
  if (!target) return false
  try { chrome.notifications?.clear?.(id) } catch { /* ignore */ }
  const appUrl = chrome.runtime.getURL(APP_PAGE)
  const tab = target.tabId != null ? await call((cb) => chrome.tabs.get(target.tabId, cb)) : null
  // Only a tab still showing the Toolkit gets the page; a tab that moved on to another
  // site is left alone.
  if (tab && await showsToolkit(tab, appUrl)) {
    await call((cb) => chrome.tabs.update(tab.id, { active: true, url: `${appUrl}#${target.path}` }, cb))
    if (tab.windowId != null && chrome.windows?.update) await call((cb) => chrome.windows.update(tab.windowId, { focused: true }, cb))
    return true
  }
  await call((cb) => chrome.tabs.create({ url: `${appUrl}#/activity` }, cb))
  return true
}

let registered = false
function register() {
  if (registered || !chrome.notifications?.onClicked) return
  registered = true
  chrome.notifications.onClicked.addListener((id) => { if (String(id).startsWith(PREFIX)) openFromNotification(id) })
}

/** Listens for clicks now, or once the user grants the optional permission. */
export function listenForJobClicks() {
  register()
  try {
    chrome.permissions?.onAdded?.addListener((p) => { if (p?.permissions?.includes('notifications')) register() })
  } catch { /* ignore */ }
}
