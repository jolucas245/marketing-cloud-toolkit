import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { reactive } from 'vue'

const route = reactive({ path: '/home' })
vi.mock('vue-router', () => ({ useRouter: () => ({ push: vi.fn() }), useRoute: () => route }))
vi.mock('@/composables/useAi.js', () => ({ useAi: () => ({ shown: { value: false } }) }))

const STAGES = [{ id: 'queries', label: 'Loading SQL Query activities' }, { id: 'analyse', label: 'Matching' }]
const usage = vi.hoisted(() => ({ state: null }))
vi.mock('@/composables/useUsage.js', async () => {
  const { reactive: r } = await import('vue')
  usage.state = r({ open: true, target: null, stack: 's1', running: false, error: '', result: null, order: [], stages: {}, history: [], skip: [] })
  return {
    useUsage: () => ({
      state: usage.state, start: vi.fn(), stop: vi.fn(), follow: vi.fn(), back: vi.fn(), again: vi.fn(),
      progress: () => 0.5, toggleSkip: vi.fn(), canSkip: (id) => id !== 'analyse',
    }),
    targetTitle: (t) => t?.de?.name || '',
    targetKindLabel: () => 'Data extension',
  }
})

const stubs = { DERowCount: true, DownloadMenu: true, AiButton: true, AskAiDialog: true, CodeView: true, StatusBadge: true, ActivityIcon: true }

describe('Where used panel', () => {
  beforeEach(async () => {
    await import('@/composables/useUsage.js')
    route.path = '/home'
    Object.assign(usage.state, {
      open: true, target: { kind: 'de', de: { name: 'Sample_DE', customerKey: 'KEY-1' } }, running: true, error: '', result: null,
      order: STAGES, stages: { queries: { state: 'running', done: 3, total: 10, note: '' }, analyse: { state: 'waiting', done: 0, total: 0, note: '' } },
    })
  })

  it('floats on other pages and hides on the Where used page unless embedded', async () => {
    const { default: Panel } = await import('../UsagePanel.vue')
    const floating = mount(Panel, { global: { stubs } })
    expect(floating.find('aside').exists()).toBe(true)
    route.path = '/where-used'
    await flushPromises()
    expect(floating.find('aside').exists()).toBe(false)
    const embedded = mount(Panel, { props: { embedded: true }, global: { stubs } })
    expect(embedded.find('aside').exists()).toBe(true)
  })

  it('shows progress, steps with Skip, Stop, and the key', async () => {
    const { default: Panel } = await import('../UsagePanel.vue')
    const w = mount(Panel, { props: { embedded: true }, global: { stubs } })
    const t = w.text()
    expect(t).toContain('50%')
    expect(t).toContain('0 of 2 steps done')
    expect(t).toContain('3 of 10')
    expect(t).toContain('KEY-1')
    expect(w.findAll('button').some((b) => b.text() === 'Skip')).toBe(true)
    expect(w.findAll('button').some((b) => b.text().includes('Stop'))).toBe(true)
    expect(t).toContain('Results fill in when matching finishes.')
  })

  it('offers Resume after a stop and lists result tiles with real counts', async () => {
    Object.assign(usage.state, {
      running: false, error: 'Stopped.',
    })
    const { default: Panel } = await import('../UsagePanel.vue')
    const w = mount(Panel, { props: { embedded: true }, global: { stubs } })
    expect(w.findAll('button').some((b) => b.text().includes('Resume'))).toBe(true)

    Object.assign(usage.state, {
      error: '', stages: { queries: { state: 'done', done: 10, total: 10, note: '' }, analyse: { state: 'done', done: 0, total: 0, note: '1 found' } },
      result: { sections: [
        { id: 'queries', title: 'SQL Query activities', items: [{ key: 'q1', kind: 'SQL Query', title: 'Q one', badges: [], lines: [] }] },
        { id: 'imports', title: 'Import activities', items: [], empty: 'None.' },
      ] },
    })
    await flushPromises()
    const tiles = w.findAll('button[title^="Show "]')
    expect(tiles.map((b) => b.text())).toEqual(['SQL Query activities1', 'Import activities0'])
    expect(w.text()).toContain('Rescan everything')
  })
})
