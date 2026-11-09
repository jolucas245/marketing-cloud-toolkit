import { describe, it, expect, vi } from 'vitest'
import { EditorState } from '@codemirror/state'
import { EditorView } from '@codemirror/view'
import { CompletionContext } from '@codemirror/autocomplete'
import { makeCompletionSource, sfmcSqlExtensions, editorTooltipSpace, FUNCTION_OPTIONS, KEYWORD_OPTIONS } from '../sqlExtensions.js'
import { SQL_FUNCTIONS } from '../../utils/sqlDocs.js'

function fakeCatalog() {
  return {
    searchTables: vi.fn(async () => [
      { name: '_Subscribers', kind: 'dataview' },
      { name: 'Demo_Orders', kind: 'de', sourceType: 'search' },
    ]),
    fieldsFor: vi.fn(async (name) => (/orders/i.test(name) ? [{ name: 'OrderId', type: 0 }, { name: 'OrderDate', type: 2 }] : [])),
    knownTables: () => new Map(),
    onChange: () => () => {},
  }
}

// Completions at the end of `doc` (or at the | in it), as on Ctrl+Space.
async function complete(doc, catalog = fakeCatalog()) {
  const pos = doc.includes('|') ? doc.indexOf('|') : doc.length
  const text = doc.replace('|', '')
  const state = EditorState.create({ doc: text, extensions: sfmcSqlExtensions(catalog) })
  const sources = state.languageDataAt('autocomplete', pos)
  const labels = []
  for (const source of sources) {
    const r = await source(new CompletionContext(state, pos, true))
    if (r) labels.push(...r.options.map((o) => o.label))
  }
  return labels
}

// Words CodeMirror's MSSQL list offered that SFMC SQL does not support (live test, 2026-11-07).
const NOT_SFMC = ['REGEXP_SUBSTR', 'CURSOR_STATUS', '@@FETCH_STATUS', 'CURRENT_DEFAULT_TRANSFORM_GROUP', '@@CPU_BUSY', 'DECRYPTBYKEYAUTOCERT']

describe('SQL editor autocomplete', () => {
  it('offers only tables after FROM and JOIN', async () => {
    for (const doc of ['SELECT * FROM ', 'SELECT * FROM Demo_Orders o JOIN ', 'SELECT * FROM Dem']) {
      const labels = await complete(doc)
      expect(labels).toEqual(['_Subscribers', '[Demo_Orders]'])
    }
  })

  it('offers fields, SFMC functions and keywords elsewhere, never the MSSQL word list', async () => {
    const labels = await complete('SELECT | FROM Demo_Orders')
    expect(labels).toContain('OrderId')
    expect(labels).toContain('DATEADD')
    expect(labels).toContain('WHERE')
    expect(labels).toContain('VARCHAR')
    for (const w of NOT_SFMC) expect(labels).not.toContain(w)
  })

  it('has one completion source: the SFMC one', async () => {
    const state = EditorState.create({ doc: 'SELECT ', extensions: sfmcSqlExtensions(fakeCatalog()) })
    expect(state.languageDataAt('autocomplete', 7)).toHaveLength(1)
  })

  it('takes functions from the SFMC function docs, without the ones SFMC refuses', () => {
    const names = FUNCTION_OPTIONS.map((o) => o.label)
    expect(names.every((n) => SQL_FUNCTIONS[n])).toBe(true)
    expect(names).not.toContain('OPENJSON')
    const keywords = KEYWORD_OPTIONS.map((o) => o.label)
    expect(keywords).not.toContain('LEFT')        // offered once, as the function
    expect(keywords).toContain('LEFT JOIN')
  })

  it('a direct source call still answers tables for FROM', async () => {
    const source = makeCompletionSource(fakeCatalog())
    const state = EditorState.create({ doc: 'SELECT * FROM ' })
    const r = await source(new CompletionContext(state, 14, true))
    expect(r.options.map((o) => o.displayLabel)).toEqual(['_Subscribers', 'Demo_Orders'])
  })
})

describe('SQL editor tooltips', () => {
  // A lint message spanned the window and covered the app header (live test, 2026-11-07).
  it('keeps tooltips inside the page area under the app header', () => {
    const main = document.createElement('main')
    document.body.appendChild(main)
    main.getBoundingClientRect = () => ({ top: 52, left: 220, right: 1400, bottom: 900, width: 1180, height: 848 })
    const view = new EditorView({ parent: main, doc: 'SELECT 1', extensions: sfmcSqlExtensions(fakeCatalog()) })
    const space = editorTooltipSpace(view)
    expect(space.top).toBe(52)
    expect(space.left).toBe(220)
    expect(space.bottom).toBeLessThanOrEqual(900)
    view.destroy()
    main.remove()
  })

  it('uses the window outside the app shell', () => {
    const view = new EditorView({ parent: document.body, doc: '' })
    expect(editorTooltipSpace(view)).toEqual({ top: 0, left: 0, right: window.innerWidth, bottom: window.innerHeight })
    view.destroy()
  })

  it('caps the width of hover and lint tooltips', () => {
    const view = new EditorView({ parent: document.body, doc: '', extensions: sfmcSqlExtensions(fakeCatalog()) })
    const css = [...document.querySelectorAll('style')].map((s) => s.textContent).join('\n')
    expect(css).toMatch(/\.cm-tooltip\.cm-tooltip-lint[^{]*\{[^}]*max-width: min\(480px, calc\(100vw - 32px\)\)/)
    view.destroy()
  })
})
