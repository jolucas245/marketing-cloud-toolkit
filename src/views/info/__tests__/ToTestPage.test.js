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
})
