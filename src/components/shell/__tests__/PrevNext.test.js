import { describe, it, expect, beforeEach, vi } from 'vitest'
import { mount } from '@vue/test-utils'

const push = vi.fn()
vi.mock('vue-router', () => ({ useRouter: () => ({ push }) }))
const { default: PrevNext } = await import('../PrevNext.vue')
const { setBrowseList, clearBrowseLists } = await import('@/utils/browseList.js')

describe('PrevNext (feedback #1043)', () => {
  beforeEach(() => { push.mockClear(); sessionStorage.clear(); clearBrowseLists() })

  it('shows the position and goes to the neighbours by button and arrow key', async () => {
    setBrowseList('journeys', [{ id: 'j1', name: 'One' }, { id: 'j2', name: 'Two', query: { version: '3' } }])
    const w = mount(PrevNext, { props: { kind: 'journeys', id: 'j1', base: '/journeys' }, attachTo: document.body })
    expect(w.text()).toContain('1 of 2')
    await w.findAll('button')[1].trigger('click')
    expect(push).toHaveBeenLastCalledWith({ path: '/journeys/j2', query: { version: '3' } })
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight' }))
    expect(push).toHaveBeenCalledTimes(2)
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowLeft' })) // first: nothing before
    expect(push).toHaveBeenCalledTimes(2)
    w.unmount()
  })

  it('ignores arrow keys while typing', () => {
    setBrowseList('automations', [{ id: 'a' }, { id: 'b' }])
    const w = mount(PrevNext, { props: { kind: 'automations', id: 'a', base: '/automations' }, attachTo: document.body })
    const input = document.createElement('input'); document.body.appendChild(input); input.focus()
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight' }))
    expect(push).not.toHaveBeenCalled()
    input.remove(); w.unmount()
  })

  it('shows nothing when the page was not opened from a list', () => {
    const w = mount(PrevNext, { props: { kind: 'automations', id: 'x', base: '/automations' } })
    expect(w.find('[data-prev-next]').exists()).toBe(false)
  })
})
