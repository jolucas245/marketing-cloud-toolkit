import { describe, it, expect, beforeEach } from 'vitest'
import { mount } from '@vue/test-utils'
import { TO_TEST } from '@/data/toTest.js'
import { errorReport } from '@/composables/useReportError.js'
import ToTestPage from '../ToTestPage.vue'

describe('To Test (test builds only)', () => {
  beforeEach(() => { errorReport.value = null })

  it('has unique ids and complete items', () => {
    const ids = TO_TEST.flatMap((v) => v.items.map((i) => i.id))
    expect(new Set(ids).size).toBe(ids.length)
    for (const v of TO_TEST) for (const i of v.items) {
      expect(i.title && i.where && i.expect && i.steps.length).toBeTruthy()
    }
  })

  it('is not routed in a store build', async () => {
    const { routes } = await import('@/app/router.js')
    expect(routes.some((r) => r.path === '/to-test')).toBe(false)
  })

  it('marks results and opens Feedback on Fail', async () => {
    const w = mount(ToTestPage)
    const first = TO_TEST[0].items[0]
    const row = w.find(`[data-test-item="${first.id}"]`)
    await row.findAll('button').find((b) => b.text().includes('Pass')).trigger('click')
    expect(w.text()).toContain('1 passed')
    await row.findAll('button').find((b) => b.text().includes('Fail')).trigger('click')
    expect(w.text()).toContain('1 failed')
    expect(errorReport.value.message).toBe(`[To Test] ${first.title}: failed`)
    expect(errorReport.value.details).toContain('Expected:')
  })

  it('Send results puts every result and note in one Test results report', async () => {
    const w = mount(ToTestPage)
    const [a, b] = TO_TEST.flatMap((v) => v.items)
    const rowA = w.find(`[data-test-item="${a.id}"]`)
    await rowA.findAll('button').find((x) => x.text().includes('Pass')).trigger('click')
    await rowA.find('input').setValue('looked fine')
    await rowA.find('input').trigger('change')
    expect(w.text()).toContain('1 passed')
    await w.find('[data-send-results]').trigger('click')
    expect(errorReport.value.kind).toBe('test-results')
    expect(errorReport.value.message).toMatch(/1 pass, 0 fail, 0 skip/)
    expect(errorReport.value.details).toContain(`- PASS: ${a.title}`)
    expect(errorReport.value.details).toContain('  Note: looked fine')
    expect(errorReport.value.details).toContain(`- NOT DONE: ${b.title}`)
  })
})
