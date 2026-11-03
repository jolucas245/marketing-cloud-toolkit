import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import AutomationCanvas from '../AutomationCanvas.vue'

const details = {
  type: 'triggered',
  steps: [{ name: 'First', activities: [{ name: 'Load', objectTypeId: 43 }] }, { activities: [{ name: 'Query A', objectTypeId: 300 }, { name: 'Query B', objectTypeId: 300 }] }],
}

describe('AutomationCanvas (feedback #1035)', () => {
  it('shows the source, step lanes and cards, and emits the card key on click', async () => {
    const w = mount(AutomationCanvas, { props: { details, acts: { '1.0': { status: 'loading' } }, runningStep: 2 } })
    const text = w.text()
    expect(text).toContain('File Drop')
    expect(text).toContain('Step 1')
    expect(text).toContain('First')
    expect(text).toContain('Step 2')
    expect(text).toContain('2.2')
    const cards = w.findAll('button[data-key]')
    expect(cards.map((c) => c.attributes('data-key'))).toEqual(['0.0', '1.0', '1.1'])
    expect(w.find('[aria-label="This step is running"]').exists()).toBe(true)
    await cards[2].trigger('click')
    expect(w.emitted('select')[0]).toEqual(['1.1'])
  })
})
