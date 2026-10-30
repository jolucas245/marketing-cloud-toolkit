import { describe, expect, it } from 'vitest'
import { journeyActivityIcon, journeyCanvasModel } from '../journeyCanvas.js'
import { journeyGraph, layoutJourney } from '../journeys.js'

const icon = 'https://eef.us.sfmc-einstein.com/activity/static/media/EEF-Split.png'

describe('Einstein activity icon URLs', () => {
  it.each([
    { metaData: { icon } },
    { icon },
    { configurationArguments: { icon } },
  ])('reads the icon URL from a supported activity field', (activity) => {
    expect(journeyActivityIcon(activity)).toBe(icon)
  })

  it('prefers the metadata icon and skips invalid candidates', () => {
    const other = 'https://eef.us.sfmc-einstein.com/activity/other.png'
    expect(journeyActivityIcon({ metaData: { icon }, icon: other })).toBe(icon)
    expect(journeyActivityIcon({ metaData: { icon: '/relative.png' }, icon })).toBe(icon)
  })

  it.each([
    'http://eef.us.sfmc-einstein.com/icon.png',
    'https://sfmc-einstein.com.example.org/icon.png',
    'https://fake-sfmc-einstein.com/icon.png',
    'https://example.org/icon.png',
    'https://user:password@eef.us.sfmc-einstein.com/icon.png',
    'https://eef.us.sfmc-einstein.com:8443/icon.png',
    'javascript:alert(1)',
    'data:image/png;base64,aGVsbG8=',
    '/relative.png',
    '//eef.us.sfmc-einstein.com/icon.png',
    'not a URL',
    '',
    false,
    {},
    null,
  ])('keeps the local icon when the supplied value is unsupported: %j', (value) => {
    expect(journeyActivityIcon({ metaData: { icon: value } })).toBeNull()
  })

  it('handles missing metadata and normalizes valid URLs', () => {
    expect(journeyActivityIcon()).toBeNull()
    expect(journeyActivityIcon({})).toBeNull()
    expect(journeyActivityIcon({ icon: `  ${icon}  ` })).toBe(icon)
    expect(journeyActivityIcon({ icon: 'https://sfmc-einstein.com/icon.png' })).toBe('https://sfmc-einstein.com/icon.png')
  })

  it.each([true, false])('preserves configuration colors, local fallback and activity identity for isConfigured=%s', (isConfigured) => {
    const definition = { activities: [{ key: 'einstein-original-key', type: 'EINSTEINSPLIT', name: 'Einstein', metaData: { icon, isConfigured }, outcomes: [] }] }
    const graph = journeyGraph(definition), layout = layoutJourney(graph)
    const before = JSON.stringify(graph)
    const model = journeyCanvasModel(graph, layout, 'horizontal', 'einstein-original-key')
    expect(model.nodes.find((node) => node.id === 'einstein-original-key').data).toMatchObject({
      key: 'einstein-original-key', iconUrl: icon, active: true,
      visual: { icon: 'engagement', shape: 'diamond', color: isConfigured ? '#032d60' : '#a8b7c7' },
    })
    expect(JSON.stringify(graph)).toBe(before)
  })
})
