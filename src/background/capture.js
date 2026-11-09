// Saving records: queries run in Query Studio, emails saved in Content Builder, and
// records sent by the app pages (Add query, rename, shared-query import).
//
// Storage keys and shapes are SFMC Query Saver's (`sql_<ts>`, `email_<assetId>`), so
// a Query Saver backup imports unchanged.

import { getPolicy } from './policy.js'
import { makeRoom, EMAIL_MAX_VERSIONS } from './storageRoom.js'
import { storageGet, storageSet, storageSetChecked, storageRemove, delay } from './chromeAsync.js'
import { resolveStack } from './stack.js'
import { fetchCurrentBusinessUnit } from './businessUnit.js'
import { QUERY_STUDIO_SETTING, isQueryStudioUrl } from '../utils/queryStudio.js'
import { savedAssetKind, savedAssetKey, slimSavedRecord, SAVE_FAILED_KEY } from '../utils/savedAssets.js'

const decoder = new TextDecoder('utf-8')

async function blinkIcon() {
  try {
    chrome.action.setIcon({ path: '/images/icon48x48-off.png' })
    await delay(5000)
    chrome.action.setIcon({ path: '/images/icon48x48.png' })
  } catch { /* no action API in tests */ }
}

export async function saveRecords(records) {
  blinkIcon()
  await storageSet('local', records)
}

export async function renameQuery(id, name) {
  const rec = (await storageGet('local', id))[id]
  if (rec) await storageSet('local', { [id]: { ...rec, name } })
}

// Adds { name, accountId } of the current business unit to a saved query, after it
// is saved, so a failed lookup never loses the query.
export async function tagBusinessUnit(id) {
  try {
    const { stack } = await resolveStack()
    if (!stack) return
    const bu = await fetchCurrentBusinessUnit(stack)
    if (!bu) return
    const rec = (await storageGet('local', id))[id]
    if (!rec || rec.businessUnit?.name) return
    await storageSet('local', { [id]: { ...rec, businessUnit: { ...(rec.businessUnit || {}), ...bu } } })
  } catch (e) {
    console.warn('[Toolkit:SW] Could not tag the business unit:', e?.message)
  }
}

// webRequest.onBeforeRequest for POST /query/create in Query Studio 1 and 2
// (QUERY_STUDIO_CREATE_URLS in utils/queryStudio.js)
export async function captureQueryStudio(details) {
  if (details.method !== 'POST' || !details.requestBody?.raw?.[0]?.bytes || !isQueryStudioUrl(details.url)) return
  if ((await getPolicy()).disableHistory) return
  // Off unless the user turned it on (Settings > Running queries).
  if ((await storageGet('local', [QUERY_STUDIO_SETTING]))[QUERY_STUDIO_SETTING] === false) return
  let queryText
  try {
    queryText = JSON.parse(decoder.decode(new Uint8Array(details.requestBody.raw[0].bytes))).querytext
  } catch {
    return
  }
  if (!queryText) return
  const ts = details.timeStamp
  const id = 'sql_' + ts
  await saveRecords({
    [id]: {
      id,
      queryText,
      timeStamp: ts,
      url: details.url,
      name: new Date(ts).toDateString() + ' ' + new Date(ts).toLocaleTimeString(),
      isFavourite: false,
    },
  })
  await tagBusinessUnit(id)
}

// ── Content Builder email versions ─────────────────────────
// Saved Emails: on unless the user turns it off (feedback #1021: on by default; an admin policy can still turn it off).
export const emailSaver = { enabled: true, debounceMs: 5000 }
// Saved CloudPages (feedback #1045): same capture, on unless turned off.
export const cloudPageSaver = { enabled: true }
const lastSavedAt = {}

export async function loadEmailSaverPrefs() {
  const prefs = await storageGet('local', ['_emailSaverEnabled', '_emailSaveDebounce', '_cloudPageSaverEnabled'])
  applyEmailSaverPrefs(prefs)
}

export function applyEmailSaverPrefs(prefs) {
  if ('_emailSaverEnabled' in prefs) emailSaver.enabled = prefs._emailSaverEnabled !== false
  if ('_cloudPageSaverEnabled' in prefs) cloudPageSaver.enabled = prefs._cloudPageSaverEnabled !== false
  if ('_emailSaveDebounce' in prefs) {
    const s = prefs._emailSaveDebounce
    emailSaver.debounceMs = typeof s === 'number' && s >= 0 ? s * 1000 : 5000
  }
}

// webRequest.onBeforeRequest for https://*.marketingcloudapps.com/fuelapi/asset/v1/content/assets/*
// Emails (Content Builder) and, since feedback #1045, CloudPages assets. The CloudPages
// editor is assumed to save through the same asset API (not yet seen live).
export async function captureEmail(details) {
  if (details.method !== 'PUT') return
  if ((await getPolicy()).disableHistory) return
  if (!details.requestBody?.raw?.[0]?.bytes) return
  let jsonStr, asset
  try {
    jsonStr = decoder.decode(new Uint8Array(details.requestBody.raw[0].bytes))
    asset = JSON.parse(jsonStr)
  } catch {
    return
  }
  const kind = savedAssetKind(asset)
  if (!kind || (kind === 'email' && !emailSaver.enabled) || (kind === 'cloudpage' && !cloudPageSaver.enabled)) return

  const assetId = asset.id || Number(details.url.split('/').pop())
  const now = Date.now()
  if (emailSaver.debounceMs > 0 && now - (lastSavedAt[assetId] || 0) < emailSaver.debounceMs) return
  lastSavedAt[assetId] = now

  const key = savedAssetKey(kind, assetId)
  const stack = details.url.match(/(?:content-builder|cloud-pages)\.([^.]+)\.marketingcloudapps\.com/)?.[1] || null
  // Where the editor saved it: Restore puts the version back through the same app.
  const saveOrigin = (() => { try { return new URL(details.url).origin } catch { return null } })()
  // What a revert PUTs back: the asset as saved, minus the thumbnail and other views.
  // The content is kept only here: the preview's compile input is made from it when
  // needed (savedAssets.js versionCompileAsset; feedback #1086).
  const assetBody = JSON.parse(jsonStr)
  if (assetBody.views) {
    assetBody.views = {
      ...(asset.views.subjectline ? { subjectline: asset.views.subjectline } : {}),
      ...(asset.views.preheader ? { preheader: asset.views.preheader } : {}),
      ...(asset.views.html ? { html: asset.views.html } : {}),
    }
  }
  delete assetBody.thumbnail

  const subject = asset.views?.subjectline?.content || ''
  const version = {
    versionId: `v_${now}`,
    savedAt: now,
    subject,
    name: asset.name || `Email ${assetId}`,
    status: asset.status?.name || 'Draft',
    categoryName: asset.category?.name || '',
    assetBody,
    stack,
    saveOrigin,
  }
  await makeRoom(JSON.stringify(version).length)
  const prev = (await storageGet('local', key))[key]
  const record = {
    id: key,
    assetId: Number(assetId),
    customerKey: asset.customerKey || '',
    name: asset.name || `${kind === 'email' ? 'Email' : 'CloudPage'} ${assetId}`,
    kind,
    assetTypeName: asset.assetType?.name || '',
    assetTypeDisplayName: asset.assetType?.displayName || '',
    status: asset.status?.name || 'Draft',
    categoryId: asset.category?.id || null,
    categoryName: asset.category?.name || '',
    subject,
    ownerName: asset.owner?.name || '',
    ownerEmail: asset.owner?.email || '',
    memberId: asset.memberId || null,
    enterpriseId: asset.enterpriseId || null,
    createdDate: asset.createdDate || null,
    modifiedDate: asset.modifiedDate || null,
    isFavourite: prev?.isFavourite || false,
    timeStamp: prev?.timeStamp || now,
    versions: [version, ...(Array.isArray(prev?.versions) ? prev.versions : [])].slice(0, EMAIL_MAX_VERSIONS),
  }
  // Older saves of this asset may still carry copies of their content: drop them too.
  const slim = slimSavedRecord(record)
  blinkIcon()
  // Chrome refuses the write when its 10 MB is full and only says so in lastError
  // (feedback #1086: saves stopped without a word). Say it on the Saved page instead.
  const error = await storageSetChecked('local', { [key]: slim })
  if (error) {
    console.warn(`[Toolkit:SW] Could not keep the save of "${record.name}": ${error}`)
    await storageSet('session', { [SAVE_FAILED_KEY]: { kind, key, name: record.name, at: now, error } })
  } else {
    await storageRemove('session', SAVE_FAILED_KEY)
  }
}
