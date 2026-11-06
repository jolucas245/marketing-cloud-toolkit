// A data extension's properties as label / value pairs, from SFMC's internal
// customobjects record (fetchDEDetail). Field names are the ones the Toolkit sends when it
// creates a DE (createDE.js: isSendable, sendableCustomObjectField,
// sendableSubscriberField, isTestable, dataRetentionProperties). A property SFMC does not
// return is left out rather than guessed.
import { RETENTION_UNITS } from './createDE/createDE.js'
import { formatDateTime } from './format.js'

const SUBSCRIBER_FIELDS = { _subscriberkey: 'Subscriber Key', _emailaddress: 'Email Address', _subscriberid: 'Subscriber ID' }

const nameOf = (v) => (v && typeof v === 'object' ? v.name || v.fieldName || '' : String(v ?? '')).trim()

/** "Email relates to Subscriber Key", or '' when SFMC gives no send relationship. */
export function sendRelationship(d) {
  const de = nameOf(d?.sendableCustomObjectField)
  const sub = nameOf(d?.sendableSubscriberField)
  if (!de) return ''
  const subLabel = SUBSCRIBER_FIELDS[sub.toLowerCase()] || sub.replace(/^_/, '') || 'Subscriber Key'
  return `${de} relates to ${subLabel}`
}

/** "Delete individual records after 30 days", "Off", or '' when SFMC does not say. */
export function retentionText(d) {
  if (!d || !('dataRetentionProperties' in d)) return ''
  const r = d.dataRetentionProperties
  const n = Number(r?.dataRetentionPeriodLength)
  if (!r || !n) return 'Off'
  const unit = RETENTION_UNITS.find((u) => u.id === Number(r.dataRetentionPeriodUnitOfMeasure))?.label || 'periods'
  const what = r.isRowBasedRetention ? 'Delete individual records' : r.isDeleteAtEndOfRetentionPeriod ? 'Delete all records and the data extension' : 'Delete all records'
  return `${what} after ${n} ${n === 1 ? unit.replace(/s$/, '') : unit}`
}

const yesNo = (v) => (typeof v === 'boolean' ? (v ? 'Yes' : 'No') : '')

/** [{ key, label, value }] for the properties SFMC returned. */
export function deProperties(d, { folderPath = '' } = {}) {
  if (!d) return []
  const rows = typeof d.totalRowCount === 'number' ? d.totalRowCount.toLocaleString() : ''
  const list = [
    { key: 'rows', label: 'Rows', value: rows },
    { key: 'sendable', label: 'Sendable', value: yesNo(d.isSendable) },
    { key: 'relationship', label: 'Send relationship', value: d.isSendable === false ? '' : sendRelationship(d) },
    { key: 'testable', label: 'Testable', value: yesNo(d.isTestable) },
    { key: 'retention', label: 'Data retention', value: retentionText(d) },
    { key: 'key', label: 'External key', value: d.customerKey || d.key || '' },
    { key: 'folder', label: 'Folder', value: folderPath },
    { key: 'created', label: 'Created', value: d.createdDate ? formatDateTime(d.createdDate) : '' },
    { key: 'modified', label: 'Modified', value: d.modifiedDate ? formatDateTime(d.modifiedDate) : '' },
  ]
  return list.filter((p) => p.value)
}
