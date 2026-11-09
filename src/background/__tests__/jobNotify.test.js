import { describe, it, expect, vi, beforeEach } from 'vitest'
import { notificationId, parseNotificationId, notifyJob, openFromNotification } from '../jobNotify.js'

// Chrome notifications for finished background jobs (feedback #1092).
const APP = 'chrome-extension://abc/app.html'
function fakeChrome({ notifications = true, tab = null, contexts = [] } = {}) {
  globalThis.chrome = {
    runtime: { getURL: (p) => `chrome-extension://abc/${p}`, lastError: null, getContexts: vi.fn(async () => contexts) },
    tabs: {
      get: vi.fn((id, cb) => cb(tab && tab.id === id ? tab : undefined)),
      update: vi.fn((id, props, cb) => cb({ id, ...props })),
      create: vi.fn((props, cb) => cb({ id: 99, ...props })),
    },
    windows: { update: vi.fn((id, props, cb) => cb({})) },
    ...(notifications ? { notifications: { create: vi.fn((id, opts, cb) => cb(id)), clear: vi.fn() } } : {}),
  }
}

describe('notification ids', () => {
  it('carry the tab and a safe app path', () => {
    const id = notificationId(12, '/email-validation?job=ab1', 1000)
    expect(parseNotificationId(id)).toEqual({ tabId: 12, path: '/email-validation?job=ab1' })
    expect(parseNotificationId(notificationId(undefined, 'javascript:alert(1)'))).toEqual({ tabId: null, path: '/activity' })
    expect(parseNotificationId('other')).toBe(null)
  })
})

describe('notifyJob', () => {
  beforeEach(() => fakeChrome())
  it('shows nothing without the optional permission', async () => {
    fakeChrome({ notifications: false })
    expect(await notifyJob({ title: 'T', message: 'M', path: '/x' }, { tab: { id: 3 } })).toEqual({ shown: false })
  })
  it('creates a notification tied to the sending tab', async () => {
    expect(await notifyJob({ title: 'Email validation: 3 addresses finished', message: '3 valid', path: '/email-validation?job=j' }, { tab: { id: 3 } })).toEqual({ shown: true })
    const [id, opts] = chrome.notifications.create.mock.calls[0]
    expect(parseNotificationId(id)).toEqual({ tabId: 3, path: '/email-validation?job=j' })
    expect(opts).toMatchObject({ type: 'basic', title: 'Marketing Cloud Toolkit: Email validation: 3 addresses finished', message: '3 valid' })
  })
})

describe('openFromNotification', () => {
  it('focuses the Toolkit tab that ran the job and opens its page', async () => {
    fakeChrome({ tab: { id: 3, windowId: 7 }, contexts: [{ documentUrl: `${APP}#/home` }] })
    await openFromNotification(notificationId(3, '/email-validation?job=j'))
    expect(chrome.tabs.update).toHaveBeenCalledWith(3, { active: true, url: `${APP}#/email-validation?job=j` }, expect.any(Function))
    expect(chrome.windows.update).toHaveBeenCalledWith(7, { focused: true }, expect.any(Function))
    expect(chrome.tabs.create).not.toHaveBeenCalled()
  })
  it('leaves a tab that moved to another site alone and opens Activity history in a new tab', async () => {
    fakeChrome({ tab: { id: 3, windowId: 7 }, contexts: [] })
    await openFromNotification(notificationId(3, '/email-validation?job=j'))
    expect(chrome.tabs.update).not.toHaveBeenCalled()
    expect(chrome.tabs.create).toHaveBeenCalledWith({ url: `${APP}#/activity` }, expect.any(Function))
  })
  it('opens Activity history when the tab is gone', async () => {
    fakeChrome()
    await openFromNotification(notificationId(3, '/email-validation?job=j'))
    expect(chrome.tabs.create).toHaveBeenCalledWith({ url: `${APP}#/activity` }, expect.any(Function))
  })
})
