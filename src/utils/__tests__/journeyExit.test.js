// Remove contacts from a journey (API idea 4).
import { describe, it, expect, vi, beforeEach } from 'vitest'
import {
  cleanKeys, parsePastedKeys, parseKeyFile, guessHeader, guessKeyColumn, keysFromColumn, exitItems, chunk,
  statusOf, parseExitResponse, parseStatusResponse, requestExit, fetchExitStatus, runExit, refreshExitStatus,
  exitCounts, exitResultsCsv, confirmMatches, journeyWritesAllowed, EXIT_BATCH, EXIT_MAX_KEYS,
} from '../journeyExit.js'
import { policy, normalizePolicy, POLICY_KEYS } from '../policy.js'
import schema from '../../../public/managed_schema.json'

const JB = 'https://jbinteractions.s10.marketingcloudapps.com/fuelapi/interaction/v1/interactions'

describe('contact keys', () => {
  it('trims, drops blanks and duplicates, keeps the first order', () => {
    expect(cleanKeys([' a ', 'b', '', 'a', 'B', null, 'b '])).toEqual({ keys: ['a', 'b', 'B'], duplicates: 2, blank: 2 })
  })
  it('splits pasted text on lines, commas, semicolons and tabs', () => {
    expect(parsePastedKeys('k1\nk2, k3;k4\tk5\r\n\nk1').keys).toEqual(['k1', 'k2', 'k3', 'k4', 'k5'])
    expect(parsePastedKeys('k1\nk2, k3;k4\tk5\r\n\nk1').duplicates).toBe(1)
  })
  it('reads CSV with quotes, TSV and plain lists, and picks the key column', () => {
    const csv = parseKeyFile('﻿Email,ContactKey\n"a@x.com","K,1"\nb@x.com,K2\n')
    expect(csv.rows).toEqual([['Email', 'ContactKey'], ['a@x.com', 'K,1'], ['b@x.com', 'K2']])
    expect(guessHeader(csv.rows)).toBe(true)
    expect(guessKeyColumn(csv.rows[0])).toBe(1)
    expect(keysFromColumn(csv.rows, 1, true).keys).toEqual(['K,1', 'K2'])
    const tsv = parseKeyFile('Subscriber Key\tName\nS1\tAnn\n')
    expect(tsv.delimiter).toBe('\t')
    expect(guessKeyColumn(tsv.rows[0])).toBe(0)
    const txt = parseKeyFile('003A\n003B\n003A\n')
    expect(guessHeader(txt.rows)).toBe(false)
    expect(keysFromColumn(txt.rows, 0, false)).toEqual({ keys: ['003A', '003B'], duplicates: 1, blank: 0 })
  })
})

describe('request bodies and batching', () => {
  it('builds items with Versions only when versions are chosen', () => {
    expect(exitItems(['a'], 'jk')).toEqual([{ ContactKey: 'a', DefinitionKey: 'jk' }])
    expect(exitItems(['a'], 'jk', [])).toEqual([{ ContactKey: 'a', DefinitionKey: 'jk' }])
    expect(exitItems(['a', 'b'], 'jk', ['2', 3])).toEqual([{ ContactKey: 'a', DefinitionKey: 'jk', Versions: [2, 3] }, { ContactKey: 'b', DefinitionKey: 'jk', Versions: [2, 3] }])
  })
  it('chunks into batches of 50', () => {
    const keys = Array.from({ length: 121 }, (_, i) => `k${i}`)
    expect(chunk(keys).map((b) => b.length)).toEqual([50, 50, 21])
    expect(EXIT_BATCH).toBe(50)
  })
  it('posts to contactexit and contactexit/status on Journey Builder', async () => {
    const f = vi.fn().mockResolvedValue({})
    const items = exitItems(['a'], 'jk', [1])
    await requestExit('s10', items, f)
    await fetchExitStatus('s10', items, f)
    expect(f.mock.calls).toEqual([[`${JB}/contactexit`, 'POST', items], [`${JB}/contactexit/status`, 'POST', items]])
  })
  it('refuses more than 50 items in one call', async () => {
    await expect(requestExit('s10', exitItems(Array.from({ length: 51 }, (_, i) => `k${i}`), 'jk'), vi.fn())).rejects.toThrow(/50/)
  })
})

describe('status mapping', () => {
  it('maps SFMC words to result kinds', () => {
    expect(statusOf('Queued')).toBe('queued')
    expect(statusOf('ExitRequested')).toBe('queued')
    expect(statusOf('Exited')).toBe('exited')
    expect(statusOf('Exited by ExitbyAPI')).toBe('exited')
    expect(statusOf('Contact is not in the journey')).toBe('not_in_journey')
    expect(statusOf('ContactKey not found')).toBe('not_in_journey')
    expect(statusOf('Exit Failed')).toBe('error')
    expect(statusOf('')).toBe('unknown')
    expect(statusOf('Something else')).toBe('unknown')
    expect(statusOf('Exit request Cancelled - Contact not in this Interaction')).toBe('not_in_journey')
    expect(statusOf('Exit request Cancelled')).toBe('error')
    // the four messages seen live on s10 (2026-11-11)
    expect(statusOf('Exit request received for processing')).toBe('queued')
    expect(statusOf('Exit process Completed.')).toBe('exited')
    expect(statusOf('Exit request Not Found')).toBe('unknown')
  })
  it('reads the exit reply: listed keys fail, the rest are queued', () => {
    const rows = parseExitResponse(['a', 'b', 'c'], { errors: [
      { ContactKey: 'b', DefinitionKey: 'jk', ErrorCode: 30001, Message: 'Contact not in journey' },
      { ContactKey: 'c', ErrorCode: 30000, Message: 'Invalid definition key' },
    ] })
    expect(rows).toEqual([
      { contactKey: 'a', status: 'queued', message: '' },
      { contactKey: 'b', status: 'not_in_journey', message: 'Contact not in journey (code 30001)' },
      { contactKey: 'c', status: 'error', message: 'Invalid definition key (code 30000)' },
    ])
  })
  it('reads the status reply per contact, the most important version first', () => {
    const m = parseStatusResponse({ results: [
      { contactKey: 'a', definitionKey: 'jk', version: 1, status: 'Exited', message: 'Exited by API' },
      { contactKey: 'a', definitionKey: 'jk', version: 2, status: 'Queued', message: '' },
      { ContactKey: 'b', Status: 'ContactNotInJourney' },
    ] })
    expect(m.get('a')).toMatchObject({ status: 'queued', sfmcStatus: 'Queued', versions: [1, 2] })
    expect(m.get('b')).toMatchObject({ status: 'not_in_journey' })
  })
})

describe('runExit', () => {
  beforeEach(() => Object.assign(policy, normalizePolicy({})))
  const keys = Array.from({ length: 120 }, (_, i) => `k${i}`)

  it('sends one batch at a time, then the status of the queued keys', async () => {
    const calls = []
    const fetcher = vi.fn(async (url, _m, body) => {
      calls.push([url.endsWith('/status') ? 'status' : 'exit', body.length])
      if (url.endsWith('/status')) return { results: body.map((it) => ({ contactKey: it.ContactKey, status: it.ContactKey === 'k3' ? 'Exited' : 'Queued' })) }
      return { errors: body[0].ContactKey === 'k0' ? [{ ContactKey: 'k1', Message: 'not in journey' }] : [] }
    })
    const progress = []
    const r = await runExit({ stack: 's10', keys, definitionKey: 'jk', versions: [2], fetcher, onProgress: (p) => progress.push(p.done) })
    expect(calls).toEqual([['exit', 50], ['status', 49], ['exit', 50], ['status', 50], ['exit', 20], ['status', 20]])
    expect(fetcher.mock.calls[0][2][0]).toEqual({ ContactKey: 'k0', DefinitionKey: 'jk', Versions: [2] })
    expect(progress).toEqual([50, 100, 120])
    expect(r.stopped).toBe(false)
    expect(exitCounts(r.rows)).toMatchObject({ queued: 118, exited: 1, not_in_journey: 1, not_sent: 0 })
  })
  it('stops between batches and marks the rest not sent', async () => {
    let n = 0
    const fetcher = vi.fn(async () => ({}))
    const r = await runExit({ stack: 's10', keys, definitionKey: 'jk', fetcher, shouldStop: () => n++ >= 1 })
    expect(fetcher.mock.calls.filter(([u]) => u.endsWith('/contactexit'))).toHaveLength(1)
    expect(r.stopped).toBe(true)
    expect(exitCounts(r.rows)).toMatchObject({ queued: 50, not_sent: 70 })
    expect(r.rows.map((x) => x.contactKey)).toEqual(keys)
  })
  it('keeps going after a failed batch, with SFMC\'s message on its rows', async () => {
    const fetcher = vi.fn(async (url, _m, body) => {
      if (!url.endsWith('/status') && body[0].ContactKey === 'k0') throw new Error('SFMC API error 400: bad request')
      return {}
    })
    const r = await runExit({ stack: 's10', keys, definitionKey: 'jk', fetcher })
    expect(r.rows[0]).toEqual({ contactKey: 'k0', status: 'error', message: 'SFMC API error 400: bad request' })
    expect(exitCounts(r.rows)).toMatchObject({ error: 50, queued: 70 })
  })
  it('refuses without a journey key or over the limit', async () => {
    await expect(runExit({ stack: 's10', keys: ['a'], definitionKey: '', fetcher: vi.fn() })).rejects.toThrow(/no key/)
    await expect(runExit({ stack: 's10', keys: Array.from({ length: EXIT_MAX_KEYS + 1 }, (_, i) => `k${i}`), definitionKey: 'jk', fetcher: vi.fn() })).rejects.toThrow(/At most/)
  })
  it('Check status again reads only queued and unknown rows', async () => {
    const fetcher = vi.fn(async (_u, _m, body) => ({ results: body.map((it) => ({ contactKey: it.ContactKey, status: 'Exited' })) }))
    const rows = [{ contactKey: 'a', status: 'queued' }, { contactKey: 'b', status: 'error', message: 'x' }, { contactKey: 'c', status: 'unknown' }]
    const out = await refreshExitStatus({ stack: 's10', rows, definitionKey: 'jk', fetcher })
    expect(fetcher.mock.calls[0][2].map((i) => i.ContactKey)).toEqual(['a', 'c'])
    expect(out.map((r) => r.status)).toEqual(['exited', 'error', 'exited'])
  })
})

describe('policy gate', () => {
  beforeEach(() => Object.assign(policy, normalizePolicy({})))
  it('disableJourneyWrites is a schema key and blocks every exit call', async () => {
    expect(POLICY_KEYS).toContain('disableJourneyWrites')
    expect(schema.properties.disableJourneyWrites.type).toBe('boolean')
    expect(journeyWritesAllowed()).toBe(true)
    policy.disableJourneyWrites = true
    expect(journeyWritesAllowed()).toBe(false)
    const fetcher = vi.fn()
    await expect(requestExit('s10', exitItems(['a'], 'jk'), fetcher)).rejects.toThrow(/policy/)
    const r = await runExit({ stack: 's10', keys: ['a'], definitionKey: 'jk', fetcher })
    expect(fetcher).not.toHaveBeenCalled()
    expect(r.rows[0].status).toBe('error')
  })
})

describe('confirm and CSV', () => {
  it('needs the exact number of contacts or the journey name', () => {
    expect(confirmMatches('', 1200, 'Welcome')).toBe(false)
    expect(confirmMatches('1200', 1200, 'Welcome')).toBe(true)
    expect(confirmMatches('1,200', 1200, 'Welcome')).toBe(true)
    expect(confirmMatches('120', 1200, 'Welcome')).toBe(false)
    expect(confirmMatches(' Welcome ', 1200, 'Welcome')).toBe(true)
    expect(confirmMatches('welcome', 1200, 'Welcome')).toBe(false)
  })
  it('writes one CSV row per contact', () => {
    const csv = exitResultsCsv([{ contactKey: 'a"1', status: 'exited', sfmcStatus: 'Exited', versions: [1, 2], message: 'ok' }], 'J')
    expect(csv.split('\n')).toEqual([
      '"Contact Key","Result","SFMC status","Versions","Message","Journey"',
      '"a""1","Exited","Exited","1 2","ok","J"',
    ])
  })
})

describe('contactexit/status as seen live on s10 (2026-11-11)', () => {
  it('reads the per-version status array', () => {
    const live = [
      { contactKey: 'A', definitionKey: 'J', status: [{ version: 1, message: 'Exit request Cancelled - Contact not in this Interaction' }] },
      { contactKey: 'B', definitionKey: 'J', status: [{ version: 1, message: 'Exit request Cancelled - Contact not in this Interaction' }, { version: 2, message: 'Exit request Queued' }] },
    ]
    const m = parseStatusResponse(live)
    expect(m.get('A')).toEqual({ status: 'not_in_journey', message: 'Exit request Cancelled - Contact not in this Interaction', sfmcStatus: '', versions: [1] })
    expect(m.get('B').status).toBe('queued')
    expect(m.get('B').versions).toEqual([1, 2])
    expect(m.get('B').sfmcStatus).not.toMatch(/object/)
    const twice = parseStatusResponse([{ contactKey: 'C', status: [{ version: 1, message: 'Exit request received for processing' }, { version: 1, message: 'Exit request Cancelled - Contact not in this Interaction' }] }])
    expect(twice.get('C')).toMatchObject({ status: 'queued', versions: [1] })
  })
})
