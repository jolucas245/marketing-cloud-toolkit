// Which icon an automation activity gets (feedback #123), by objectTypeId or by a type
// name such as "SQL Query", "Script" or "Data Extract" (Where used, run summaries).

const BY_ID = {
  300: 'query', 423: 'script', 43: 'import', 726: 'import', 73: 'extract', 53: 'transfer',
  42: 'email', 771: 'email', 725: 'email', 1000: 'verification', 303: 'filter', 467: 'wait',
  952: 'journey', 736: 'mobile', 33: 'sms', 45: 'refresh', 426: 'refresh', 724: 'refresh', 1010: 'refresh',
  427: 'audience', 615: 'audience',
}

const BY_NAME = [
  [/query|sql/i, 'query'], [/script|ssjs/i, 'script'], [/import/i, 'import'], [/extract/i, 'extract'],
  [/transfer/i, 'transfer'], [/email|send/i, 'email'], [/verif/i, 'verification'], [/filter/i, 'filter'],
  [/wait/i, 'wait'], [/journey/i, 'journey'], [/push|mobile/i, 'mobile'], [/sms/i, 'sms'],
  [/refresh/i, 'refresh'], [/audience/i, 'audience'],
]

export function activityIconKind(type) {
  if (type == null || type === '') return 'other'
  const n = Number(type)
  if (Number.isInteger(n) && String(n) === String(type).trim()) return BY_ID[n] || 'other'
  return BY_NAME.find(([re]) => re.test(String(type)))?.[1] || 'other'
}

// Automation Studio's own glyph for a type (user, 2026-11-10): by objectTypeId from its
// ACTIVITIES table, or for a type name through the kind above.
const KIND_TYPE = {
  query: 300, script: 423, import: 43, extract: 73, transfer: 53, email: 42, verification: 1000, filter: 303,
  wait: 467, journey: 952, mobile: 736, sms: 725, refresh: 45, audience: 427,
}
export function activityGlyph(type, table) {
  if (type == null || type === '') return 'undefined-activity'
  const n = Number(type)
  if (Number.isInteger(n) && String(n) === String(type).trim()) return table[n] || 'undefined-activity'
  const t = KIND_TYPE[activityIconKind(type)]
  return t ? table[t] : 'undefined-activity'
}
