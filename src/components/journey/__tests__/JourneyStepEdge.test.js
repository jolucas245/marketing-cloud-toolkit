import { describe, expect, it, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import JourneyStepEdge from '../JourneyStepEdge.vue'

vi.mock('@vue-flow/core', () => ({
  BaseEdge: { props: ['id', 'path', 'interactionWidth'], template: '<path :id="id" :d="path" />' },
  EdgeLabelRenderer: { template: '<div><slot /></div>' },
}))

describe('Journey contact path edges', () => {
  it('highlights the visited connection and dims its labels and join marker only when unvisited', async () => {
    const data = {
      path: 'M0 0L100 0', x: 50, y: 0, label: 'Yes', visited: true,
      junction: { x: 80, y: 0, count: 2, description: '2 joining paths before Welcome', color: '#f58a00' },
    }
    const wrapper = mount(JourneyStepEdge, { props: { id: 'journey-edge-1', data } })
    expect(wrapper.get('path').classes()).toContain('is-visited')
    expect(wrapper.find('.is-dimmed').exists()).toBe(false)
    await wrapper.setProps({ data: { ...data, visited: false } })
    expect(wrapper.get('path').classes()).not.toContain('is-visited')
    expect(wrapper.get('path').classes()).toContain('is-dimmed')
    expect(wrapper.get('.journey-step-label').classes()).toContain('is-dimmed')
    expect(wrapper.get('.journey-join-point').classes()).toContain('is-dimmed')
    expect(wrapper.get('.journey-join-point').attributes('aria-label')).toBe(data.junction.description)
    await wrapper.setProps({ data: { ...data, visited: null } })
    expect(wrapper.find('.is-visited, .is-dimmed').exists()).toBe(false)
    expect(wrapper.get('path').attributes('d')).toBe(data.path)
    wrapper.unmount()
  })
})

describe('Contact paths counts on edges (feedback #1089)', () => {
  it('shows the count with the path label and widens the line by weight', () => {
    const wrapper = mount(JourneyStepEdge, { props: { id: 'journey-edge-2', data: { path: 'M0 0L100 0', x: 50, y: 0, label: 'Path 1', visited: true, count: 1234, weight: 0.5 } } })
    expect(wrapper.get('[data-edge-count]').text()).toBe('Path 1 · 1,234')
    expect(wrapper.get('path').attributes('style')).toContain('stroke-width: 5px')
    wrapper.unmount()
  })
  it('shows a count on an unlabelled edge and nothing for zero', async () => {
    const wrapper = mount(JourneyStepEdge, { props: { id: 'journey-edge-3', data: { path: 'M0 0L100 0', x: 50, y: 0, label: '', visited: true, count: 7, weight: 1 } } })
    expect(wrapper.get('.journey-step-label').text()).toBe('7')
    await wrapper.setProps({ data: { path: 'M0 0L100 0', x: 50, y: 0, label: '', visited: false, count: 0, weight: 0 } })
    expect(wrapper.find('.journey-step-label').exists()).toBe(false)
    wrapper.unmount()
  })
})
