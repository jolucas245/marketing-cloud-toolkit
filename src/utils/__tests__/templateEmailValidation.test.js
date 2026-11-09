import { describe, it, expect, vi, beforeEach } from 'vitest'
import { emailValidationTemplate as t, validationScript } from '../templates/emailValidation.js'

describe('Email address validation template', () => {
  const o = { ...t.defaults }

  it('plans four DEs, two queries and a script in three steps', () => {
    const p = t.plan(o)
    expect(p.des.map((d) => d.name)).toEqual(['Email Validation', 'Email Validation Batch', 'Email Validation Settings', 'Email Validation Log'])
    expect(p.des[0].fields.map((f) => f.name)).toEqual(['SubscriberKey', 'EmailAddress', 'isValidEmail', 'invalidReason', 'APIresponse', 'ValidatedDate', 'AddedDate'])
    expect(p.queries.map((q) => [q.ref, q.target, q.updateType])).toEqual([['add', 'results', 1], ['pick', 'batch', 0]])
    expect(p.automation.steps.map((s) => [s.queries, s.scripts || []])).toEqual([[['add'], []], [['pick'], []], [[], ['validate']]])
  })

  it('adds new and changed subscribers with validation cleared, and picks the oldest unvalidated batch', () => {
    const p = t.plan({ ...o, batchSize: 1000, fromParent: true, activeOnly: true })
    expect(p.queries[0].sql).toContain('FROM ENT._Subscribers AS s')
    expect(p.queries[0].sql).toContain('LEFT JOIN [Email Validation] AS v ON v.SubscriberKey = s.SubscriberKey')
    expect(p.queries[0].sql).toMatch(/v\.SubscriberKey IS NULL OR ISNULL\(v\.EmailAddress, ''\) <> ISNULL\(s\.EmailAddress, ''\)/)
    expect(p.queries[0].sql).toContain("AND s.Status = 'active'")
    expect(p.queries[0].sql).toContain('CAST(NULL AS DATETIME) AS ValidatedDate')
    expect(p.queries[1].sql).toMatch(/^SELECT TOP 1000\b/)
    expect(p.queries[1].sql).toContain('WHERE v.ValidatedDate IS NULL')
    expect(p.queries[1].sql).toContain('ORDER BY v.AddedDate')
  })

  it('refuses no checks and duplicate names; falls back on a bad batch size', () => {
    expect(() => t.plan({ ...o, syntax: false, mx: false, listDetective: false })).toThrow('Pick at least one check')
    expect(() => t.plan({ ...o, batchName: 'email validation' })).toThrow('different names')
    expect(t.plan({ ...o, batchSize: -3 }).queries[1].sql).toMatch(/^SELECT TOP 50000\b/)
  })

  it('writes the keys, checks and time limit into the script, with no secret in it', () => {
    const p = t.plan({ ...o, mx: false, minutes: 10 })
    const s = p.scripts[0].script
    expect(s).toMatch(/^<script runat="server">/)
    expect(s).toContain('var RESULTS_KEY = "email-validation-de";')
    expect(s).toContain('var BATCH_KEY = "email-validation-batch-de";')
    expect(s).toContain('var SETTINGS_KEY = "email-validation-settings-de";')
    expect(s).toContain('var VALIDATORS = ["SyntaxValidator","ListDetectiveValidator"];')
    expect(s).toContain('var TIME_LIMIT_MS = 10 * 60 * 1000;')
    expect(s).toContain('address/v1/validateEmail')
    expect(s).not.toMatch(/client_secret:\s*"/)
    // SSJS is ES3: no let, const or arrow functions.
    expect(s).not.toMatch(/\b(let|const)\s|=>/)
  })

  it('escapes keys in the script', () => {
    expect(validationScript({ resultsKey: 'a"b', batchKey: 'b', settingsKey: 's', logKey: 'l', validators: [], minutes: 1 })).toContain('var RESULTS_KEY = "a\\"b";')
  })
})

describe('createFromPlan with a Script activity', () => {
  beforeEach(() => { vi.unstubAllGlobals(); vi.resetModules() })
  function stub(handler) {
    const calls = []
    vi.stubGlobal('chrome', { runtime: { lastError: null, sendMessage(msg, cb) {
      calls.push(msg)
      Promise.resolve(handler(msg)).then((data) => cb(data instanceof Error ? { error: data.message } : { data }))
    } } })
    return calls
  }
  const answer = (scriptFolders) => (msg) => {
    if (msg.url.includes('/folder?')) return { entry: [{ id: '100', name: 'Data Extensions', type: 'dataextension' }] }
    if (msg.url.includes('categorytype%20eq%20ssjsactivity')) return { items: scriptFolders }
    if (msg.url.includes('/folders/?')) return { items: [{ categoryId: 7, name: 'Query', parentId: 0 }] }
    if (msg.url.endsWith('/customobjects/')) return { id: `de-${msg.body.name}`, customerKey: msg.body.customerKey }
    if (msg.url.endsWith('/automation/v1/queries')) return { queryDefinitionId: `q-${msg.body.name}` }
    if (msg.url.endsWith('/automation/v1/scripts')) return { ssjsActivityId: 'ssjs-1' }
    if (msg.url.endsWith('/automation/v1/automations')) return { id: 'auto-1' }
    return {}
  }

  it('creates the script in the Scripts folder and puts it in step 3 as type 423', async () => {
    const calls = stub(answer([{ categoryId: 55, name: 'Scripts', parentId: 0 }]))
    const { createFromPlan } = await import('../templates/index.js')
    const r = await createFromPlan('s10', t.plan(t.defaults))
    expect(r.failed).toBeNull()
    expect(r.created.map((c) => c.kind)).toEqual(['de', 'de', 'de', 'de', 'query', 'query', 'script', 'automation'])
    const sc = calls.find((c) => c.url.endsWith('/automation/v1/scripts'))
    expect(sc.method).toBe('POST')
    expect(sc.body).toMatchObject({ name: 'Email address validation - Validate batch', key: 'email-address-validation-script', categoryId: 55 })
    const auto = calls.find((c) => c.url.endsWith('/automation/v1/automations')).body
    expect(auto.steps.map((s) => s.activities.map((a) => [a.objectTypeId, a.activityObjectId]))).toEqual([
      [[300, 'q-Email address validation - Add new and changed subscribers']], [[300, 'q-Email address validation - Next batch']], [[423, 'ssjs-1']],
    ])
  })

  it('stops before creating anything when there is no Scripts folder', async () => {
    const calls = stub(answer([]))
    const { createFromPlan } = await import('../templates/index.js')
    const r = await createFromPlan('s10', t.plan(t.defaults))
    expect(r.created).toEqual([])
    expect(r.failed).toMatchObject({ kind: 'check', name: 'Script activities' })
    expect(r.failed.error).toMatch(/SERVER_SIDE_JS_ACTIVITY/)
    expect(calls.some((c) => c.method === 'POST' && /customobjects|scripts|automations/.test(c.url))).toBe(false)
  })

  it('deletes a created script with the others', async () => {
    const calls = stub(() => ({}))
    const { deleteCreated } = await import('../templates/index.js')
    const failed = await deleteCreated('s10', [{ kind: 'de', id: 'd1' }, { kind: 'script', id: 'ssjs-1' }, { kind: 'automation', id: 'a1' }])
    expect(failed).toEqual([])
    expect(calls.map((c) => `${c.method} ${c.url.split('/fuelapi')[1]}`)).toEqual([
      // Automation Studio's own delete: the REST DELETE answers 404 (live test, 2026-11-08).
      'DELETE /legacy/v1/beta/automation/Delete/a1', 'DELETE /automation/v1/scripts/ssjs-1', expect.stringMatching(/^DELETE .*d1/),
    ])
  })
})
