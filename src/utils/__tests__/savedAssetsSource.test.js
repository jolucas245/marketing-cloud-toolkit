import { describe, it, expect } from 'vitest'
import { versionSource, lineChanges } from '../savedAssets.js'
import { compile } from '../emailCompiler.js'

describe('versionSource', () => {
  it('fills slots from the compile asset', () => {
    const v = { compileAsset: { content: '<p>Hi</p><div data-type="slot" data-key="s1"></div>', slots: { s1: { content: '%%=v(@x)=%%' } } } }
    const out = versionSource(v, compile)
    expect(out).toContain('<p>Hi</p>')
    expect(out).toContain('%%=v(@x)=%%')
  })
  it('falls back to the body content (code resources), then its html view', () => {
    expect(versionSource({ compileAsset: {}, assetBody: { content: 'body { color: red }' } }, compile)).toBe('body { color: red }')
    expect(versionSource({ assetBody: { views: { html: { content: '<b>x</b>' } } } }, compile)).toBe('<b>x</b>')
    expect(versionSource({}, compile)).toBe('')
  })
})

describe('lineChanges', () => {
  it('counts added and removed lines', () => {
    expect(lineChanges('a\nb\nc', 'a\nc\nd\ne')).toEqual({ added: 2, removed: 1 })
    expect(lineChanges('same', 'same')).toEqual({ added: 0, removed: 0 })
  })
})
