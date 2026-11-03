import { beforeEach, describe, expect, it, vi } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import JourneyCanvas from '../JourneyCanvas.vue'
import { journeyGraph, layoutJourney } from '@/utils/journeys.js'

const flow = vi.hoisted(() => ({ fit: vi.fn(), zoomIn: vi.fn(), zoomOut: vi.fn(), zoomTo: vi.fn(), setViewport: vi.fn(), initialized: [] }))
vi.mock('@vue-flow/core', async () => {
  const { ref, h, defineComponent } = await import('vue')
  return {
    useVueFlow: () => ({
      viewport: ref({ x: 20, y: 30, zoom: 1 }), fitView: flow.fit, zoomIn: flow.zoomIn, zoomOut: flow.zoomOut,
      zoomTo: flow.zoomTo, setViewport: flow.setViewport, getViewport: () => ({ x: 20, y: 30, zoom: 1 }),
      onNodesInitialized: (callback) => flow.initialized.push(callback),
    }),
    VueFlow: defineComponent({
      props: ['nodes', 'edges'], emits: ['nodeClick', 'paneClick'],
      setup: (props, { emit, slots }) => () => h('div', { class: 'flow-test' }, [
        ...props.nodes.map((node) => h('div', { key: node.id }, slots['node-journeyActivity']?.(node))),
        slots.default?.(),
      ]),
    }),
    Handle: { template: '<span />' }, Position: { Left: 'left', Right: 'right', Top: 'top', Bottom: 'bottom' },
    BaseEdge: { template: '<path />' }, EdgeLabelRenderer: { template: '<div><slot /></div>' },
  }
})
vi.mock('@vue-flow/minimap', () => ({ MiniMap: { template: '<div data-minimap />' } }))

const graph = journeyGraph({ activities: [{ key: 'original-email-key', type: 'EMAILV2', name: 'Welcome', outcomes: [] }] })
const props = { graph, layout: layoutJourney(graph) }

async function pointer(wrapper, type, options) {
  wrapper.element.dispatchEvent(new MouseEvent(type, { bubbles: true, ...options }))
  await flushPromises()
}

describe('Journey canvas interactions', () => {
  beforeEach(() => { vi.clearAllMocks(); flow.initialized.length = 0 })

  it('selects by the original activity key, but does not select after a pan gesture', async () => {
    const wrapper = mount(JourneyCanvas, { props })
    const button = wrapper.find('[data-activity-key="original-email-key"]')
    await pointer(button, 'pointerdown', { clientX: 10, clientY: 10, button: 0, buttons: 1 })
    await pointer(button, 'click', { detail: 1 })
    expect(wrapper.emitted('select')).toEqual([['original-email-key']])
    await pointer(button, 'pointerdown', { clientX: 10, clientY: 10, button: 0, buttons: 1 })
    await pointer(wrapper, 'pointermove', { clientX: 40, clientY: 10, buttons: 1 })
    await pointer(button, 'click', { detail: 1 })
    expect(wrapper.emitted('select')).toHaveLength(1)
    await button.trigger('keydown', { key: 'Enter' })
    await pointer(button, 'click', { detail: 0 })
    expect(wrapper.emitted('select')).toHaveLength(2)
    wrapper.unmount()
  })

  it('does not reset the viewport on selection and refits when orientation changes', async () => {
    const wrapper = mount(JourneyCanvas, { props })
    flow.initialized[0]()
    await wrapper.setProps({ selected: 'original-email-key' })
    expect(flow.fit).toHaveBeenCalledTimes(1)
    await wrapper.setProps({ orientation: 'vertical' })
    await flushPromises()
    expect(flow.fit).toHaveBeenCalledTimes(2)
    wrapper.unmount()
  })

  it('scopes keyboard controls and preserves button activation and browser shortcuts', async () => {
    const wrapper = mount(JourneyCanvas, { props })
    await wrapper.trigger('keydown', { key: '+' })
    await wrapper.trigger('keydown', { key: '0' })
    await wrapper.trigger('keydown', { key: 'ArrowRight' })
    expect(flow.zoomIn).toHaveBeenCalledTimes(1)
    expect(flow.zoomTo).toHaveBeenCalledWith(1)
    expect(flow.setViewport).toHaveBeenCalledWith({ x: -28, y: 30, zoom: 1 })
    await wrapper.trigger('keydown', { key: '+', ctrlKey: true })
    await wrapper.trigger('keydown', { key: '+', isComposing: true })
    await wrapper.find('[data-activity-key]').trigger('keydown', { key: '+' })
    expect(flow.zoomIn).toHaveBeenCalledTimes(1)
    await wrapper.trigger('keydown', { key: 'Escape' })
    expect(wrapper.emitted('select')).toEqual([[null]])
    wrapper.unmount()
  })

  it('offers a minimap and a stable empty state', async () => {
    const wrapper = mount(JourneyCanvas, { props })
    await wrapper.find('[aria-label="Toggle minimap"]').trigger('click')
    expect(wrapper.find('[data-minimap]').exists()).toBe(true)
    await wrapper.setProps({ graph: { nodes: [], edges: [] }, layout: { pos: new Map() } })
    expect(wrapper.find('[role="status"]').text()).toContain('No activities')
    wrapper.unmount()
  })

  it('updates contact path highlights and step badges without resetting the viewport', async () => {
    const wrapper = mount(JourneyCanvas, { props: {
      ...props, visited: new Set(['original-email-key']), visitedEdges: new Set([0]),
      steps: new Map([['original-email-key', [1, 3]]]),
    } })
    flow.initialized[0]()
    const activity = wrapper.find('[data-activity-key="original-email-key"]')
    expect(activity.find('.journey-activity-steps').text()).toBe('1,3')
    expect(activity.attributes('aria-label')).toContain("Step 1, 3 of this contact's path")
    expect(activity.element.closest('.journey-activity').classList.contains('is-visited')).toBe(true)
    await wrapper.setProps({ visited: new Set(), visitedEdges: new Set(), steps: new Map() })
    expect(activity.element.closest('.journey-activity').classList.contains('is-dimmed')).toBe(true)
    expect(activity.find('.journey-activity-steps').exists()).toBe(false)
    await activity.trigger('click')
    expect(wrapper.emitted('select')).toEqual([['original-email-key']])
    await wrapper.setProps({ visited: null, visitedEdges: null, steps: null })
    expect(activity.element.closest('.journey-activity').classList.contains('is-dimmed')).toBe(false)
    expect(activity.attributes('aria-label')).not.toContain('contact')
    expect(flow.fit).toHaveBeenCalledTimes(1)
    wrapper.unmount()
  })
})
