import { describe, it, expect } from 'vitest'
import { HOME_GROUPS, normalizeLayout, isHidden, moveTo, moveBy, setHidden, isDefaultLayout } from '../homeLayout.js'

describe('home layout', () => {
  it('starts from the default order with nothing hidden', () => {
    const l = normalizeLayout(undefined)
    expect(l.order).toEqual(HOME_GROUPS)
    expect(l.hidden).toEqual([])
    expect(isDefaultLayout(l)).toBe(true)
  })

  it('keeps a saved order, drops unknown ids and places new cards next to their default neighbour', () => {
    const l = normalizeLayout({
      order: { glance: ['watched', 'gone', 'automations', 'watched'], starts: ['whereUsed', 'runQuery'] },
      hidden: ['glance:journeys', 'glance:gone', 'nope', 'glance:journeys'],
    })
    expect(l.order.glance).toEqual(['watched', 'automations', 'journeys', 'needsLook'])
    // Missing ones follow the saved card they come after by default.
    expect(l.order.starts).toEqual(['whereUsed', 'automationList', 'runQuery', 'buildQuery', 'contactJourneys', 'emailValidation'])
    expect(l.hidden).toEqual(['glance:journeys'])
    expect(isHidden(l, 'glance', 'journeys')).toBe(true)
    expect(isHidden(l, 'glance', 'watched')).toBe(false)
  })

  it('moves within a group, clamped at the ends, without changing the original', () => {
    const l = normalizeLayout()
    const moved = moveBy(l, 'glance', 'automations', 1)
    expect(moved.order.glance).toEqual(['journeys', 'automations', 'needsLook', 'watched'])
    expect(l.order.glance).toEqual(HOME_GROUPS.glance)
    expect(moveBy(l, 'glance', 'automations', -1).order.glance).toEqual(HOME_GROUPS.glance)
    expect(moveTo(l, 'sections', 'lists', 0).order.sections).toEqual(['lists', 'ai', 'connection', 'glance', 'starts'])
    expect(moveTo(l, 'glance', 'watched', 99).order.glance).toEqual(HOME_GROUPS.glance)
    expect(isDefaultLayout(moved)).toBe(false)
  })

  it('reads lists Chrome stored as objects', () => {
    const l = normalizeLayout({ order: { glance: { 0: 'watched', 1: 'automations', 2: 'journeys', 3: 'needsLook' } }, hidden: { 0: 'glance:journeys' } })
    expect(l.order.glance).toEqual(['watched', 'automations', 'journeys', 'needsLook'])
    expect(l.hidden).toEqual(['glance:journeys'])
  })

  it('hides and shows', () => {
    const l = setHidden(normalizeLayout(), 'starts', 'whereUsed', true)
    expect(l.hidden).toEqual(['starts:whereUsed'])
    expect(setHidden(l, 'starts', 'whereUsed', true).hidden).toEqual(['starts:whereUsed'])
    expect(isDefaultLayout(setHidden(l, 'starts', 'whereUsed', false))).toBe(true)
  })
})
