import { describe, it, expect, vi } from 'vitest'
import {
  cutoffDate, assetChangesBody, toPerson, personLabel, personKey, assetRow, automationRow, journeyRow, inPeriod,
  matchesPerson, distinctPeople, loadAssetChanges, loadAutomationChanges, loadJourneyChanges, sortChanges, changesCsv,
} from '../changes.js'

const NOW = new Date('2026-11-09T12:00:00Z')
const SINCE = new Date('2026-11-02T12:00:00Z')

describe('cutoffDate', () => {
  it('goes back the number of days', () => {
    expect(cutoffDate({ days: 7 }, NOW).toISOString()).toBe('2026-11-02T12:00:00.000Z')
    expect(cutoffDate({ days: 1 }, NOW).toISOString()).toBe('2026-11-08T12:00:00.000Z')
  })
  it('uses local midnight of a From date', () => {
    const d = cutoffDate({ from: '2026-10-15' }, NOW)
    expect([d.getFullYear(), d.getMonth(), d.getDate(), d.getHours()]).toEqual([2026, 9, 15, 0])
  })
  it('is null without a usable date', () => {
    expect(cutoffDate({ from: 'soon' }, NOW)).toBeNull()
    expect(cutoffDate({ days: 0 }, NOW)).toBeNull()
  })
})

describe('assetChangesBody', () => {
  it('filters modifiedDate on the server and sorts by it', () => {
    const b = assetChangesBody({ since: SINCE, page: 2 })
    expect(b.page).toEqual({ page: 2, pageSize: 50 })
    expect(b.query).toEqual({ property: 'modifiedDate', simpleOperator: 'greaterThan', value: '2026-11-02T12:00:00.000Z' })
    expect(b.sort).toEqual([{ property: 'modifiedDate', direction: 'DESC' }])
    expect(b.fields).toEqual(expect.arrayContaining(['createdBy', 'modifiedBy', 'createdDate', 'modifiedDate', 'assetType', 'category']))
  })
  it('created sorts by createdDate; both joins the two dates with OR', () => {
    expect(assetChangesBody({ since: SINCE, what: 'created' }).sort[0].property).toBe('createdDate')
    const q = assetChangesBody({ since: SINCE, what: 'both' }).query
    expect(q.logicalOperator).toBe('OR')
    expect([q.leftOperand.property, q.rightOperand.property]).toEqual(['modifiedDate', 'createdDate'])
  })
})

describe('people', () => {
  it('reads objects, names and bare IDs', () => {
    expect(toPerson({ id: 7, email: 'a@example.com', name: 'Ann Lee', userId: '9' })).toEqual({ id: '7', name: 'Ann Lee', email: 'a@example.com' })
    expect(toPerson('Ann Lee')).toEqual({ id: '', name: 'Ann Lee', email: '' })
    expect(toPerson(12345)).toEqual({ id: '12345', name: '', email: '' })
    expect(toPerson(null)).toBeNull()
    expect(toPerson(null, 'Bo')).toEqual({ id: '', name: 'Bo', email: '' })
    expect(personLabel({ id: '5', name: '', email: '' })).toBe('User ID 5')
    expect(personKey({ id: '5', name: 'X', email: 'A@Example.com' })).toBe('email:a@example.com')
  })

  const row = (created, modified) => ({ createdBy: toPerson(created), modifiedBy: toPerson(modified) })
  const ann = { name: 'Ann Lee', email: 'ann@example.com' }
  const bo = { name: 'Bo Chan', email: 'bo@example.com' }

  it('matches text case-insensitively in name or email of the right person', () => {
    const r = row(bo, ann)
    expect(matchesPerson(r, { text: 'ANN' }, 'modified')).toBe(true)
    expect(matchesPerson(r, { text: 'ann' }, 'created')).toBe(false)
    expect(matchesPerson(r, { text: 'bo@exa' }, 'both')).toBe(true)
    expect(matchesPerson(r, { text: '' }, 'modified')).toBe(true)
  })
  it('matches a picked person by key, and lists distinct people', () => {
    const rows = [row(bo, ann), row(ann, ann), row(null, { id: 42 })]
    expect(distinctPeople(rows, 'modified').map((p) => p.label)).toEqual(['Ann Lee (ann@example.com)', 'User ID 42'])
    expect(distinctPeople(rows, 'both')).toHaveLength(3)
    expect(matchesPerson(rows[0], { key: 'email:bo@example.com' }, 'modified')).toBe(false)
    expect(matchesPerson(rows[0], { key: 'email:bo@example.com' }, 'created')).toBe(true)
    expect(matchesPerson(rows[2], { text: '42' }, 'modified')).toBe(true)
  })
})

describe('rows', () => {
  it('maps an asset, with Open for emails and CloudPages only', () => {
    const base = { id: 1, name: 'Welcome', customerKey: 'wk', category: { name: 'Promos' }, createdDate: '2026-11-03T00:00:00Z', modifiedDate: '2026-11-04T00:00:00Z', createdBy: { name: 'Ann' }, modifiedBy: { email: 'b@example.com' } }
    const email = assetRow({ ...base, assetType: { id: 208, displayName: 'HTML Email' } })
    expect(email).toMatchObject({ key: 'asset:1', type: 'HTML Email', name: 'Welcome', folder: 'Promos', open: { path: '/emails', query: { q: 'wk' } } })
    expect(email.createdBy.name).toBe('Ann')
    expect(assetRow({ ...base, assetType: { id: 247, name: 'webpage' } }).open).toEqual({ path: '/cloudpages', query: { q: 'Welcome' } })
    expect(assetRow({ ...base, assetType: { id: 28, name: 'jpg' } }).open).toBeNull()
  })
  it('maps automations and journeys to their detail pages', () => {
    const a = automationRow({ id: 'g-1', name: 'Nightly', modifiedDate: '2026-11-05T00:00:00Z', lastSavedByName: 'Ann Lee' })
    expect(a).toMatchObject({ type: 'Automation', open: { path: '/automations/g-1' } })
    expect(personLabel(a.modifiedBy)).toBe('Ann Lee')
    expect(automationRow({ id: 'g-2', name: 'X' }).modifiedBy).toBeNull()
    const j = journeyRow({ id: 'j1', name: 'Welcome Journey', version: 3, createdBy: 101, modifiedBy: 102, modifiedDate: '2026-11-05T00:00:00Z' })
    expect(j).toMatchObject({ type: 'Journey (version 3)', open: { path: '/journeys/j1', query: { version: '3' } } })
    expect(personLabel(j.modifiedBy)).toBe('User ID 102')
  })
  it('keeps rows in the period for what changed', () => {
    const r = { createdDate: '2026-10-01T00:00:00Z', modifiedDate: '2026-11-05T00:00:00Z' }
    expect(inPeriod(r, SINCE, 'modified')).toBe(true)
    expect(inPeriod(r, SINCE, 'created')).toBe(false)
    expect(inPeriod(r, SINCE, 'both')).toBe(true)
    expect(inPeriod({ modifiedDate: null }, SINCE, 'modified')).toBe(false)
  })
  it('sorts newest first and writes CSV', () => {
    const rows = [{ type: 'A', name: 'old', modifiedDate: '2026-11-03T00:00:00Z' }, { type: 'B', name: 'new "one"', modifiedDate: '2026-11-08T00:00:00Z', modifiedBy: { name: 'Ann', email: 'a@example.com', id: '' } }]
    expect(sortChanges(rows).map((r) => r.name)).toEqual(['new "one"', 'old'])
    const csv = changesCsv(sortChanges(rows)).split('\r\n')
    expect(csv[0]).toBe('"Type","Name","Folder","Created","Created by","Modified","Modified by"')
    expect(csv[1]).toBe('"B","new ""one""","","","","2026-11-08T00:00:00Z","Ann a@example.com"')
  })
})

describe('loaders', () => {
  const asset = (i) => ({ id: i, name: `A${i}`, assetType: { id: 208 }, modifiedDate: '2026-11-05T00:00:00Z' })

  it('reads Content Builder 50 a page and stops at a short page', async () => {
    const fetch = vi.fn()
      .mockResolvedValueOnce({ count: 60, items: Array.from({ length: 50 }, (_, i) => asset(i)) })
      .mockResolvedValueOnce({ count: 60, items: Array.from({ length: 10 }, (_, i) => asset(50 + i)) })
    const progress = []
    const r = await loadAssetChanges('s7', { since: SINCE, fetch, onProgress: (a, b) => progress.push([a, b]) })
    expect(r).toMatchObject({ total: 60, capped: false })
    expect(r.rows).toHaveLength(60)
    expect(progress).toEqual([[50, 60], [60, 60]])
    expect(fetch.mock.calls[0][0]).toBe('https://content-builder.s7.marketingcloudapps.com/fuelapi/asset/v1/content/assets/query')
    expect(fetch.mock.calls[1][2].page.page).toBe(2)
  })
  it('says when it stopped at the cap', async () => {
    const fetch = vi.fn(async () => ({ count: 500, items: Array.from({ length: 50 }, (_, i) => asset(i)) }))
    const r = await loadAssetChanges('s7', { since: SINCE, fetch, maxPages: 2 })
    expect(fetch).toHaveBeenCalledTimes(2)
    expect(r.capped).toBe(true)
  })
  it('filters automations by date here', async () => {
    const search = vi.fn(async () => ({ entries: [{ id: 'a', name: 'New', modifiedDate: '2026-11-05T00:00:00Z' }, { id: 'b', name: 'Old', modifiedDate: '2026-10-01T00:00:00Z' }], total: 2 }))
    const r = await loadAutomationChanges('s7', { since: SINCE, search, more: vi.fn() })
    expect(r.rows.map((x) => x.name)).toEqual(['New'])
  })
  it('stops reading journey pages at an older version when looking for Modified', async () => {
    const page = (start, date) => Array.from({ length: 50 }, (_, i) => ({ id: `j${start + i}`, version: 1, name: 'J', modifiedDate: date }))
    const search = vi.fn()
      .mockResolvedValueOnce({ items: page(0, '2026-11-06T00:00:00Z'), total: 200 })
      .mockResolvedValueOnce({ items: page(50, '2026-10-01T00:00:00Z'), total: 200 })
    const r = await loadJourneyChanges('s7', { since: SINCE, search })
    expect(search).toHaveBeenCalledTimes(2)
    expect(search.mock.calls[0][1]).toEqual({ page: 1, allVersions: true })
    expect(r.rows).toHaveLength(50)
  })
})
