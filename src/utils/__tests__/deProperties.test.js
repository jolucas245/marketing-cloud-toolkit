import { describe, it, expect } from 'vitest'
import { deProperties, sendRelationship, retentionText } from '../deProperties.js'

// Email validation shows the picked DE's properties (user, 2026-11-06).
describe('deProperties', () => {
  const sendable = {
    customerKey: 'NEWS-KEY', totalRowCount: 52340, isSendable: true, isTestable: false,
    sendableCustomObjectField: 'SubscriberKey', sendableSubscriberField: '_SubscriberKey',
    dataRetentionProperties: { isRowBasedRetention: true, dataRetentionPeriodLength: 30, dataRetentionPeriodUnitOfMeasure: 3 },
  }

  it('lists rows, sendable, its relationship, testable, retention, key and folder', () => {
    const props = deProperties(sendable, { folderPath: 'Data Extensions > News' })
    expect(Object.fromEntries(props.map((p) => [p.label, p.value]))).toEqual({
      Rows: (52340).toLocaleString(),
      Sendable: 'Yes',
      'Send relationship': 'SubscriberKey relates to Subscriber Key',
      Testable: 'No',
      'Data retention': 'Delete individual records after 30 days',
      'External key': 'NEWS-KEY',
      Folder: 'Data Extensions > News',
    })
  })

  it('leaves out what SFMC did not return, and shows 0 rows', () => {
    expect(deProperties({ totalRowCount: 0 }).map((p) => [p.label, p.value])).toEqual([['Rows', '0']])
    expect(deProperties(null)).toEqual([])
  })

  it('reads the relationship from a name or an object', () => {
    expect(sendRelationship({ sendableCustomObjectField: { name: 'Email' }, sendableSubscriberField: { name: '_EmailAddress' } })).toBe('Email relates to Email Address')
    expect(sendRelationship({ sendableSubscriberField: '_SubscriberKey' })).toBe('')
  })

  it('describes retention', () => {
    expect(retentionText({})).toBe('')
    expect(retentionText({ dataRetentionProperties: null })).toBe('Off')
    expect(retentionText({ dataRetentionProperties: { dataRetentionPeriodLength: 1, dataRetentionPeriodUnitOfMeasure: 4, isDeleteAtEndOfRetentionPeriod: true } }))
      .toBe('Delete all records and the data extension after 1 week')
    expect(retentionText({ dataRetentionProperties: { dataRetentionPeriodLength: 6, dataRetentionPeriodUnitOfMeasure: 5 } })).toBe('Delete all records after 6 months')
  })
})
