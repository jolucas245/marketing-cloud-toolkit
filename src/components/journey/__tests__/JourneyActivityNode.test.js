import { describe, expect, it, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import JourneyActivityNode from '../JourneyActivityNode.vue'
import { journeyActivityVisual } from '@/utils/journeyCanvas.js'

vi.mock('@vue-flow/core', () => ({
  Handle: { template: '<span />' },
  Position: { Left: 'left', Right: 'right', Top: 'top', Bottom: 'bottom' },
}))

const first = 'https://eef.us.sfmc-einstein.com/activity/static/media/EEF-Split.png'
const second = 'https://eef.us.sfmc-einstein.com/activity/static/media/other.png'
const data = (overrides = {}) => ({
  key: 'einstein-original-key', name: 'Einstein', typeLabel: 'Einstein split', summary: '', active: false,
  orientation: 'horizontal', visual: journeyActivityVisual('EINSTEINSPLIT'), iconUrl: first, ...overrides,
})

describe('Journey activity remote image', () => {
  it('keeps the local icon available until the remote image loads', async () => {
    const wrapper = mount(JourneyActivityNode, { props: { data: data() } })
    const image = wrapper.get('img')
    expect(image.attributes()).toMatchObject({ src: first, alt: '', draggable: 'false', referrerpolicy: 'no-referrer' })
    expect(image.classes()).not.toContain('is-loaded')
    expect(wrapper.get('svg').classes()).not.toContain('is-image-fallback')
    await image.trigger('load')
    expect(wrapper.get('img').classes()).toContain('is-loaded')
    expect(wrapper.get('svg').classes()).toContain('is-image-fallback')
    wrapper.unmount()
  })

  it('falls back after a loading error and preserves button selection', async () => {
    const wrapper = mount(JourneyActivityNode, { props: { data: data() } })
    await wrapper.get('img').trigger('error')
    expect(wrapper.find('img').exists()).toBe(false)
    expect(wrapper.get('svg').classes()).not.toContain('is-image-fallback')
    expect(wrapper.get('button').attributes('data-activity-key')).toBe('einstein-original-key')
    await wrapper.get('button').trigger('click')
    expect(wrapper.emitted('select')).toHaveLength(1)
    wrapper.unmount()
  })

  it('tries a new URL after a previous failure', async () => {
    const wrapper = mount(JourneyActivityNode, { props: { data: data() } })
    await wrapper.get('img').trigger('error')
    await wrapper.setProps({ data: data({ iconUrl: second }) })
    expect(wrapper.get('img').attributes('src')).toBe(second)
    expect(wrapper.get('svg').classes()).not.toContain('is-image-fallback')
    await wrapper.get('img').trigger('load')
    expect(wrapper.get('img').classes()).toContain('is-loaded')
    wrapper.unmount()
  })

  it('ignores late events from a replaced image', async () => {
    const wrapper = mount(JourneyActivityNode, { props: { data: data() } })
    const previous = wrapper.get('img')
    await wrapper.setProps({ data: data({ iconUrl: second }) })
    await previous.trigger('load')
    expect(wrapper.get('img').classes()).not.toContain('is-loaded')
    await wrapper.get('img').trigger('load')
    await previous.trigger('error')
    expect(wrapper.get('img').attributes('src')).toBe(second)
    expect(wrapper.get('img').classes()).toContain('is-loaded')
    wrapper.unmount()
  })

  it('keeps the loaded image when selection changes', async () => {
    const wrapper = mount(JourneyActivityNode, { props: { data: data() } })
    const image = wrapper.get('img')
    await image.trigger('load')
    await wrapper.setProps({ data: data({ active: true }) })
    expect(wrapper.get('img').element).toBe(image.element)
    expect(wrapper.get('img').classes()).toContain('is-loaded')
    expect(wrapper.get('button').attributes('aria-pressed')).toBe('true')
    wrapper.unmount()
  })

  it('uses only the local icon when no URL is available', () => {
    const wrapper = mount(JourneyActivityNode, { props: { data: data({ iconUrl: null }) } })
    expect(wrapper.find('img').exists()).toBe(false)
    expect(wrapper.get('svg').classes()).not.toContain('is-image-fallback')
    wrapper.unmount()
  })

  it('preserves the gray configuration state with a remote icon', async () => {
    const wrapper = mount(JourneyActivityNode, { props: { data: data({ visual: journeyActivityVisual('EINSTEINSPLIT', false) }) } })
    await wrapper.get('img').trigger('load')
    expect(wrapper.get('.journey-activity').attributes('style')).toContain('--activity-color: #a8b7c7')
    expect(wrapper.get('img').classes()).toContain('is-loaded')
    wrapper.unmount()
  })
})

describe('Journey activity branch exit', () => {
  it('exposes the lower handle without changing activity selection', async () => {
    const wrapper = mount(JourneyActivityNode, { props: { data: data({ branchExit: true, iconUrl: null }) } })
    expect(wrapper.get('.journey-activity').classes()).toContain('has-branch-exit')
    expect(wrapper.get('#branch').attributes('style')).toContain('left: 78px')
    expect(wrapper.get('#branch').attributes('style')).toContain('top: 48px')
    await wrapper.get('button').trigger('click')
    expect(wrapper.emitted('select')).toHaveLength(1)
    expect(wrapper.get('button').attributes('data-activity-key')).toBe('einstein-original-key')
    wrapper.unmount()
  })

  it('omits the lower handle when there is no descending branch', () => {
    const wrapper = mount(JourneyActivityNode, { props: { data: data({ branchExit: false, iconUrl: null }) } })
    expect(wrapper.find('#branch').exists()).toBe(false)
    expect(wrapper.get('.journey-activity').classes()).not.toContain('has-branch-exit')
    wrapper.unmount()
  })

  it('does not add the horizontal branch handle in vertical orientation', () => {
    const wrapper = mount(JourneyActivityNode, { props: { data: data({ branchExit: true, orientation: 'vertical', iconUrl: null }) } })
    expect(wrapper.find('#branch').exists()).toBe(false)
    wrapper.unmount()
  })
})
