// Installed package secrets that expire soon (user, 2026-11-05). Only secrets that
// expire within ALERT_DAYS, or have already expired, are shown as alerts (top of the
// app and Home); the full list is on the Installed Packages page.

export const ALERT_DAYS = 7
export const SECRETS_CACHE_KEY = 'toolkit_secret_expirations'
export const SECRETS_DISMISSED_KEY = 'toolkit_secret_alerts_dismissed'
export const SECRETS_MAX_AGE_MS = 6 * 60 * 60 * 1000

const DAY = 86400000

/** Whole days until `iso` (negative once past), or null when it is not a date. */
export function daysUntil(iso, now = Date.now()) {
  const t = Date.parse(iso)
  if (!Number.isFinite(t)) return null
  return Math.floor((t - now) / DAY)
}

/** The secrets to alert about, soonest first: { ...secret, days, expired }. */
export function secretAlerts(list, now = Date.now(), days = ALERT_DAYS) {
  return (list || [])
    .map((s) => ({ ...s, days: daysUntil(s.expires, now), expired: Date.parse(s.expires) <= now }))
    .filter((s) => s.days !== null && (s.expired || Date.parse(s.expires) - now <= days * DAY))
    .sort((a, b) => Date.parse(a.expires) - Date.parse(b.expires))
}

/** Identifies one alert; a renewed secret (new expiry) alerts again. */
export const alertKey = (stack, s) => `${stack}:${s.packageId || s.name}:${s.expires}`

/** "expired 3 days ago", "expires today", "expires in 5 days". */
export function expiryText(s, now = Date.now()) {
  const t = Date.parse(s.expires)
  if (!Number.isFinite(t)) return 'expiry unknown'
  if (t <= now) {
    const ago = Math.floor((now - t) / DAY)
    return ago === 0 ? 'expired today' : `expired ${ago} day${ago === 1 ? '' : 's'} ago`
  }
  const d = Math.floor((t - now) / DAY)
  return d === 0 ? 'expires within a day' : `expires in ${d} day${d === 1 ? '' : 's'}`
}
