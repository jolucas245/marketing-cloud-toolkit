import { describe, it, expect } from 'vitest'
import { trimEmailVersions } from '../storageRoom.js'

const v = (at, size = 100) => ({ versionId: `v_${at}`, savedAt: at, body: 'x'.repeat(size) })

describe('trimEmailVersions', () => {
  const all = {
    sql_1: { id: 'sql_1', queryText: 'SELECT 1' },
    email_1: { id: 'email_1', versions: [v(50), v(10), v(5)] },
    email_2: { id: 'email_2', versions: [v(40), v(20)] },
    email_3: { id: 'email_3', versions: [v(30)] },
  }
  it('drops the oldest versions across emails first and keeps each newest one', () => {
    const { changed, freed } = trimEmailVersions(all, 150)
    expect(Object.keys(changed).sort()).toEqual(['email_1'])
    expect(changed.email_1.versions.map((x) => x.savedAt)).toEqual([50])
    expect(freed).toBeGreaterThanOrEqual(150)
  })
  it('never touches queries or an email with one version, even when more is needed', () => {
    const { changed } = trimEmailVersions(all, 1e9)
    expect(changed.sql_1).toBeUndefined()
    expect(changed.email_3).toBeUndefined()
    expect(changed.email_1.versions).toHaveLength(1)
    expect(changed.email_2.versions.map((x) => x.savedAt)).toEqual([40])
  })
  it('changes nothing when nothing is over', () => {
    expect(trimEmailVersions(all, 0).changed).toEqual({})
  })
})

describe('slimSavedAssets (feedback #1086)', async () => {
  const { slimSavedAssets } = await import('../storageRoom.js')
  const body = { content: '<p>hi</p>', views: { html: { content: '<p>hi</p>' } } }
  const ca = { content: '<p>hi</p>', views: { html: { content: '<p>hi</p>' } } }
  it('drops the record and version compileAsset copies when the version has its assetBody', () => {
    const all = {
      sql_1: { id: 'sql_1', compileAsset: ca },
      email_1: { id: 'email_1', compileAsset: ca, versions: [{ versionId: 'a', compileAsset: ca, assetBody: body }, { versionId: 'b', compileAsset: ca, assetBody: body }] },
      cloudpage_2: { id: 'cloudpage_2', versions: [{ versionId: 'c', assetBody: body }] },
    }
    const changed = slimSavedAssets(all)
    expect(Object.keys(changed)).toEqual(['email_1'])
    expect(changed.email_1.compileAsset).toBeUndefined()
    expect(changed.email_1.versions.every((v) => !v.compileAsset && v.assetBody)).toBe(true)
    expect(JSON.stringify(changed.email_1).length).toBeLessThan(JSON.stringify(all.email_1).length / 2)
  })
  it('keeps compileAsset on versions saved before versions kept a body', () => {
    const all = { email_3: { id: 'email_3', compileAsset: ca, versions: [{ versionId: 'old', compileAsset: ca, assetBody: null }] } }
    const changed = slimSavedAssets(all)
    expect(changed.email_3.compileAsset).toBeUndefined()
    expect(changed.email_3.versions[0].compileAsset).toEqual(ca)
  })
})
