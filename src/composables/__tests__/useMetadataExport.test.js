import { describe, it, expect, vi } from 'vitest'

vi.mock('@/utils/sfmcApi.js', () => ({
  fetchCurrentBU: vi.fn(async () => ({ name: 'Test Unit', accountId: 7 })),
  listDERootFolders: vi.fn(async () => ({ entry: [{ id: 1, name: 'Data Extensions', parentId: 0 }] })),
  listDEChildFolders: vi.fn(async (s, id) => ({ entry: id === 1 ? [{ id: 2, name: 'Child', parentId: 1 }] : [] })),
  listQAFolders: vi.fn(async () => { throw new Error('no folders') }),
  listAutomationFolders: vi.fn(async () => ({ items: [{ categoryId: 9, name: 'My automations', parentId: 0 }] })),
}))
vi.mock('@/utils/deApi.js', () => ({
  searchLocalDEs: vi.fn(async () => ({ items: [{ id: 'd1', name: 'One', customerKey: 'K1', categoryId: 2 }], total: 1, fetched: 1 })),
  searchSharedSyncDEs: vi.fn(async () => []),
  fetchDEFieldList: vi.fn(async () => [{ name: 'Id', type: 'Text', length: 10, isPrimaryKey: true }]),
  fetchDEFolderPath: vi.fn(async () => 'Data Extensions > Child'),
  fetchDERowCount: vi.fn(async () => 42),
}))
vi.mock('@/utils/automationApi.js', () => ({
  searchAutomations: vi.fn(async () => { throw new Error('SFMC API error 500: down') }),
  loadMoreAutomations: vi.fn(),
  fetchAutomationStatus: vi.fn(),
}))
vi.mock('@/utils/cloudPagesApi.js', () => ({
  searchCloudPages: vi.fn(async () => ({ items: [], total: 0 })),
  fetchCloudPageFolderPath: vi.fn(),
}))
vi.mock('@/utils/usage/sources.js', () => {
  class StoppedError extends Error { constructor() { super('Stopped.'); this.stopped = true } }
  const empty = { load: vi.fn(async () => ({ items: [], total: 0, capped: false })) }
  return { StoppedError, SOURCES: { queries: empty, imports: empty, dataextracts: empty, filetransfers: empty, scripts: empty, filters: empty, journeys: empty, events: empty } }
})

describe('useMetadataExport (#1036)', () => {
  it('reads every ticked part; a failing part does not stop the others', async () => {
    const { useMetadataExport } = await import('../useMetadataExport.js')
    const m = useMetadataExport()
    m.rowCounts.value = true
    await m.start('s1')
    expect(m.meta.value).toMatchObject({ stack: 's1', buId: 7, buName: 'Test Unit' })
    expect(m.status.automations).toMatchObject({ state: 'failed', message: 'SFMC API error 500: down' })
    for (const id of ['des', 'queries', 'activities', 'journeys', 'events', 'cloudpages', 'folders']) expect(m.status[id].state).toBe('done')
    expect(m.results.des.items[0]).toMatchObject({ name: 'One', folderPath: 'Data Extensions > Child', rowCount: 42 })
    expect(m.results.des.items[0].fields).toHaveLength(1)
    expect(m.results.folders.items.map((f) => f.path)).toEqual(['Data Extensions', 'Data Extensions > Child', 'My automations'])
    expect(m.results.folders.errors).toEqual([{ item: 'Query activities folders', message: 'no folders' }])
    expect(m.hasResults()).toBe(true)
  })

  it('skips parts that are not ticked', async () => {
    const { useMetadataExport } = await import('../useMetadataExport.js')
    const m = useMetadataExport()
    for (const id of Object.keys(m.selected)) m.selected[id] = id === 'events'
    await m.start('s1')
    expect(m.status.events.state).toBe('done')
    expect(m.status.des.state).toBe('idle')
    expect(m.results.des).toBeUndefined()
  })
})
