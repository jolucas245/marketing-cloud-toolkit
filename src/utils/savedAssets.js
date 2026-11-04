// Content Builder assets whose saves the Toolkit keeps as versions: emails (Saved
// Emails, from Query Saver) and CloudPages (feedback #1045). Same record shape for both;
// the storage key prefix, page and setting differ.

// CloudPages asset types (landing pages, web pages, code resources), as the
// CloudPages search uses them (utils/cloudPagesApi.js).
export const CLOUD_PAGE_ASSET_TYPE_IDS = [240, 241, 242, 243, 244, 245, 247, 248, 249]

export const SAVED_ASSET_KINDS = {
  email: {
    kind: 'email', prefix: 'email_', base: '/emails', noun: 'email', nouns: 'emails', title: 'Saved Emails',
    setting: '_emailSaverEnabled', app: 'Content Builder', appPath: 'Content%20Builder',
    reopen: 'Reload the email in Content Builder to see it.',
  },
  cloudpage: {
    kind: 'cloudpage', prefix: 'cloudpage_', base: '/cloudpages/saved', noun: 'CloudPage', nouns: 'CloudPages', title: 'Saved CloudPages',
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
