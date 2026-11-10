// What Automation Studio shows when an automation is opened (user, 2026-11-10: match it).
// Its Summary tab reads the legacy definition (legacy/v1/beta/bulk/automations/automation/
// definition/<list id>/): created by, last saved by, last paused by, folder, and the
// schedule's start as the wall-clock time in the schedule's own time zone
// (scheduleObject.startDate "2022-05-22T00:00:00", shown as 05/22/2022 12:00 AM). The REST
// record's schedule.startDate is that wall-clock time read as Central (UTC-6, no daylight
// saving) and written as UTC ("2022-05-22T06:00:00Z"), so converting it to the browser's
// zone gave a different day and hour (live check on s10, 2026-11-10).
import { describeRecurrence } from './ical.js'
import { formatDateTime, isNoEndDate, statusWords } from './format.js'
import { automationStatusName } from './watches.js'

/** Automation Studio's time zone names by timeZoneId (its js/constants list, 2026-11-10). */
export const AS_TIMEZONES = {
  1: "(GMT-06:00) Central Standard Time",
  2: "(GMT) Casablanca",
  3: "(GMT) Greenwich Mean Time : Dublin, Edinburgh, Lisbon, London",
  4: "(GMT) Monrovia, Reykjavik",
  5: "(GMT+01:00) Amsterdam, Berlin, Bern, Rome, Stockholm, Vienna",
  6: "(GMT+01:00) Belgrade, Bratislava, Budapest, Ljubljana, Prague",
  7: "(GMT+01:00) Brussels, Copenhagen, Madrid, Paris",
  8: "(GMT+01:00) Sarajevo, Skopje, Warsaw, Zagreb",
  9: "(GMT+01:00) West Central Africa",
  10: "(GMT+02:00) Amman",
  11: "(GMT+02:00) Athens, Bucharest, Istanbul",
  12: "(GMT+02:00) Beirut",
  13: "(GMT+02:00) Cairo",
  14: "(GMT+02:00) Harare, Pretoria",
  15: "(GMT+02:00) Helsinki, Kyiv, Riga, Sofia, Tallinn, Vilnius",
  16: "(GMT+02:00) Jerusalem",
  17: "(GMT+02:00) Minsk",
  18: "(GMT+02:00) Windhoek",
  19: "(GMT+03:00) Baghdad",
  20: "(GMT+03:00) Kuwait, Riyadh",
  21: "(GMT+03:00) Moscow, St. Petersburg, Volgograd",
  22: "(GMT+03:00) Nairobi",
  23: "(GMT+03:00) Tbilisi",
  24: "(GMT+03:30) Tehran",
  25: "(GMT+04:00) Abu Dhabi, Muscat",
  26: "(GMT+04:00) Baku",
  27: "(GMT+04:00) Caucasus Standard Time",
  28: "(GMT+04:00) Port Louis",
  29: "(GMT+04:00) Yerevan",
  30: "(GMT+04:30) Kabul",
  31: "(GMT+05:00) Ekaterinburg",
  32: "(GMT+05:00) Islamabad, Karachi",
  33: "(GMT+05:00) Tashkent",
  34: "(GMT+05:30) Chennai, Kolkata, Mumbai, New Delhi",
  35: "(GMT+05:30) Sri Jayawardenepura",
  36: "(GMT+05:45) Kathmandu",
  37: "(GMT+06:00) Almaty, Novosibirsk",
  38: "(GMT+06:00) Astana, Dhaka",
  39: "(GMT+06:30) Yangon (Rangoon)",
  40: "(GMT+07:00) Bangkok, Hanoi, Jakarta",
  41: "(GMT+07:00) Krasnoyarsk",
  42: "(GMT+08:00) Beijing, Chongqing, Hong Kong, Urumqi",
  43: "(GMT+08:00) Irkutsk, Ulaan Bataar",
  44: "(GMT+08:00) Kuala Lumpur, Singapore",
  45: "(GMT+08:00) Perth",
  46: "(GMT+08:00) Taipei",
  47: "(GMT+09:00) Osaka, Sapporo, Tokyo",
  48: "(GMT+09:00) Seoul",
  49: "(GMT+09:00) Yakutsk",
  50: "(GMT+09:30) Adelaide",
  51: "(GMT+09:30) Darwin",
  52: "(GMT+10:00) Brisbane",
  53: "(GMT+10:00) Canberra, Melbourne, Sydney",
  54: "(GMT+10:00) Guam, Port Moresby",
  55: "(GMT+10:00) Hobart",
  56: "(GMT+10:00) Vladivostok",
  57: "(GMT+11:00) Magadan, Solomon Is., New Caledonia",
  58: "(GMT+12:00) Auckland, Wellington",
  59: "(GMT+12:00) Fiji, Kamchatka, Marshall Is.",
  60: "(GMT+13:00) Nukualofa",
  61: "(GMT-01:00) Azores",
  62: "(GMT-01:00) Cape Verde Is.",
  63: "(GMT-02:00) Mid-Atlantic",
  64: "(GMT-03:00) Brasilia",
  65: "(GMT-03:00) Buenos Aires",
  66: "(GMT-03:00) Georgetown",
  67: "(GMT-03:00) Greenland",
  68: "(GMT-03:00) Montevideo",
  69: "(GMT-03:30) Newfoundland",
  70: "(GMT-04:00) Atlantic Time (Canada)",
  71: "(GMT-04:00) La Paz",
  72: "(GMT-04:00) Manaus",
  73: "(GMT-04:00) Santiago",
  74: "(GMT-04:30) Caracas",
  75: "(GMT-05:00) Bogota, Lima, Quito, Rio Branco",
  76: "(GMT-05:00) Eastern Time (US & Canada)",
  77: "(GMT-05:00) Indiana (East)",
  78: "(GMT-06:00) Central America",
  79: "(GMT-06:00) Central Time (US & Canada)",
  80: "(GMT-06:00) Guadalajara, Mexico City, Monterrey - New",
  81: "(GMT-06:00) Guadalajara, Mexico City, Monterrey - Old",
  82: "(GMT-06:00) Saskatchewan",
  83: "(GMT-07:00) Arizona",
  84: "(GMT-07:00) Chihuahua, La Paz, Mazatlan - New",
  85: "(GMT-07:00) Chihuahua, La Paz, Mazatlan - Old",
  86: "(GMT-07:00) Mountain Time (US & Canada)",
  87: "(GMT-08:00) Pacific Time (US & Canada)",
  88: "(GMT-08:00) Tijuana, Baja California",
  89: "(GMT-09:00) Alaska",
  90: "(GMT-10:00) Hawaii",
  91: "(GMT-11:00) Midway Island, Samoa",
  92: "(GMT-12:00) International Date Line West"
}

const WALL = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/

/** A wall-clock date-time ("2022-05-22T00:00:00") shown as written, with no zone conversion. */
export function wallClock(value) {
  const m = WALL.exec(String(value || ''))
  if (!m || +m[1] < 1900) return '' // SFMC's 0001-01-01 placeholder
  const d = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5]))
  return d.toLocaleString(undefined, { timeZone: 'UTC', year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
}

/** The REST schedule time (wall clock read as UTC-6, written as UTC) back to its wall clock. */
export function restWallClock(value) {
  const t = Date.parse(String(value || ''))
  if (!Number.isFinite(t)) return ''
  return wallClock(new Date(t - 6 * 3600 * 1000).toISOString())
}

export function timeZoneLabel(schedule = {}, legacySchedule = {}) {
  const id = schedule.timezoneId ?? legacySchedule.timeZoneId
  return AS_TIMEZONES[id] || schedule.timezoneName || legacySchedule.timeZone || ''
}

const isActive = (s) => /^(active|scheduled|running)$/i.test(String(s || ''))

/** "Schedule", "File drop", "Trigger" or "None", like the canvas's starting source. */
export function startingSource(d) {
  const t = String(d.type || d.legacy?.automationType || '').toLowerCase()
  if (t.includes('trigger') || d.legacy?.automationTrigger) return 'File drop'
  if (t.includes('schedul') || d.schedule) return 'Schedule'
  return 'None'
}

const who = (u) => (u && typeof u === 'object' ? u.name : u) || ''

/**
 * The Summary rows, in Automation Studio's order: name, description, folder, external key,
 * starting source, workflow, status, created, saved, paused, last run, ID.
 */
export function automationOverviewRows(d) {
  const L = d.legacy || {}
  const steps = d.steps || []
  const acts = steps.reduce((n, s) => n + (s.activities?.length || 0), 0)
  return [
    ['Name', d.name], ['Description', d.description ?? L.description], ['Folder', L.folderPath],
    ['External key', d.key ?? L.key], ['Starting source', startingSource(d)],
    ['Workflow', steps.length ? `${acts} ${acts === 1 ? 'activity' : 'activities'} in ${steps.length} ${steps.length === 1 ? 'step' : 'steps'}` : 'No activities'],
    ['Status', automationStatusName(d.status ?? L.status)],
    ['Created by', who(L.createdBy) || who(d.createdBy)], ['Created', formatDateTime(L.createdDate || d.createdDate)],
    ['Last saved by', who(L.lastSavedBy) || who(L.modifiedBy) || who(d.modifiedBy)], ['Last saved', formatDateTime(L.lastSaveDate || L.modifiedDate || d.modifiedDate)],
    ['Last paused by', who(L.lastPausedBy)], ['Last paused', formatDateTime(L.lastPausedDate)],
    ['Last run', formatDateTime(d.lastRunTime || L.lastRunTime)], ['Last run status', statusWords(d.lastRunStatus)],
    ['ID', d.id],
  ].filter(([, v]) => v != null && v !== '').map(([k, v]) => [k, String(v)])
}

/**
 * The schedule as Automation Studio's starting source panel shows it: Active or Paused,
 * Repeat, Starting, Ending ("Never" for SFMC's 2079 end), Time zone, and the next run.
 * `note`: its paused sentence, `description`: SFMC's own one-line summary.
 */
export function scheduleSummary(d) {
  const s = d?.schedule || {}
  const ls = d?.legacy?.scheduleObject || {}
  const status = s.scheduleStatus || ls.scheduleStatus || ''
  const recur = s.icalRecur || ls.iCalRecur
  const end = s.endDate || s.endTime
  const rows = [
    ['Status', status ? (isActive(status) ? 'Active' : statusWords(status).replace(/^paused$/i, 'Paused')) : ''],
    ['Repeat', describeRecurrence(recur) || recur || ''],
    ['Starting', wallClock(ls.startDate) || restWallClock(s.startDate)],
    ['Ending', end ? (isNoEndDate(end) ? 'Never' : restWallClock(end)) : ''],
    ['Time zone', timeZoneLabel(s, ls)],
    ['Next run', isActive(status) ? formatDateTime(s.scheduledTime) : ''],
  ].map(([k, v]) => [k, v || '—'])
  const note = status && !isActive(status) ? 'The schedule is suspended and must be activated for scheduled runs to resume.' : ''
  return { rows, note, description: ls.description || '', active: isActive(status), status }
}
