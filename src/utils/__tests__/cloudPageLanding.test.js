import { describe, it, expect, vi } from 'vitest'
vi.mock('../sfmcApi.js', () => ({ sfmcFetch: vi.fn() }))
import { landingPageIdsFrom, stateIdFrom, htmlFromContents, fetchLandingPageHtml, fetchCloudPageSource } from '../cloudPagesApi.js'

describe('CloudPage landing page contents (feedback #1063)', () => {
  it('reads entities.html', () => {
    expect(htmlFromContents({ entities: { html: '<p>A</p>' } })).toBe('<p>A</p>')
    expect(htmlFromContents({ entities: [{ html: '<p>B</p>' }] })).toBe('<p>B</p>')
    expect(htmlFromContents({})).toBe('')
  })
  it('finds landing page and state IDs', () => {
    expect(landingPageIdsFrom({ id: 5, meta: { cloudPages: { landingPageId: 137198 } } })).toEqual(['137198'])
    expect(landingPageIdsFrom({ id: 5 }, [{ assetId: 5, landingPageId: 9 }, { assetId: 6, landingPageId: 1 }])).toEqual(['9'])
    expect(stateIdFrom({ currentStateId: 59 })).toBe('59')
    expect(stateIdFrom({ entities: [{ id: 3 }, { id: 59 }, { id: 12 }] })).toBe('59')
    expect(stateIdFrom({ entities: [{ id: 3, status: 'Published' }, { id: 59 }] })).toBe('3')
  })
  it('walks lookup, state and contents, and reports the steps when nothing works', async () => {
    const fetch = vi.fn(async (url) => {
      if (url.includes('landing-pages?$filter=assetId')) return { entities: [{ id: 137198, assetId: 56275 }] }
      if (url.endsWith('landing-pages/137198')) return { id: 137198 }
      if (url.endsWith('landing-pages/137198/states')) return { entities: [{ id: 58 }, { id: 59 }] }
      if (url.includes('/states/59/contents/')) return { entities: { html: '<h1>Router</h1>' } }
      throw new Error('SFMC API error 404')
    })
    const r = await fetchLandingPageHtml('s12', { id: 56275 }, fetch, [])
    expect(r).toMatchObject({ html: '<h1>Router</h1>', landingPageId: '137198', stateId: '59' })
    expect(fetch.mock.calls.at(-1)[0]).toBe('https://cloud-pages.s12.marketingcloudapps.com/fuelapi/internal/v2/cloudpages/landing-pages/137198/states/59/contents/')
    const none = await fetchLandingPageHtml('s12', { id: 1 }, vi.fn(async () => { throw new Error('SFMC API error 404') }), [])
    expect(none.html).toBe('')
    expect(none.steps.join(' ')).toContain('No landing page ID found')
  })
  it('uses it in the View dialog source for a landing page without HTML', async () => {
    const asset = { id: 56275, assetType: { name: 'landingpage', displayName: 'Landing Page' }, meta: { cloudPages: { publishDate: 'x' } } }
    const fetch = vi.fn(async (url) => {
      if (url.includes('/asset/v1/content/assets/56275')) return asset
      if (url.includes('cloudpages/sites')) return { entities: [] }
      if (url.includes('landing-pages?$filter=assetId')) return { entities: [{ id: 137198, assetId: 56275 }] }
      if (url.endsWith('landing-pages/137198')) return { id: 137198, stateId: 59 }
      if (url.includes('/states/59/contents/')) return { entities: { html: '<h1>Router</h1>' } }
      throw new Error('SFMC API error 404')
    })
    const src = await fetchCloudPageSource('s12', { id: 56275 }, fetch)
    expect(src.html).toBe('<h1>Router</h1>')
    expect(src.landingPage).toMatchObject({ id: '137198', stateId: '59' })
  })
})
