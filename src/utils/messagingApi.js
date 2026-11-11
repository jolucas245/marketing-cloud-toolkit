// Read-only lookups for sending (user, 2026-11-10; all checked live on s10 that day):
// - Transactional Messaging: REST messaging/v1 email|sms definitions, a definition, its
//   queue, a message's status by messageKey, and the messages that were not sent.
// - Event Notification Service: REST platform/v1 ens-callbacks and ens-subscriptions.
// - Triggered sends: SOAP TriggeredSendDefinition + TriggeredSendSummary (counts).
// - Sends: SOAP Send (one JobID, or the sends since a date).
// - Users and roles: SOAP AccountUser and Role with QueryAllAccounts (users live at the
//   enterprise; without it SFMC returns none).
// REST goes through the Journey Builder host's /fuelapi, which answered every route.
import { sfmcFetch } from './sfmcApi.js'
import { soapRetrieveAll, asList } from './soapApi.js'

const API = (stack) => `https://jbinteractions.${stack}.marketingcloudapps.com/fuelapi`
const enc = encodeURIComponent

// ── Transactional Messaging ───────────────────────────────
export const TMS_CHANNELS = ['email', 'sms']

/** Every definition of a channel (pages of 50). */
export async function fetchTmsDefinitions(stack, channel, fetch = sfmcFetch) {
  const out = []
  for (let page = 1; page <= 40; page++) {
    const d = await fetch(`${API(stack)}/messaging/v1/${channel}/definitions?$page=${page}&$pageSize=50`, 'GET')
    const list = d?.definitions || []
    out.push(...list)
    if (list.length < 50 || out.length >= Number(d?.count || 0)) break
  }
  return out
}
export const fetchTmsDefinition = (stack, channel, key, fetch = sfmcFetch) => fetch(`${API(stack)}/messaging/v1/${channel}/definitions/${enc(key)}`, 'GET')
/** { count, ageSeconds }: messages waiting for this definition, and the oldest one's age. */
export const fetchTmsQueue = (stack, channel, key, fetch = sfmcFetch) => fetch(`${API(stack)}/messaging/v1/${channel}/definitions/${enc(key)}/queue`, 'GET')

/** One message's status by its messageKey. SFMC answers an unknown key with a 404 or a 500. */
export async function fetchTmsMessage(stack, channel, messageKey, fetch = sfmcFetch) {
  try {
    return await fetch(`${API(stack)}/messaging/v1/${channel}/messages/${enc(messageKey)}`, 'GET')
  } catch (e) {
    if (e.status === 404 || e.status === 500 || /not found|Internal Server Error/i.test(e.message || '')) {
      const err = new Error('SFMC has no message with this key for this channel (or it is older than SFMC keeps message status).')
      err.notFound = true
      throw err
    }
    throw e
  }
}

/** Email messages not sent (newest events after `lastEventId`; 0 = from the start). */
export const fetchTmsNotSent = (stack, lastEventId = 0, pageSize = 100, fetch = sfmcFetch) =>
  fetch(`${API(stack)}/messaging/v1/email/messages/?type=notSent&$pageSize=${pageSize}${lastEventId ? `&lastEventId=${enc(lastEventId)}` : ''}`, 'GET')

// ── Event Notification Service ────────────────────────────
export async function fetchEns(stack, fetch = sfmcFetch) {
  const [callbacks, subscriptions] = await Promise.all([
    fetch(`${API(stack)}/platform/v1/ens-callbacks`, 'GET'),
    fetch(`${API(stack)}/platform/v1/ens-subscriptions`, 'GET'),
  ])
  return { callbacks: Array.isArray(callbacks) ? callbacks : callbacks?.items || [], subscriptions: Array.isArray(subscriptions) ? subscriptions : subscriptions?.items || [] }
}

// ── Triggered sends (SOAP) ────────────────────────────────
const TSD_PROPS = ['ObjectID', 'CustomerKey', 'Name', 'Description', 'TriggeredSendStatus', 'CreatedDate', 'ModifiedDate', 'CategoryID',
  'Email.ID', 'SendClassification.CustomerKey', 'IsPlatformObject', 'List.ID', 'AutoAddSubscribers', 'AutoUpdateSubscribers', 'FromName', 'FromAddress', 'EmailSubject']
const TSS_PROPS = ['CustomerKey', 'Sent', 'NotSentDueToOptOut', 'NotSentDueToUndeliverable', 'NotSentDueToError', 'Queued', 'InProcess', 'Bounces', 'Opens', 'UniqueOpens', 'Clicks', 'UniqueClicks', 'OptOuts', 'Conversions']
export const TSD_STATUSES = ['New', 'Active', 'Inactive', 'Canceled', 'Deleted', 'Moved']
const num = (v) => (v == null || v === '' ? null : Number(v))

/** Every triggered send definition with its counts (joined by CustomerKey). */
export async function fetchTriggeredSends(stack, { retrieve } = {}) {
  const opts = retrieve ? { retrieve } : {}
  const [defs, sums] = await Promise.all([
    soapRetrieveAll(stack, 'TriggeredSendDefinition', TSD_PROPS, { ...opts, filter: { property: 'TriggeredSendStatus', operator: 'IN', values: TSD_STATUSES } }),
    soapRetrieveAll(stack, 'TriggeredSendSummary', TSS_PROPS, opts).catch(() => []),
  ])
  const byKey = new Map(sums.map((s) => [s.CustomerKey, s]))
  return defs.map((d) => {
    const s = byKey.get(d.CustomerKey) || {}
    return {
      id: d.ObjectID, key: d.CustomerKey, name: d.Name, description: d.Description || '', status: d.TriggeredSendStatus,
      createdDate: d.CreatedDate, modifiedDate: d.ModifiedDate, categoryId: num(d.CategoryID), emailId: num(d.Email?.ID),
      sendClassification: d.SendClassification?.CustomerKey || '', listId: num(d.List?.ID), fromName: d.FromName || '', fromAddress: d.FromAddress || '',
      subject: d.EmailSubject || '', isPlatformObject: d.IsPlatformObject === 'true',
      sent: num(s.Sent), queued: num(s.Queued), inProcess: num(s.InProcess), notSentError: num(s.NotSentDueToError),
      notSentOptOut: num(s.NotSentDueToOptOut), notSentUndeliverable: num(s.NotSentDueToUndeliverable),
      bounces: num(s.Bounces), opens: num(s.UniqueOpens ?? s.Opens), clicks: num(s.UniqueClicks ?? s.Clicks), optOuts: num(s.OptOuts),
    }
  })
}

/** What needs a look on a triggered send: an active one with a queue or errors. */
export function triggeredSendFlags(t) {
  const flags = []
  if (t.queued > 0) flags.push(`${t.queued.toLocaleString()} queued`)
  if (t.notSentError > 0) flags.push(`${t.notSentError.toLocaleString()} not sent (error)`)
  if (/^(inactive|new)$/i.test(t.status || '') && t.queued > 0) flags.push('queued while not active')
  return flags
}

// ── Sends (SOAP) ──────────────────────────────────────────
const SEND_PROPS = ['ID', 'EmailName', 'Subject', 'SentDate', 'SendDate', 'CreatedDate', 'Status', 'NumberTargeted', 'NumberSent', 'NumberDelivered', 'NumberErrored', 'NumberExcluded',
  'UniqueOpens', 'UniqueClicks', 'HardBounces', 'SoftBounces', 'OtherBounces', 'Unsubscribes', 'ExistingUndeliverables', 'ExistingUnsubscribes', 'MissingAddresses',
  'Duplicates', 'InvalidAddresses', 'ForwardedEmails', 'FromName', 'FromAddress', 'Email.ID', 'IsMultipart', 'IsAlwaysOn']

export function sendRow(s) {
  const n = (k) => num(s[k])
  return {
    jobId: n('ID'), emailName: s.EmailName || '', subject: s.Subject || '', sentDate: s.SentDate || s.SendDate || '', status: s.Status || '',
    targeted: n('NumberTargeted'), sent: n('NumberSent'), delivered: n('NumberDelivered'), errored: n('NumberErrored'), excluded: n('NumberExcluded'),
    uniqueOpens: n('UniqueOpens'), uniqueClicks: n('UniqueClicks'), hardBounces: n('HardBounces'), softBounces: n('SoftBounces'), otherBounces: n('OtherBounces'),
    unsubscribes: n('Unsubscribes'), existingUndeliverables: n('ExistingUndeliverables'), existingUnsubscribes: n('ExistingUnsubscribes'),
    missingAddresses: n('MissingAddresses'), duplicates: n('Duplicates'), invalidAddresses: n('InvalidAddresses'), forwarded: n('ForwardedEmails'),
    fromName: s.FromName || '', fromAddress: s.FromAddress || '', emailId: num(s.Email?.ID), isAlwaysOn: s.IsAlwaysOn === 'true',
  }
}

/** One send by JobID, or the sends since `since` (ISO date), newest first. */
export async function fetchSends(stack, { jobId = null, since = null, retrieve } = {}) {
  const filter = jobId != null
    ? { property: 'ID', operator: 'equals', values: [String(Number(jobId))] }
    : { property: 'SentDate', operator: 'greaterThan', values: [since], dates: true }
  const rows = await soapRetrieveAll(stack, 'Send', SEND_PROPS, { filter, ...(retrieve ? { retrieve } : {}) })
  return rows.map(sendRow).sort((a, b) => String(b.sentDate).localeCompare(String(a.sentDate)))
}

// ── Users and roles (SOAP) ────────────────────────────────
const USER_PROPS = ['ID', 'UserID', 'Name', 'Email', 'ActiveFlag', 'IsAPIUser', 'IsLocked', 'MustChangePassword', 'LastSuccessfulLogin', 'CreatedDate', 'ModifiedDate', 'DefaultBusinessUnit', 'CustomerKey', 'Roles']
const PLACEHOLDER = /^0001-01-01/

export function userRow(u) {
  const roles = asList(u.Roles?.Role).filter(Boolean)
  return {
    id: num(u.ID), username: u.UserID || '', name: u.Name || '', email: u.Email || '', active: u.ActiveFlag === 'true',
    apiUser: u.IsAPIUser === 'true', locked: u.IsLocked === 'true', mustChangePassword: u.MustChangePassword === 'true',
    lastLogin: u.LastSuccessfulLogin && !PLACEHOLDER.test(u.LastSuccessfulLogin) ? u.LastSuccessfulLogin : '',
    createdDate: u.CreatedDate || '', modifiedDate: u.ModifiedDate || '', defaultBusinessUnit: num(u.DefaultBusinessUnit), key: u.CustomerKey || '',
    // Every user has a private "Individual role for <id>"; the named roles are the ones that say something.
    roles: roles.filter((r) => r.IsPrivate !== 'true').map((r) => r.Name).filter(Boolean),
  }
}

export async function fetchUsers(stack, { retrieve } = {}) {
  const rows = await soapRetrieveAll(stack, 'AccountUser', USER_PROPS, {
    queryAllAccounts: true, filter: { property: 'ActiveFlag', operator: 'IN', values: ['0', '1'] }, ...(retrieve ? { retrieve } : {}),
  })
  return rows.map(userRow)
}

/** Days since `date` (null when never). */
export function daysSince(date, now = Date.now()) {
  const t = Date.parse(date || '')
  return Number.isFinite(t) ? Math.floor((now - t) / 86400000) : null
}

/** Things worth a look on a user: active but not logged in for 90+ days, never, locked, API user. */
export function userFlags(u, now = Date.now()) {
  const flags = []
  const days = daysSince(u.lastLogin, now)
  if (u.active && !u.apiUser && days == null) flags.push('Never logged in')
  else if (u.active && !u.apiUser && days >= 90) flags.push(`No login for ${days} days`)
  if (u.locked) flags.push('Locked')
  return flags
}
