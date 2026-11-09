// Content Builder assets whose saves the Toolkit keeps as versions: emails (Saved
// Emails, from Query Saver) and CloudPages (feedback #1045). Same record shape for both;
// the storage key prefix, page and setting differ.

// CloudPages asset types (landing pages, web pages, code resources), as the
// CloudPages search uses them (utils/cloudPagesApi.js).
export const CLOUD_PAGE_ASSET_TYPE_IDS = [240, 241, 242, 243, 244, 245, 247, 248, 249]

// base: a version's page is `${base}/<id>`; list: the list of saved records (feedback #1059).
export const SAVED_ASSET_KINDS = {
  email: {
    kind: 'email', prefix: 'email_', base: '/emails', list: '/emails/saved', noun: 'email', nouns: 'emails', title: 'Saved Emails',
    setting: '_emailSaverEnabled', app: 'Content Builder', appPath: 'Content%20Builder',
    reopen: 'Reload the email in Content Builder to see it.',
  },
  cloudpage: {
    kind: 'cloudpage', prefix: 'cloudpage_', base: '/cloudpages/saved', list: '/cloudpages/saved', noun: 'CloudPage', nouns: 'CloudPages', title: 'Saved CloudPages',
    setting: '_cloudPageSaverEnabled', app: 'CloudPages', appPath: 'CloudPages',
    reopen: 'Reopen it in CloudPages to see it, and publish it again to put it live.',
  },
}

// Session storage key the service worker sets when Chrome refused a save because its
// 10 MB was full (feedback #1086); the Saved Emails and Saved CloudPages pages show it.
// Session storage has its own room, so the notice can be written when local is full.
export const SAVE_FAILED_KEY = '_savedAssetNotKept'

/** 'email' | 'cloudpage' | null for a saved asset (the body SFMC's editor sends). */
export function savedAssetKind(asset) {
  if ((asset?.assetType?.name || '').toLowerCase().includes('email')) return 'email'
  const id = Number(asset?.assetType?.id)
  const name = (asset?.assetType?.name || '').toLowerCase()
  if (CLOUD_PAGE_ASSET_TYPE_IDS.includes(id) || /landingpage|webpage|coderesource/.test(name)) return 'cloudpage'
  return null
}

export const savedAssetKey = (kind, assetId) => `${SAVED_ASSET_KINDS[kind].prefix}${assetId}`
export const isSavedAssetKey = (kind, key) => new RegExp(`^${SAVED_ASSET_KINDS[kind].prefix}\\d+$`).test(String(key || ''))

function pickView(view) {
  if (!view) return null
  return {
    content: view.content || null,
    superContent: view.superContent || null,
    design: view.design || null,
    slots: view.slots || null,
    blocks: view.blocks || null,
  }
}

/** What the email compiler needs from an asset (or a saved version's assetBody). */
export function compileAssetFrom(asset) {
  if (!asset || typeof asset !== 'object') return null
  return {
    superContent: asset.superContent || null,
    content: asset.content || null,
    design: asset.design || null,
    slots: asset.slots || null,
    blocks: asset.blocks || null,
    views: { html: pickView(asset.views?.html) },
  }
}

/** A version's compile input: its own compileAsset (older saves) or one made from its assetBody. */
export const versionCompileAsset = (version) => version?.compileAsset || compileAssetFrom(version?.assetBody)

/** The newest version's compile input for a saved record (for the list cards). */
export const recordCompileAsset = (rec) => rec?.compileAsset || versionCompileAsset(rec?.versions?.[0]) || null

/**
 * A saved record without the copies of its content (feedback #1086). Before 2.0.23 each
 * save kept the content three times: compileAsset on the record, compileAsset on the
 * version and the assetBody the version is reverted from. compileAsset is made from the
 * assetBody when it is needed, so only versions without an assetBody (saved before
 * versions were kept) keep theirs. Returns the same object when nothing changes.
 */
export function slimSavedRecord(rec) {
  if (!rec || typeof rec !== 'object' || !Array.isArray(rec.versions) || !rec.versions.length) return rec
  let changed = false
  const versions = rec.versions.map((v) => {
    if (!v?.compileAsset || !v.assetBody) return v
    changed = true
    const { compileAsset, ...rest } = v
    return rest
  })
  const next = { ...rec, versions }
  if ('compileAsset' in next && versions.some((v) => v?.assetBody || v?.compileAsset)) { delete next.compileAsset; changed = true }
  return changed ? next : rec
}

/**
 * The code of a saved version (feedback #1046): the HTML with slots and blocks filled
 * in, AMPscript and scripts as written (nothing runs). Falls back to the saved body's
 * own content (code resources) and then its HTML view. '' when there is none.
 * @param {object} version  a saved version ({ assetBody }, older ones also compileAsset)
 * @param {(asset, channel) => string} compile  utils/emailCompiler.js compile
 */
export function versionSource(version, compile) {
  const tryCompile = (a) => { try { return a ? compile(a, 'html') || '' : '' } catch { return '' } }
  return tryCompile(versionCompileAsset(version))
    || (typeof version?.assetBody?.content === 'string' ? version.assetBody.content : '')
    || tryCompile(version?.assetBody)
    || ''
}

/** Lines that differ between two texts, as { added, removed } counts (line multiset). */
export function lineChanges(before, after) {
  const count = (t) => { const m = new Map(); for (const l of String(t || '').split('\n')) m.set(l, (m.get(l) || 0) + 1); return m }
  const a = count(before)
  const b = count(after)
  let added = 0
  let removed = 0
  for (const [l, n] of b) added += Math.max(0, n - (a.get(l) || 0))
  for (const [l, n] of a) removed += Math.max(0, n - (b.get(l) || 0))
  return { added, removed }
}
