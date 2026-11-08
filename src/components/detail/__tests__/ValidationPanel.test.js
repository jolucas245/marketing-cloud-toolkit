import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import ValidationPanel from '../ValidationPanel.vue'
import RunStepper from '../RunStepper.vue'

// SFMC's Validate message as seen live for an unknown column.
const SFMC_ERROR = "An error occurred while checking the query syntax. Errors: Invalid column name 'NoSuchField'."
const SQL = 'SELECT o.NoSuchField FROM Demo_Orders o'

// Validate showed SFMC's error without the "Likely cause" box of a failed Run (live test, 2026-11-07).
describe('Validate panel explanations', () => {
  it('explains an SFMC error the same way as the failed Run step', () => {
    const v = mount(ValidationPanel, { props: { sql: SQL, results: { queryValid: false, errors: [{ message: SFMC_ERROR }], warnings: [] } } })
    const box = v.find('[data-error-explanation]')
    expect(box.exists()).toBe(true)
    expect(box.text()).toContain('Likely cause:')
    expect(box.text()).toContain('Fix:')
    const r = mount(RunStepper, { props: { stepStatuses: ['done', 'done', 'error', 'pending', 'pending'], stepErrors: [null, null, SFMC_ERROR, null, null], sql: SQL } })
    expect(r.find('[data-error-explanation]').text()).toBe(box.text())
  })

  it('explains a fatal validation error too', () => {
    const v = mount(ValidationPanel, { props: { sql: SQL, results: { fatalError: "Invalid object name 'Demo_Ordrs'." } } })
    expect(v.find('[data-error-explanation]').text()).toContain('Likely cause:')
  })

  it('adds nothing for an error it cannot explain or a valid query', () => {
    const v = mount(ValidationPanel, { props: { sql: SQL, results: { queryValid: false, errors: [{ message: 'Something odd' }], warnings: [] } } })
    expect(v.find('[data-error-explanation]').exists()).toBe(false)
    const ok = mount(ValidationPanel, { props: { sql: SQL, results: { queryValid: true, errors: [], warnings: [] } } })
    expect(ok.find('[data-error-explanation]').exists()).toBe(false)
  })
})
