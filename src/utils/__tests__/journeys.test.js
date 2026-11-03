import { describe, it, expect } from 'vitest'
import { journeyGraph, layoutJourney, describeJourneyNode, nodeSummary, nodeKind, outcomeLabel, journeyDoc, nodeEmailId, describeCriteria } from '../journeys.js'
import { toMarkdown, toHtml } from '../exportDoc.js'
import { journeySvg, wrapText } from '../journeySvg.js'
import { journeyCanvasModel } from '../journeyCanvas.js'

// Entry → Email → Decision (Yes → Wait → Email 2; No → exit)
const journey = {
  id: 'j-1', name: 'Welcome', version: 3, status: 'Published',
  triggers: [{ name: 'Welcome DE', type: 'EmailAudience', metaData: { eventDefinitionKey: 'DEAudience-1' } }],
  activities: [
    { key: 'EMAIL-1', name: 'Welcome email', type: 'EMAILV2', outcomes: [{ next: 'SPLIT-1' }],
      configurationArguments: { triggeredSend: { emailId: 4321, emailSubject: 'Hello', preHeader: 'Hi there' } } },
    { key: 'SPLIT-1', name: 'Opened?', type: 'MULTICRITERIADECISION', outcomes: [
      { next: 'WAIT-1', metaData: { label: 'Opened' }, arguments: { criteria: '<FilterDefinition>opened</FilterDefinition>' } },
      { metaData: { label: 'Remainder' } }] },
    { key: 'WAIT-1', name: '2 days', type: 'WAIT', outcomes: [{ next: 'EMAIL-2' }], configurationArguments: { waitDuration: 2, waitUnit: 'DAYS' } },
    { key: 'EMAIL-2', name: 'Follow-up', type: 'EMAILV2', outcomes: [] },
  ],
  goals: [{ name: 'Purchased' }],
}

describe('journey graph and layout', () => {
  const graph = journeyGraph(journey)
  const layout = layoutJourney(graph)
  const at = (k) => layout.pos.get(k)

  it('builds the graph from outcomes, with exits where a path ends', () => {
    expect(graph.nodes.map((n) => n.key)).toEqual(['__entry', 'EMAIL-1', 'SPLIT-1', '__exit1', 'WAIT-1', 'EMAIL-2', '__exit2'])
    expect(graph.edges).toContainEqual({ from: '__entry', to: 'EMAIL-1', label: '' })
    expect(graph.edges).toContainEqual({ from: 'SPLIT-1', to: 'WAIT-1', label: 'Opened' })
    expect(graph.edges).toContainEqual({ from: 'SPLIT-1', to: '__exit1', label: 'Remainder' })
  })

  it('keeps the first path straight and gives the next path its own lane', () => {
    expect([at('__entry'), at('EMAIL-1'), at('SPLIT-1'), at('WAIT-1'), at('EMAIL-2')].map((p) => p.lane)).toEqual([0, 0, 0, 0, 0])
    expect(at('EMAIL-2').depth).toBe(4)
    expect(at('__exit1')).toEqual({ depth: 3, lane: 1 })
    expect(layout.lanes).toBe(2)
    expect(layout.depths).toBe(6)
  })

  it('places a node reached by two paths once', () => {
    const j = { activities: [
      { key: 'S', type: 'RANDOMSPLIT', outcomes: [{ next: 'A', arguments: { percentage: 50 } }, { next: 'B', arguments: { percentage: 50 } }] },
      { key: 'A', type: 'WAIT', outcomes: [{ next: 'J' }] }, { key: 'B', type: 'WAIT', outcomes: [{ next: 'J' }] },
      { key: 'J', type: 'EMAILV2', outcomes: [] }] }
    const g = journeyGraph(j)
    const l = layoutJourney(g)
    expect(g.edges.filter((e) => e.to === 'J')).toHaveLength(2)
    expect(l.pos.get('A').lane).toBe(0)
    expect(l.pos.get('B').lane).toBe(1)
    expect(l.pos.size).toBe(g.nodes.length)
    expect(g.edges.find((e) => e.from === 'S' && e.to === 'A').label).toBe('50%')
  })
})

describe('journey node content', () => {
  const graph = journeyGraph(journey)
  const node = (k) => graph.nodes.find((n) => n.key === k)

  it('summarises nodes for the canvas', () => {
    expect(nodeSummary(node('EMAIL-1'))).toBe('Subject: Hello')
    expect(nodeSummary(node('WAIT-1').raw)).toBe('2 days')
    expect(nodeSummary(node('SPLIT-1').raw)).toBe('2 paths')
    expect(nodeSummary(node('__entry'))).toBe('Event DEAudience-1')
    expect(nodeKind('MULTICRITERIADECISION')).toBe('split')
    expect(nodeKind('EMAILV2')).toBe('message')
    expect(outcomeLabel({}, 2)).toBe('Path 3')
  })

  it('describes an email, a wait and a decision', () => {
    const email = describeJourneyNode(node('EMAIL-1'))
    expect(email.typeLabel).toBe('Email')
    expect(Object.fromEntries(email.main)).toMatchObject({ Subject: 'Hello', Preheader: 'Hi there', 'Email ID': '4321' })
    expect(nodeEmailId(node('EMAIL-1'))).toBe(4321)
    expect(Object.fromEntries(describeJourneyNode(node('WAIT-1')).main).Wait).toBe('2 days')
    const split = describeJourneyNode(node('SPLIT-1'), (k) => graph.nodes.find((n) => n.key === k).name)
    expect(split.tables[0].rows).toEqual([['Opened', '<FilterDefinition>opened</FilterDefinition>', '2 days'], ['Remainder', '—', 'Exit']])
    expect(split.tables.find((t) => t.extra && t.title.startsWith('Criteria')).rows[0][0]).toContain('-- Opened\n<FilterDefinition>')
  })

  it('reads decision criteria', () => {
    const xml = '<FilterDefinition><ConditionSet Operator="AND"><Condition Key="Event.DEAudience-1.Country" Operator="Equal"><Value><![CDATA[CA]]></Value></Condition>' +
      '<ConditionSet Operator="OR"><Condition Key="Age" Operator="GreaterThanOrEqual"><Value>18</Value></Condition><Condition Key="Vip" Operator="IsNotNull"></Condition></ConditionSet></ConditionSet></FilterDefinition>'
    expect(describeCriteria(xml)).toBe('Country equals "CA" AND (Age is at least "18" OR Vip is not empty)')
    expect(describeCriteria('<broken')).toBe('<broken')
    expect(describeCriteria('')).toBe('')
  })

  it('exports the whole journey', () => {
    const graph2 = journeyGraph(journey)
    const md = toMarkdown(journeyDoc(journey, graph2, layoutJourney(graph2)))
    expect(md).toContain('# Welcome')
    expect(md).toContain('### Email: Welcome email')
    expect(md).toContain('| Next | Opened: 2 days; Remainder: Exit |')
    expect(md).toContain('## Goals')
  })

  it('draws the journey in the HTML download (feedback #1009)', () => {
    const g = journeyGraph({ ...journey, activities: journey.activities.map((a, i) => (i === 0 ? { ...a, name: 'Welcome <b>email</b>' } : a)) })
    const l = layoutJourney(g)
    for (const o of ['horizontal', 'vertical']) {
      const svg = journeySvg(g, l, o)
      const model = journeyCanvasModel(g, l, o)
      // One group per activity, one connector per edge, drawn with the canvas's own routes.
      expect(svg.match(/<g class="activity"/g).length).toBe(model.nodes.filter((n) => n.type === 'journeyActivity').length)
      expect(svg.match(/stroke="#c4d8e8"/g).length).toBe(model.edges.length)
      for (const e of model.edges) expect(svg).toContain(`<path d="${e.data.path}"`)
      for (const n of model.nodes.filter((x) => x.type === 'journeyActivity')) expect(svg).toContain(`fill="${n.data.visual.color}"`)
      expect(svg).toContain('Opened')
      expect(svg).toContain('Welcome &lt;b&gt;email&lt;/b&gt;')
      expect(svg).not.toContain('<b>')
    }
    const doc = journeyDoc(journey, g, l, journeySvg(g, l))
    expect(toHtml(doc)).toContain('<div class="diagram"><svg')
    expect(toMarkdown(doc)).toContain('_Journey diagram: in the HTML and PDF downloads._')
  })

  it('never loads remote Einstein icons in a download', () => {
    const icon = 'https://eef.us.sfmc-einstein.com/activity/static/media/EEF-Split.png'
    const g = journeyGraph({ ...journey, activities: journey.activities.map((a, i) => (i === 1 ? { ...a, type: 'EINSTEINSPLIT', metaData: { icon } } : a)) })
    const svg = journeySvg(g, layoutJourney(g))
    expect(svg).not.toContain('sfmc-einstein')
    expect(svg).not.toContain('<image')
    expect(svg).toContain('fill="#032d60"') // Einstein colour, built-in icon
  })

  it('wraps activity names to two lines like the canvas', () => {
    expect(wrapText('Welcome email')).toEqual(['Welcome email'])
    expect(wrapText('Send the second reminder email to everyone')).toEqual(['Send the second reminder', 'email to everyone'])
    expect(wrapText('Send the second reminder email to everyone who did not open')).toEqual(['Send the second reminder', 'email to everyone who…'])
    expect(wrapText('A'.repeat(30), 24, 2)).toEqual(['A'.repeat(24), 'AAAAAA'])
    expect(wrapText('')).toEqual([])
  })
})

describe('readable journey step settings (feedback #42)', () => {
  it('puts readable SMS settings first and IDs under additional details', async () => {
    const { describeJourneyNode, settingsRows } = await import('../journeys.js')
    const node = { key: 'sms1', type: 'SMSSYNC', name: 'Welcome SMS', raw: { key: 'sms1', type: 'SMSSYNC', configurationArguments: {
      applicationExtensionKey: 'jb-mobile', messageId: 'MzY6', keywordId: 'R1Zp', isOptIn: true, honorBlackoutWindowEnum: 0,
      isUsingDEAttributesForPersonalization: true, assetId: 114022, description: null, isConcatenate: true,
    } } }
    const d = describeJourneyNode(node)
    const main = Object.fromEntries(d.main)
    expect(main).toMatchObject({ Message: 'Welcome SMS', 'Opt-in message': 'Yes', 'Personalize with journey data': 'Yes', 'Join long messages': 'Yes', 'Blackout window': '0' })
    const extraLabels = d.extra.map(([k]) => k)
    expect(extraLabels).toEqual(expect.arrayContaining(['Application extension key', 'Message id', 'Keyword id', 'Asset id', 'Description']))
    expect(d.tables.find((t) => t.title === 'Settings')).toBeUndefined()
    expect(settingsRows({ fooBarCount: 3 }).main).toEqual([['Foo bar count', '3']])
  })
})

describe('journey SVG with a contact path', () => {
  it('outlines visited steps, numbers them and dims the rest', () => {
    const g = journeyGraph(journey)
    const l = layoutJourney(g)
    const svg = journeySvg(g, l, 'horizontal', { visited: new Set(['__entry', 'EMAIL-1']), visitedEdges: new Set([0]), steps: new Map([['EMAIL-1', [1]]]) })
    expect(svg).toContain('stroke="#0176d3" stroke-width="3"')
    expect(svg).toContain('opacity="0.4"')
    expect(svg).toMatch(/fill="#ffffff">1<\/text>/)
  })
})
