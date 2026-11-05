import { describe, it, expect, vi } from 'vitest'
vi.mock('../sfmcApi.js', () => ({ sfmcFetch: vi.fn(), listDERootFolders: vi.fn(), listDEChildFolders: vi.fn() }))
import { automationFolderLoader, deFolderLoader, inFolder } from '../folderLoaders.js'

describe('Folder trees on Automations, Journeys and DEs (feedback #1064, #1065)', () => {
  it('splits Automation Studio folders by parent, in one call', async () => {
    const fetch = vi.fn(async () => ({ items: [
      { categoryId: 10, parentId: 0, name: 'my automations' }, { categoryId: 12, parentId: 10, name: 'b' }, { categoryId: 11, parentId: 10, name: 'a' },
    ] }))
    const load = automationFolderLoader('s1', 'automations', fetch)
    expect((await load('0')).map((f) => f.name)).toEqual(['my automations'])
    expect((await load('10')).map((f) => f.name)).toEqual(['a', 'b'])
    expect(fetch).toHaveBeenCalledTimes(1)
    expect(fetch.mock.calls[0][0]).toContain('categorytype%20eq%20automations')
  })
  it('lists DE roots without the recycle bin, then children', async () => {
    const load = deFolderLoader('s1', {
      rootsFetch: async () => ({ entry: [{ id: 1, name: 'Data Extensions', type: 'dataextension' }, { id: 2, name: 'Recycle', type: 'recyclebin' }] }),
      childrenFetch: async (s, id) => ({ entry: [{ id: 5, name: 'Z' }, { id: 4, name: 'A' }] }),
    })
    expect((await load('0')).map((f) => f.name)).toEqual(['Data Extensions'])
    expect((await load('1')).map((f) => f.name)).toEqual(['A', 'Z'])
  })
  it('keeps rows of the folder', () => {
    expect(inFolder({ categoryId: 5 }, '5')).toBe(true)
    expect(inFolder({ categoryId: 6 }, '5')).toBe(false)
    expect(inFolder({}, '5')).toBe(true)
    expect(inFolder({ categoryId: 6 }, null)).toBe(true)
  })
})
