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

/**
 * The code of a saved version (feedback #1046): the HTML with slots and blocks filled
 * in, AMPscript and scripts as written (nothing runs). Falls back to the saved body's
 * own content (code resources) and then its HTML view. '' when there is none.
 * @param {object} version  a saved version ({ compileAsset, assetBody })
 * @param {(asset, channel) => string} compile  utils/emailCompiler.js compile
 */
export function versionSource(version, compile) {
  const tryCompile = (a) => { try { return a ? compile(a, 'html') || '' : '' } catch { return '' } }
  return tryCompile(version?.compileAsset)
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
