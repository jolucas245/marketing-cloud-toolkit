// Contacts > SMS subscriptions (API idea 17, user 2026-11-11). REST POST
// sms/v1/contacts/subscriptions: a lookup despite the POST (SFMC changes nothing), with up
// to 500 mobile numbers in country-code format (15551234567) or subscriber keys, answering
// each subscription with its short code, keyword and status. Needs MobileConnect: when SFMC
// refuses the call (403, 404, or an error that names MobileConnect or permissions) the page
// shows a plain note instead of an error.
// Not checked live: the host (the Journey Builder app's /fuelapi, which answered the other
// public REST routes such as messaging/v1 on s10, 2026-11-10; sms/v1 itself was never
// called), the request field names (MobileNumbers / SubscriberKeys, from SFMC's docs) and
// the answer's field names (read loosely below).
// Phone numbers are never logged: the call uses sfmcFetchQuiet, which keeps the body and the
// answer out of the API console, and errors are shown with long digit runs masked.
import { sfmcFetchQuiet } from './sfmcApi.js'

const API = (stack) => `https://jbinteractions.${stack}.marketingcloudapps.com/fuelapi`
export const SMS_LOOKUP_LIMIT = 500

const first = (o, keys) => { for (const k of keys) if (o?.[k] != null && o[k] !== '') return o[k]; return null }
const str = (v) => (v == null ? '' : String(v))

/** "+1 (555) 123-4567" or "001 555..." -> "15551234567"; null when it cannot be a number. */
export function normalizeMobile(s) {
  let t = String(s || '').trim()
  if (!/^[+\d\s().-]+$/.test(t)) return null
  t = t.replace(/[\s().-]/g, '').replace(/^\+/, '').replace(/^00/, '')
  return /^\d{8,15}$/.test(t) ? t : null
}

/** True when every entry reads like a phone number (Detect mode). */
export const looksLikeMobiles = (entries) => entries.length > 0 && entries.every((e) => /^[+\d\s().-]+$/.test(e) && /\d{6}/.test(e.replace(/\D/g, '')))

/**
 * The lookup's entries from pasted text: one per line, comma, semicolon or tab; trimmed,
 * duplicates dropped. `mode`: 'auto' | 'mobile' | 'key'. Returns
 * { kind: 'mobile' | 'key', values[], invalid[], over } (over = entries past the 500 limit).
 */
export function parseLookupInput(text, mode = 'auto') {
  const entries = [...new Set(String(text || '').split(/[\n\r,;\t]+/).map((s) => s.trim()).filter(Boolean))]
  const kind = mode === 'mobile' || (mode === 'auto' && looksLikeMobiles(entries)) ? 'mobile' : 'key'
  let values = entries
  const invalid = []
  if (kind === 'mobile') {
    values = []
    for (const e of entries) {
      const n = normalizeMobile(e)
      if (n) { if (!values.includes(n)) values.push(n) } else invalid.push(e)
    }
  }
  return { kind, values: values.slice(0, SMS_LOOKUP_LIMIT), invalid, over: Math.max(0, values.length - SMS_LOOKUP_LIMIT) }
}

export const lookupBody = (kind, values) => (kind === 'mobile' ? { MobileNumbers: values } : { SubscriberKeys: values })

/** One subscription in plain fields; field names guessed loosely (not seen live). */
export function smsSubscriptionRow(c) {
  return {
    mobileNumber: str(first(c, ['mobileNumber', 'MobileNumber', 'mobile', 'phoneNumber'])),
    subscriberKey: str(first(c, ['subscriberKey', 'SubscriberKey', 'contactKey'])),
    shortCode: str(first(c, ['shortCode', 'ShortCode', 'code'])),
    keyword: str(first(c, ['keyword', 'Keyword', 'keywordName'])),
    status: str(first(c, ['status', 'Status', 'subscriptionStatus', 'optInStatus'])),
    optInDate: str(first(c, ['optInDate', 'OptInDate', 'optedInDate', 'createdDate'])),
    optOutDate: str(first(c, ['optOutDate', 'OptOutDate', 'optedOutDate'])),
    raw: c,
  }
}

/** The list of subscriptions in an answer of unknown shape. */
export function subscriptionsFrom(d) {
  if (Array.isArray(d)) return d
  for (const k of ['contacts', 'subscriptions', 'items', 'results', 'Contacts']) if (Array.isArray(d?.[k])) return d[k]
  return []
}

/** Entries the answer says nothing about. */
export function notInAnswer(kind, values, rows) {
  const seen = new Set(rows.map((r) => (kind === 'mobile' ? r.mobileNumber.replace(/\D/g, '') : r.subscriberKey)))
  return values.filter((v) => !seen.has(v))
}

/** Plain words for a status ("active" -> "Opted in"); unknown text is shown as SFMC sends it. */
export function statusWords(status) {
  const s = String(status || '').toLowerCase()
  if (/^(active|subscribed|opt(ed)?[\s_-]?in)$/.test(s)) return 'Opted in'
  if (/^(inactive|unsubscribed|opt(ed)?[\s_-]?out)$/.test(s)) return 'Opted out'
  if (/pending|double/.test(s)) return 'Waiting for the reply'
  return status || ''
}

/** MobileConnect missing, or no permission: a note, not an error. */
export function isSmsRefused(e) {
  return e?.status === 403 || e?.status === 404 || /mobile ?connect|not (enabled|provisioned)|not authori[sz]ed|forbidden|insufficient privileges|permission/i.test(String(e?.message || ''))
}

export const maskDigits = (s) => String(s || '').replace(/\+?\d[\d\s()-]{5,}\d/g, '[number]')

/**
 * Looks up SMS subscriptions. Returns { rows[], notFound[] } or { refused: true, status }.
 * Any other failure throws with long digit runs masked.
 */
export async function lookupSmsSubscriptions(stack, kind, values, fetch = sfmcFetchQuiet) {
  const list = values.slice(0, SMS_LOOKUP_LIMIT)
  if (!list.length) return { rows: [], notFound: [] }
  let d
  try {
    d = await fetch(`${API(stack)}/sms/v1/contacts/subscriptions`, 'POST', lookupBody(kind, list))
  } catch (e) {
    if (isSmsRefused(e)) return { refused: true, status: e.status ?? null }
    const err = new Error(maskDigits(e?.message || 'SMS lookup failed'))
    err.status = e?.status ?? null
    err.code = e?.code ?? null
    err.app = e?.app ?? null
    throw err
  }
  const rows = subscriptionsFrom(d).map(smsSubscriptionRow)
  return { rows, notFound: notInAnswer(kind, list, rows) }
}
