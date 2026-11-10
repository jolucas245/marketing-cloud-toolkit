import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import AiAnswer from '../AiAnswer.vue'

describe('AiAnswer (#1096)', () => {
  it('draws bullets and bold without Markdown marks, and never as HTML', () => {
    const w = mount(AiAnswer, { props: { text: '* **Step 1:** uses <b>x</b>\n* two' } })
    expect(w.findAll('li')).toHaveLength(2)
    expect(w.find('li .font-semibold').text()).toBe('Step 1:')
    expect(w.text()).not.toContain('**')
    expect(w.find('li b').exists()).toBe(false)
    expect(w.text()).toContain('<b>x</b>')
  })
})
