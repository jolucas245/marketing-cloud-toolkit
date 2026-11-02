import { describe, it, expect, vi } from 'vitest'
import {
  parseEmailList, toResult, validateMany, contactEmails, guessEmailField, guessResultFields, checkInPlace,
  newDEFields, rowForResult, createResultWriter, createResultsDE, reasonFor, WRITE_BATCH,
} from '../emailValidation.js'

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
  it('new DE: keys, email and the three result fields', () => {
    const fields = newDEFields([{ name: 'Id', isPrimaryKey: true, length: 36 }, { name: 'Email' }], 'Email')
    expect(fields.map((f) => f.name)).toEqual(['Id', 'Email', 'isValidEmail', 'invalidReason', 'APIresponse'])
    expect(fields.find((f) => f.name === 'isValidEmail').type).toBe('Boolean')
    const row = rowForResult({ ...r, valid: true }, { Id: '7' }, { mode: 'new', keyFields: ['Id'], emailField: 'Email' })
    expect(row).toMatchObject({ Id: '7', Email: 'a@x', isValidEmail: 'true', APIresponse: '{"valid":false}' })
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

describe('createResultsDE', () => {
  it('sends numeric field types to createTargetDE', async () => {
    const createTargetDE = vi.fn(async () => ({ id: 'id1', customerKey: 'ck1' }))
    const made = await createResultsDE('s7', { name: 'N', categoryID: 5, fields: newDEFields([], 'Email') }, { createTargetDE })
    expect(made).toEqual({ id: 'id1', key: 'ck1', name: 'N' })
    const sent = createTargetDE.mock.calls[0][1]
    expect(sent.categoryID).toBe(5)
    expect(sent.fields.map((f) => [f.name, f.type, f.length])).toEqual([['Email', 0, 254], ['isValidEmail', 3, undefined], ['invalidReason', 0, 500], ['APIresponse', 0, 4000]])
  })
})
