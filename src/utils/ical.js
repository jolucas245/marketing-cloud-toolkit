// Plain-English recurrence for an automation schedule's iCal RRULE, e.g.
// "FREQ=WEEKLY;INTERVAL=2;BYDAY=MO,WE" → "Every 2 weeks on Monday, Wednesday"
// (from SFMC Automation Viewer's parseIcalRecur). Unknown parts are left out.
const DAYS = { MO: 'Monday', TU: 'Tuesday', WE: 'Wednesday', TH: 'Thursday', FR: 'Friday', SA: 'Saturday', SU: 'Sunday' }
const UNITS = { MINUTELY: 'minute', HOURLY: 'hour', DAILY: 'day', WEEKLY: 'week', MONTHLY: 'month', YEARLY: 'year' }

export function describeRecurrence(ical) {
  if (!ical || typeof ical !== 'string') return null
  const parts = Object.fromEntries(ical.replace(/^RRULE:/i, '').split(';').filter(Boolean).map((p) => {
    const [k, ...v] = p.split('=')
    return [k.trim().toUpperCase(), v.join('=').trim()]
  }))
  if (!parts.FREQ) return null
  const interval = Math.max(1, parseInt(parts.INTERVAL || '1', 10) || 1)
  const unit = UNITS[parts.FREQ.toUpperCase()] || parts.FREQ.toLowerCase()
  let text = interval === 1 ? `Every ${unit}` : `Every ${interval} ${unit}s`
  if (parts.BYDAY) text += ` on ${parts.BYDAY.split(',').map((d) => DAYS[d.replace(/^[-+]?\d+/, '')] || d).join(', ')}`
  if (parts.BYMONTHDAY) text += ` on day ${parts.BYMONTHDAY.split(',').join(', ')}`
  if (parts.COUNT) text += `, ${parts.COUNT} times`
  const until = untilDate(parts.UNTIL)
  if (until) text += `, until ${until}`
  else if (parts.UNTIL && !/^\d{8}/.test(parts.UNTIL)) text += `, until ${parts.UNTIL}`
  return text
}

// UNTIL is 20790606T030000 style. SFMC writes 2079-06-06 (the largest SQL smalldatetime)
// for a schedule with no end date, so that one is left out (live test, 2026-11-07).
function untilDate(v) {
  const m = /^(\d{4})(\d{2})(\d{2})/.exec(String(v || ''))
  if (!m || Number(m[1]) >= 2079) return ''
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]))
  return d.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })
}
