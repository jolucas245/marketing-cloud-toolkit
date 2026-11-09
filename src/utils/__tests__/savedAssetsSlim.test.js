import { describe, it, expect } from 'vitest'
import { compileAssetFrom, versionCompileAsset, recordCompileAsset, slimSavedRecord, versionSource } from '../savedAssets.js'
import { compile } from '../emailCompiler.js'

// Feedback #1086: a save keeps its content once (assetBody); the compile input is made from it.
const body = {
  id: 5, name: 'News', assetType: { id: 207, name: 'templatebasedemail' },
  views: { html: { content: '<div data-type="slot" data-key="s1"></div>', slots: { s1: { content: '<p>Hello slot</p>' } }, meta: { x: 1 } }, subjectline: { content: 'Hi' } },
}

describe('compile input from a saved body', () => {
  it('picks what the compiler needs', () => {
    const ca = compileAssetFrom(body)
    expect(ca.views.html).toEqual({ content: body.views.html.content, superContent: null, design: null, slots: body.views.html.slots, blocks: null })
    expect(compileAssetFrom(null)).toBeNull()
  })
  it('previews the same with or without the stored compileAsset', () => {
    const withCopy = { compileAsset: compileAssetFrom(body), assetBody: body }
    const slim = { assetBody: body }
    expect(versionSource(slim, compile)).toBe(versionSource(withCopy, compile))
    expect(versionSource(slim, compile)).toContain('Hello slot')
  })
  it('falls back from the record to its newest version', () => {
    expect(recordCompileAsset({ versions: [{ assetBody: body }] })).toEqual(compileAssetFrom(body))
    expect(recordCompileAsset({ compileAsset: { content: 'x' }, versions: [] })).toEqual({ content: 'x' })
    expect(recordCompileAsset({})).toBeNull()
    expect(versionCompileAsset({ compileAsset: { content: 'old' }, assetBody: body })).toEqual({ content: 'old' })
  })
  it('slimSavedRecord returns the same object when there is nothing to drop', () => {
    const rec = { versions: [{ assetBody: body }] }
    expect(slimSavedRecord(rec)).toBe(rec)
    expect(slimSavedRecord(null)).toBeNull()
  })
})
