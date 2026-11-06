import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import RunStepper from '../RunStepper.vue'

const running = (idx) => Array.from({ length: 5 }, (_, i) => (i < idx ? 'done' : i === idx ? 'running' : 'pending'))

describe('RunStepper question', () => {
  const prompt = { text: 'Open Contact Builder and retry?', confirmLabel: 'Open Contact Builder and retry', cancelLabel: 'Cancel' }
  const details = [null, { prompt }, null, null, null]

  it('shows the question under the running step and emits the answer', async () => {
    const w = mount(RunStepper, { props: { stepStatuses: running(1), stepDetails: details } })
    expect(w.text()).toContain('Open Contact Builder and retry?')
    const buttons = w.findAll('button').filter(b => ['Open Contact Builder and retry', 'Cancel'].includes(b.text()))
    expect(buttons).toHaveLength(2)
    await buttons[0].trigger('click')
    await buttons[1].trigger('click')
    expect(w.emitted('prompt')).toEqual([[true], [false]])
  })

  it('hides the question once the step is no longer running', () => {
    const w = mount(RunStepper, { props: { stepStatuses: ['done', 'error', 'pending', 'pending', 'pending'], stepDetails: details, stepErrors: [null, 'x', null, null, null] } })
    expect(w.text()).not.toContain('Open Contact Builder and retry?')
  })
})

describe('RunStepper: a long Run explained (feedback #1076)', () => {
  it('shows the note while Run is running, not once it is done', async () => {
    const { default: Stepper } = await import('../RunStepper.vue')
    const note = 'SFMC is still running the query.'
    const running = ['done', 'done', 'done', 'running', 'pending']
    const w = mount(Stepper, { props: { stepStatuses: running, stepDetails: [null, null, null, { note }, null], elapsedSeconds: 75 } })
    expect(w.find('[data-long-wait]').text()).toBe(note)
    await w.setProps({ stepStatuses: ['done', 'done', 'done', 'done', 'running'] })
    expect(w.find('[data-long-wait]').exists()).toBe(false)
  })
})
