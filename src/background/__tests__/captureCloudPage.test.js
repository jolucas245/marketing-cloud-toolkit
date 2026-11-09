import { describe, it, expect, beforeEach, vi } from 'vitest'

// Feedback #1045: CloudPage saves are kept as versions like emails, under cloudpage_<id>.
const store = {}
globalThis.chrome = {
  storage: {
    local: {
      get: (keys, cb) => { const ks = keys == null ? Object.keys(store) : [].concat(keys); const out = Object.fromEntries(ks.filter((k) => k in store).map((k) => [k, store[k]])); cb ? setTimeout(() => cb(out)) : null; return Promise.resolve(out) },
      set: (obj, cb) => { Object.assign(store, obj); cb ? setTimeout(cb) : null; return Promise.resolve() },
      remove: (k, cb) => { [].concat(k).forEach((x) => delete store[x]); cb ? setTimeout(cb) : null; return Promise.resolve() },
      getBytesInUse: (k, cb) => { cb ? cb(0) : null; return Promise.resolve(0) },
    },
    managed: { get: (k, cb) => { cb ? cb({}) : null; return Promise.resolve({}) } },
    session: { get: (k, cb) => { cb ? cb({}) : null; return Promise.resolve({}) }, set: (o, cb) => { cb?.(); return Promise.resolve() } },
  },
  action: { setIcon: vi.fn() },
  runtime: { lastError: null },
}
const { captureEmail, applyEmailSaverPrefs } = await import('../capture.js')

const put = (url, body) => ({ method: 'PUT', url, requestBody: { raw: [{ bytes: new TextEncoder().encode(JSON.stringify(body)).buffer }] } })
const page = (n) => ({ id: 77, name: 'Spring landing', assetType: { id: 247, name: 'landingpage' }, content: `<p>v${n}</p>`, views: { html: { content: `<p>v${n}</p>` } }, thumbnail: { x: 1 } })

describe('CloudPage versions (feedback #1045)', () => {
  beforeEach(() => { for (const k of Object.keys(store)) delete store[k]; applyEmailSaverPrefs({ _emailSaverEnabled: true, _emailSaveDebounce: 0, _cloudPageSaverEnabled: true }) })

  it('keeps each save of a CloudPage under cloudpage_<id>, with where it was saved', async () => {
    await captureEmail(put('https://cloud-pages.s7.marketingcloudapps.com/fuelapi/asset/v1/content/assets/77', page(1)))
    await captureEmail(put('https://cloud-pages.s7.marketingcloudapps.com/fuelapi/asset/v1/content/assets/77', page(2)))
    const rec = store.cloudpage_77
    expect(rec.kind).toBe('cloudpage')
    expect(rec.versions).toHaveLength(2)
    expect(rec.versions[0]).toMatchObject({ stack: 's7', saveOrigin: 'https://cloud-pages.s7.marketingcloudapps.com' })
    expect(rec.versions[0].assetBody.content).toBe('<p>v2</p>')
    expect(rec.versions[0].assetBody.thumbnail).toBeUndefined()
    expect(store.email_77).toBeUndefined()
  })

  it('emails still go to email_<id>; each setting turns only its own kind off', async () => {
    applyEmailSaverPrefs({ _cloudPageSaverEnabled: false })
    await captureEmail(put('https://cloud-pages.s7.marketingcloudapps.com/fuelapi/asset/v1/content/assets/77', page(1)))
    await captureEmail(put('https://content-builder.s7.marketingcloudapps.com/fuelapi/asset/v1/content/assets/5', { id: 5, name: 'News', assetType: { id: 207, name: 'templatebasedemail' }, views: { html: { content: 'x' } } }))
    expect(store.cloudpage_77).toBeUndefined()
    expect(store.email_5.kind).toBe('email')
  })

  it('ignores other asset types', async () => {
    await captureEmail(put('https://content-builder.s7.marketingcloudapps.com/fuelapi/asset/v1/content/assets/9', { id: 9, assetType: { id: 28, name: 'jpg' } }))
    expect(Object.keys(store).filter((k) => /_9$/.test(k))).toEqual([])
  })
})

describe('one copy per save, and saves Chrome refuses (feedback #1086)', () => {
  beforeEach(() => { for (const k of Object.keys(store)) delete store[k]; applyEmailSaverPrefs({ _emailSaverEnabled: true, _emailSaveDebounce: 0, _cloudPageSaverEnabled: true }) })
  const email = (n) => ({ id: 5, name: 'News', assetType: { id: 207, name: 'templatebasedemail' }, views: { html: { content: `<p>v${n}</p>` } } })
  const url = 'https://content-builder.s7.marketingcloudapps.com/fuelapi/asset/v1/content/assets/5'

  it('keeps the content only in assetBody and slims older versions', async () => {
    store.email_5 = { id: 'email_5', compileAsset: { content: 'old' }, versions: [{ versionId: 'v_1', savedAt: 1, compileAsset: { content: 'old' }, assetBody: email(0) }] }
    await captureEmail(put(url, email(1)))
    const rec = store.email_5
    expect(rec.compileAsset).toBeUndefined()
    expect(rec.versions).toHaveLength(2)
    expect(rec.versions.every((v) => !('compileAsset' in v) && v.assetBody)).toBe(true)
  })

  it('records a notice in session storage when Chrome refuses the write', async () => {
    const session = {}
    const local = chrome.storage.local.set
    const sessionApi = chrome.storage.session
    chrome.storage.session = { ...sessionApi, set: (o, cb) => { Object.assign(session, o); cb?.(); return Promise.resolve() }, remove: (k, cb) => { delete session[k]; cb?.() } }
    chrome.storage.local.set = (obj, cb) => { chrome.runtime.lastError = { message: 'QUOTA_BYTES quota exceeded' }; cb?.(); chrome.runtime.lastError = null }
    try {
      await captureEmail(put(url, email(2)))
      expect(store.email_5).toBeUndefined()
      expect(session._savedAssetNotKept).toMatchObject({ kind: 'email', key: 'email_5', name: 'News', error: 'QUOTA_BYTES quota exceeded' })
      chrome.storage.local.set = local
      await captureEmail(put(url, email(3)))
      expect(store.email_5.versions).toHaveLength(1)
      expect(session._savedAssetNotKept).toBeUndefined()
    } finally {
      chrome.storage.local.set = local
      chrome.storage.session = sessionApi
    }
  })
})
