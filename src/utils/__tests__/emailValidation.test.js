import { describe, it, expect, vi } from 'vitest'
import {
  parseEmailList, toResult, validateMany, contactEmails, guessEmailField, guessResultFields, checkInPlace,
  rowForResult, createResultWriter, reasonFor, WRITE_BATCH, resultFieldNames, copyFieldsWithResults, copyDESettings,
  createCopyDE, summarize, summaryRows, summaryText, summaryLine, resultMatches, invalidCategory,
} from '../emailValidation.js'
import { buildCreateBody } from '../createDE/createDE.js'

describe('parseEmailList', () => {
  it('splits on lines, commas and spaces, strips brackets and drops duplicates ignoring case', () => {
    const r = parseEmailList('a@x.com, <B@y.org>\n a@X.com;"c@z.io"\t', 10)
    expect(r.emails).toEqual(['a@x.com', 'B@y.org', 'c@z.io'])
    expect(r.skipped).toBe(0)
  })
  it('caps the list', () => {
    expect(parseEmailList('a@x.com b@x.com c@x.com', 2)).toEqual({ emails: ['a@x.com', 'b@x.com'], skipped: 1 })
  })
})

describe('toResult', () => {
  it('reads a valid answer', () => {
    const r = toResult('a@x.com', { email: 'a@x.com', valid: true })
    expect(r).toMatchObject({ valid: true, reason: '' })
    expect(JSON.parse(r.response)).toEqual({ email: 'a@x.com', valid: true })
  })
  it('names the failed validator', () => {
    const r = toResult('a@x', { email: 'a@x', valid: false, failedValidation: 'MXValidator' })
    expect(r.valid).toBe(false)
    expect(r.reason).toBe(reasonFor('MXValidator'))
    expect(r.reason).toMatch(/^Mail server/)
  })
  it('keeps an error as not checked', () => {
    const r = toResult('a@x.com', null, new Error('SFMC API error 429'))
    expect(r.valid).toBeNull()
    expect(r.reason).toMatch(/Not checked: SFMC API error 429/)
  })
})

describe('validateMany', () => {
  it('calls the endpoint once per address, keeps order, skips blanks and catches errors', async () => {
    const fetcher = vi.fn(async (url, method, body) => {
      expect(url).toBe('https://mc.s7.exacttarget.com/cloud/fuelapi/address/v1/validateEmail')
      expect(method).toBe('POST')
      expect(body.validators).toEqual(['SyntaxValidator'])
      if (body.email === 'boom@x.com') throw new Error('fail')
      return { email: body.email, valid: body.email.startsWith('ok') }
    })
    const seen = []
    const out = await validateMany('s7', ['ok@x.com', '', 'bad@x.com', 'boom@x.com'], { validators: ['SyntaxValidator'], fetcher, onResult: (r, i) => seen.push(i) })
    expect(fetcher).toHaveBeenCalledTimes(3)
    expect(out.map((r) => r.valid)).toEqual([true, false, false, null])
    expect(out[1].reason).toBe('No email address')
    expect(seen.sort()).toEqual([0, 1, 2, 3])
  })
  it('stops when asked', async () => {
    let n = 0
    const out = await validateMany('s7', ['a@x', 'b@x', 'c@x'], { limit: 1, fetcher: async () => ({ valid: true }), onResult: () => { n++ }, shouldStop: () => n >= 1 })
    expect(out.filter(Boolean)).toHaveLength(1)
  })
})

describe('contact and field helpers', () => {
  it('takes email-like attribute values once', () => {
    const c = { values: [{ set: 'Email Addresses', name: 'Email Address', value: 'a@x.com' }, { set: 'X', name: 'Other', value: 'A@x.com' }, { name: 'Name', value: 'Ana' }] }
    expect(contactEmails(c)).toEqual([{ email: 'a@x.com', attribute: 'Email Addresses > Email Address' }])
  })
  it('guesses the email field and the result fields', () => {
    const fields = [{ name: 'Id', isPrimaryKey: true }, { name: 'Mail', type: 'EmailAddress' }, { name: 'is_valid_email' }, { name: 'Invalid Reason' }, { name: 'APIResponse' }]
    expect(guessEmailField(fields)).toBe('Mail')
    expect(guessEmailField([{ name: 'Email' }])).toBe('Email')
    expect(guessResultFields(fields)).toEqual({ isValidEmail: 'is_valid_email', invalidReason: 'Invalid Reason', APIresponse: 'APIResponse' })
  })
})

describe('checkInPlace', () => {
  const fields = [{ name: 'Id', isPrimaryKey: true }, { name: 'Email' }, { name: 'A' }, { name: 'B' }, { name: 'C' }]
  const mapping = { isValidEmail: 'A', invalidReason: 'B', APIresponse: 'C' }
  it('needs a primary key', () => {
    expect(checkInPlace({ fields: fields.map((f) => ({ ...f, isPrimaryKey: false })), emailField: 'Email', mapping })).toMatch(/no primary key/)
  })
  it('needs three different non-key, non-email fields', () => {
    expect(checkInPlace({ fields, emailField: 'Email', mapping })).toBe('')
    expect(checkInPlace({ fields, emailField: 'Email', mapping: { ...mapping, APIresponse: '' } })).toMatch(/each of the three/)
    expect(checkInPlace({ fields, emailField: 'Email', mapping: { ...mapping, APIresponse: 'A' } })).toMatch(/three different/)
    expect(checkInPlace({ fields, emailField: 'Email', mapping: { ...mapping, APIresponse: 'Id' } })).toMatch(/primary key/)
    expect(checkInPlace({ fields, emailField: 'A', mapping })).toMatch(/email field/)
  })
})

describe('rows to write', () => {
  const r = { email: 'a@x', valid: false, reason: 'x'.repeat(50), response: '{"valid":false}' }
  it('in place: keys plus the mapped fields, text cut to the field length', () => {
    const row = rowForResult(r, { Id: '7', Email: 'a@x' }, {
      mode: 'inplace', keyFields: ['Id'], emailField: 'Email', mapping: { isValidEmail: 'V', invalidReason: 'R', APIresponse: 'P' },
      fieldsByName: { R: { name: 'R', type: 'Text', length: 10 }, P: { name: 'P', type: 'Text', length: 4000 } },
    })
    expect(row).toEqual({ Id: '7', V: 'false', R: 'xxxxxxxxxx', P: '{"valid":false}' })
  })
  it('leaves the flag out for a row that was not checked', () => {
    const row = rowForResult({ ...r, valid: null }, { Id: '1' }, { mode: 'inplace', keyFields: ['Id'], mapping: { isValidEmail: 'V', invalidReason: 'R', APIresponse: 'P' } })
    expect(row).not.toHaveProperty('V')
  })
  it('new DE (feedback #1090): every source value, empty ones left out, plus the results under their names', () => {
    const row = rowForResult({ ...r, valid: true }, { Id: '7', Email: 'a@x', Age: '', City: 'Oslo' }, {
      mode: 'new', copyFields: ['Id', 'Email', 'Age', 'City'], names: { isValidEmail: 'isValidEmail_2', invalidReason: 'invalidReason', APIresponse: 'APIresponse' },
    })
    expect(row).toEqual({ Id: '7', Email: 'a@x', City: 'Oslo', isValidEmail_2: 'true', invalidReason: 'x'.repeat(50), APIresponse: '{"valid":false}' })
  })
  it('new DE: a row the run did not reach is copied without results', () => {
    const row = rowForResult(null, { Id: '8', Email: 'b@x' }, { mode: 'new', copyFields: ['Id', 'Email'], names: {} })
    expect(row).toEqual({ Id: '8', Email: 'b@x' })
  })
})

describe('copy of the source DE (feedback #1090)', () => {
  const source = [
    { name: 'SubscriberKey', type: 'Text', length: 50, isPrimaryKey: true, isNullable: false, ordinal: 0 },
    { name: 'Score', type: 'Decimal', length: 18, scale: 2, isNullable: true, ordinal: 3 },
    { name: 'Email', type: 'EmailAddress', length: 254, isNullable: false, ordinal: 1 },
    { name: 'Joined', type: 'Date', isNullable: true, defaultValue: 'getdate()', ordinal: 2 },
    { name: 'Active', type: 'Boolean', isNullable: true, defaultValue: 'maybe', ordinal: 4 },
    { name: 'IsValidEmail', type: 'Text', length: 10, isNullable: true, ordinal: 5 },
  ]
  it('names the result fields without clashing, ignoring case', () => {
    expect(resultFieldNames([{ name: 'isvalidemail' }, { name: 'isValidEmail_2' }])).toEqual({
      names: { isValidEmail: 'isValidEmail_3', invalidReason: 'invalidReason', APIresponse: 'APIresponse' },
      renamed: [{ from: 'isValidEmail', to: 'isValidEmail_3' }],
    })
  })
  it('keeps every field in DE order with type, length, scale, key, required and default, then adds the results', () => {
    const plan = copyFieldsWithResults(source)
    expect(plan.fields.map((f) => f.name)).toEqual(['SubscriberKey', 'Email', 'Joined', 'Score', 'Active', 'IsValidEmail', 'isValidEmail_2', 'invalidReason', 'APIresponse'])
    expect(plan.fields[0]).toMatchObject({ type: 'Text', length: 50, isPrimaryKey: true, isNullable: false })
    expect(plan.fields[1]).toMatchObject({ type: 'EmailAddress', isNullable: false })
    expect(plan.fields[2]).toMatchObject({ type: 'Date', currentDate: true })
    expect(plan.fields[3]).toMatchObject({ type: 'Decimal', length: 18, scale: 2 })
    expect(plan.fields.slice(-3).map((f) => [f.type, f.length])).toEqual([['Boolean', ''], ['Text', 500], ['Text', 4000]])
    expect(plan.renamed).toEqual([{ from: 'isValidEmail', to: 'isValidEmail_2' }])
    // A default Create DE would refuse is dropped and named.
    expect(plan.droppedDefaults).toEqual(['Active'])
    expect(plan.fields[4].defaultValue).toBe('')
  })
  it('copies sendable, the send relationship field and the folder; never retention', () => {
    const { fields } = copyFieldsWithResults(source)
    const detail = { isSendable: true, isTestable: true, sendableCustomObjectField: { name: 'subscriberkey' }, categoryID: 12, description: 'Members', dataRetentionProperties: { dataRetentionPeriodLength: 3 } }
    const { settings, notes } = copyDESettings({ name: 'Members' }, detail, { name: 'Members_EmailValidation', folderId: 40, fields })
    expect(settings).toMatchObject({ name: 'Members_EmailValidation', folderId: 40, isSendable: true, sendField: 'SubscriberKey', isTestable: true, description: 'Members' })
    expect(settings.retention.mode).toBe('off')
    expect(notes).toEqual([])
    const body = buildCreateBody(settings, fields)
    expect(body).toMatchObject({ isSendable: true, sendableCustomObjectField: 'SubscriberKey', categoryID: 40 })
    expect(body.dataRetentionProperties).toBeUndefined()
  })
  it('says so when the send relationship field cannot be found', () => {
    const { settings, notes } = copyDESettings({ name: 'M' }, { isSendable: true, sendableCustomObjectField: 'Gone' }, { name: 'N', folderId: 1, fields: [] })
    expect(settings.isSendable).toBe(false)
    expect(notes[0]).toMatch(/"Gone" could not be copied/)
  })
  it('creates the copy through Create DE and needs its key', async () => {
    const createDE = vi.fn(async () => ({ de: { id: 'i1', key: 'k1', name: 'N' } }))
    expect(await createCopyDE('s7', { name: 'N' }, [], { createDE })).toEqual({ id: 'i1', key: 'k1', name: 'N' })
    await expect(createCopyDE('s7', { name: 'N' }, [], { createDE: async () => ({ de: { id: 'i1' } }) })).rejects.toThrow(/did not return its key/)
  })
})

describe('createResultWriter', () => {
  it('upserts in batches in place and flushes the rest', async () => {
    const api = { upsertDERowsAsync: vi.fn(async () => ({})), insertDERowsAsync: vi.fn() }
    const w = createResultWriter('s7', { key: 'K', mode: 'inplace' }, api)
    for (let i = 0; i < WRITE_BATCH + 3; i++) w.add({ i })
    expect(await w.flush()).toBe(WRITE_BATCH + 3)
    expect(api.upsertDERowsAsync).toHaveBeenCalledTimes(2)
    expect(api.upsertDERowsAsync.mock.calls[1][2]).toHaveLength(3)
    expect(api.insertDERowsAsync).not.toHaveBeenCalled()
  })
  it('inserts for a new DE and passes errors on', async () => {
    const api = { insertDERowsAsync: vi.fn(async () => { throw new Error('refused') }), upsertDERowsAsync: vi.fn() }
    const w = createResultWriter('s7', { key: 'K', mode: 'new' }, api)
    w.add({ a: 1 })
    await expect(w.flush()).rejects.toThrow('refused')
  })
})

describe('new DE names', async () => {
  const { deNameTaken, freeDEName, isNameClash } = await import('../emailValidation.js')
  it('matches the name exactly, ignoring case', async () => {
    const search = async () => ({ items: [{ name: 'Leads_EmailValidation_2' }, { name: 'leads_emailvalidation' }] })
    expect(await deNameTaken('s10', 'Leads_EmailValidation', search)).toBe(true)
    expect(await deNameTaken('s10', 'Leads_EmailValidation_3', search)).toBe(false)
  })
  it('finds the first free suffix', async () => {
    const used = new Set(['a', 'a_2'])
    expect(await freeDEName('s10', 'a', async (_s, n) => used.has(n))).toBe('a_3')
    expect(await freeDEName('s10', 'b', async (_s, n) => used.has(n))).toBe('b')
  })
  it('recognises SFMC\'s clash answer', () => {
    expect(isNameClash({ status: 409 })).toBe(true)
    expect(isNameClash(new Error('SFMC API error 409: {"message":"A CustomObject with that name already exists."}'))).toBe(true)
    expect(isNameClash(new Error('other'))).toBe(false)
  })
})

describe('contact addresses skip formulas (feedback #1022)', () => {
  it('ignores {toLower(@EmailAddress)} and other non-addresses', () => {
    const c = { values: [
      { set: 'Primary', name: 'UserNameLC', value: '{toLower(@EmailAddress)}' },
      { set: 'Primary', name: 'Other', value: '@EmailAddress' },
      { set: 'Primary', name: 'EmailAddress', value: 'jo@example.com' },
    ] }
    expect(contactEmails(c)).toEqual([{ email: 'jo@example.com', attribute: 'Primary > EmailAddress' }])
  })
})

describe('summary (feedback #1091)', () => {
  const results = [
    { email: 'a@x', valid: true },
    { email: 'b@x', valid: true },
    { email: 'c@x', valid: false, failedValidation: 'MXValidator' },
    { email: 'd@x', valid: false, failedValidation: 'MXValidator' },
    { email: 'e@x', valid: false, failedValidation: 'SyntaxValidator' },
    { email: '', valid: false, failedValidation: '' },
    { email: 'f@x', valid: false, failedValidation: '' },
    { email: 'g@x', valid: null, error: 'session expired', reason: 'Not checked: session expired' },
    undefined,
  ]
  it('counts valid, not valid by category, and not checked by error', () => {
    const sum = summarize(results)
    expect(sum).toMatchObject({ total: 8, valid: 2, invalid: 5, notChecked: 1 })
    expect(sum.categories.map((c) => [c.id, c.count])).toEqual([['MXValidator', 2], ['SyntaxValidator', 1], ['empty', 1], ['unknown', 1]])
    expect(sum.categories[0].label).toMatch(/Mail server/)
    expect(sum.errors).toEqual([{ message: 'session expired', count: 1 }])
  })
  it('filters results by group or category', () => {
    const list = results.filter(Boolean)
    expect(list.filter((r) => resultMatches(r, 'valid'))).toHaveLength(2)
    expect(list.filter((r) => resultMatches(r, 'invalid'))).toHaveLength(5)
    expect(list.filter((r) => resultMatches(r, 'invalid:MXValidator')).map((r) => r.email)).toEqual(['c@x', 'd@x'])
    expect(list.filter((r) => resultMatches(r, 'notChecked'))).toHaveLength(1)
    expect(list.filter((r) => resultMatches(r, ''))).toHaveLength(8)
    expect(invalidCategory({ email: ' ', valid: false })).toBe('empty')
  })
  it('gives rows, text and a line with counts and shares but no addresses', () => {
    const sum = summarize(results)
    expect(summaryRows(sum)[1]).toEqual({ Group: 'Valid', Count: 2, Share: '25%' })
    const text = summaryText(sum, 'Run 1')
    expect(text).toMatch(/^Run 1/)
    expect(text).toContain('Not valid: Mail server: the domain has no mail server: 2 (25%)')
    expect(text).not.toMatch(/@/)
    expect(summaryLine(sum)).toBe('2 valid, 5 not valid, 1 not checked')
  })
})
