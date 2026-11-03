import { describe, it, expect } from 'vitest'
import { automationCanvasModel, automationSource, fitScale, CANVAS_PAD, SOURCE_WIDTH, LANE_WIDTH, LANE_GAP, HEADER_HEIGHT, LANE_PAD, CARD_HEIGHT, CARD_GAP } from '../automationCanvas.js'
import { automationSvg } from '../automationSvg.js'
import { automationDoc } from '../automationDoc.js'
import { toMarkdown, toHtml } from '../exportDoc.js'

const details = {
  name: 'Nightly load',
  schedule: { scheduleStatus: 'Active', icalRecur: 'FREQ=DAILY;INTERVAL=1', timezoneName: 'UTC', scheduledTime: '2026-11-04T02:00:00Z' },
  steps: [
    { name: 'Import', activities: [{ name: 'Load file', objectTypeId: 43 }] },
    { activities: [{ name: 'Build audience', objectTypeId: 300 }, { name: 'Clean <up> & "trim"', objectTypeId: 300 }, { name: 'Pause', objectTypeId: 467 }] },
    { name: 'Empty', activities: [] },
  ],
}

describe('automationSource', () => {
  it('describes a schedule with recurrence and next run', () => {
    const s = automationSource(details)
    expect(s.kind).toBe('schedule')
    expect(s.title).toBe('Schedule')
    expect(s.lines[0]).toBe('Every day')
    expect(s.lines.some((l) => l.startsWith('Next run '))).toBe(true)
    expect(s.lines).toContain('UTC')
    expect(s.lines).toContain('Schedule active')
  })
  it('describes a file drop from the fields present', () => {
    expect(automationSource({ type: 'triggered', fileTrigger: { fileNamingPattern: 'orders_*.csv', folderLocationText: 'Import' } }))
      .toEqual({ kind: 'fileDrop', title: 'File Drop', lines: ['File name: orders_*.csv', 'Folder: Import'] })
    expect(automationSource({ type: 'triggered' }).lines).toEqual(['Runs when a file arrives'])
  })
  it('says when there is no starting source', () => {
    expect(automationSource({ steps: [] })).toEqual({ kind: 'none', title: 'Starting source', lines: ['No schedule. Runs when started.'] })
  })
})

describe('automationCanvasModel', () => {
  const m = automationCanvasModel(details, { runningStep: 2 })
  it('makes one lane per step after the source, all as tall as the tallest', () => {
    expect(m.columns.map((c) => c.label)).toEqual(['Step 1', 'Step 2', 'Step 3'])
    expect(m.columns[0].x).toBe(CANVAS_PAD + SOURCE_WIDTH + LANE_GAP)
    expect(m.columns[1].x - m.columns[0].x).toBe(LANE_WIDTH + LANE_GAP)
    const tallest = HEADER_HEIGHT + LANE_PAD * 2 + 3 * CARD_HEIGHT + 2 * CARD_GAP
    expect(m.columns.every((c) => c.h === tallest)).toBe(true)
    expect(m.columns.map((c) => c.running)).toEqual([false, true, false])
    expect(m.width).toBe(m.columns[2].x + LANE_WIDTH + CANVAS_PAD)
  })
  it('stacks activity cards with step.activity labels, types and icons', () => {
    const cards = m.columns[1].cards
    expect(cards.map((c) => c.label)).toEqual(['2.1', '2.2', '2.3'])
    expect(cards.map((c) => c.key)).toEqual(['1.0', '1.1', '1.2'])
    expect(cards[0]).toMatchObject({ typeLabel: 'SQL Query', iconKind: 'query', name: 'Build audience' })
    expect(cards[2].iconKind).toBe('wait')
    expect(cards[1].y - cards[0].y).toBe(CARD_HEIGHT + CARD_GAP)
    expect(m.columns[2].cards).toEqual([])
  })
  it('connects the source to step 1 and each step to the next', () => {
    expect(m.connectors).toHaveLength(3)
    expect(m.connectors[0].x1).toBe(m.source.x + m.source.w)
    expect(m.connectors[0].x2).toBe(m.columns[0].x)
    expect(m.connectors[2].x1).toBe(m.columns[1].x + LANE_WIDTH)
  })
  it('copes with no steps', () => {
    const e = automationCanvasModel({})
    expect(e.columns).toEqual([])
    expect(e.connectors).toEqual([])
    expect(e.width).toBe(CANVAS_PAD * 2 + SOURCE_WIDTH)
  })
  it('fits a box without growing past 100%', () => {
    expect(fitScale(m, m.width * 2)).toBe(1)
    expect(fitScale(m, m.width / 2)).toBe(0.5)
    expect(fitScale(m, 10)).toBe(0.3)
  })
})

describe('automationSvg and the download', () => {
  it('draws source, lanes, cards and arrows with escaped text', () => {
    const svg = automationSvg(details)
    expect(svg.startsWith('<svg')).toBe(true)
    expect(svg).toContain('>Schedule<')
    expect(svg).toContain('>Step 3<')
    expect(svg).toContain('>No activities<')
    expect(svg).toContain('Clean &lt;up&gt; &amp;')
    expect(svg).not.toContain('<up>')
    expect((svg.match(/<line /g) || []).length).toBe(3)
    expect((svg.match(/class="activity"/g) || []).length).toBe(4)
  })
  it('puts the diagram in HTML and a note in Markdown', () => {
    const doc = automationDoc(details, null, () => null)
    expect(toHtml(doc)).toContain('aria-label="Automation diagram"')
    expect(toMarkdown(doc)).toContain('Automation diagram: in the HTML and PDF downloads.')
  })
})
