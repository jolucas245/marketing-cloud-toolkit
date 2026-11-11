// Data > Recycle bin (user, 2026-11-10): what was deleted, read only. Restoring is done in
// SFMC (Contact Builder for data extensions, Content Builder for content), so the page
// links there instead of offering a Restore button.
// - Data extensions: Contact Builder's Recycle Bin folder (legacy folder API, allowed type
//   'recyclebin'), then its DEs from data-internal customobjects/category/<id>, as Contact
//   Builder's own Recycle Bin reads them (both checked live on s10 that day).
// - Content Builder: asset query with status.id = 6 (deleted), ?scope=ours as Content
//   Builder's Recycle Bin asks (8 items on s10; without the scope 10, shared items too).
//   SFMC exposes no deletion date for content: modifiedDate is the last change before.
import { sfmcFetch } from './sfmcApi.js'
import { coreOrigin } from './sfmcHosts.js'

const CM = (stack) => `https://mc.${stack}.marketingcloudapps.com/contactsmeta/fuelapi`
const CB = (stack) => `https://content-builder.${stack}.marketingcloudapps.com/fuelapi`
const PAGE = 50
const MAX_PAGES = 40 // 2,000 items, more than a recycle bin holds in practice
const DAY = 24 * 60 * 60 * 1000
export const RECOVERABLE_DAYS = 30

// ── Links into SFMC (restore happens there) ───────────────
export const contactBuilderRecycleUrl = (stack) => `https://mc.${stack}.marketingcloudapps.com/contactsmeta/admin.html#admin/data-extensions`
export const contentBuilderUrl = (stack) => `${coreOrigin(stack)}/cloud/#app/Content%20Builder`

// ── Data extensions ──────────────────────────────────────
const binFolderCache = new Map() // stack → Promise<folder id>

/** Id of the stack's Contact Builder Recycle Bin folder. */
export function fetchRecycleBinFolderId(stack, fetch = sfmcFetch) {
  if (!binFolderCache.has(stack)) {
    const where = encodeURIComponent("allowedtypes in ('recyclebin')")
    const p = fetch(`${CM(stack)}/legacy/v1/beta/folder?$where=${where}`, 'GET').then((d) => {
      const list = d?.entry || d?.items || []
      const bin = list.find((f) => String(f?.type || '').toLowerCase() === 'recyclebin') || list[0]
      if (!bin?.id) throw new Error('SFMC did not return a Recycle Bin folder for this business unit.')
      return String(bin.id)
    })
    p.catch(() => binFolderCache.delete(stack))
    binFolderCache.set(stack, p)
  }
  return binFolderCache.get(stack)
}
export function clearRecycleBinCache() { binFolderCache.clear() }

/** Days left to restore an item deleted at `deletedAt` (30 days after deletion, never below 0). */
export function recoverableDays(deletedAt, now = Date.now()) {
  const t = new Date(deletedAt).getTime()
  if (!deletedAt || Number.isNaN(t)) return null
  return Math.max(0, Math.ceil(RECOVERABLE_DAYS - (now - t) / DAY))
}
export function recoverableText(days) {
  if (days == null) return ''
  return days === 0 ? 'Less than a day or expired' : `${days} ${days === 1 ? 'day' : 'days'}`
}

/** One deleted DE as the page shows it. modifiedDate is when it went to the bin. */
export function toDeletedDE(item, now = Date.now()) {
  const days = recoverableDays(item.modifiedDate, now)
  return {
    id: String(item.id ?? ''),
    name: item.name || '',
    key: item.key || item.customerKey || '',
    description: item.description || '',
    originalPath: String(item.categoryFullPathForRecyclebin || '').replace(/\\/g, ' > '),
    restoreFolderId: item.categoryIDForRestoringDE ?? null,
    deletedDate: item.modifiedDate || '',
    deletedBy: item.modifiedByName || '',
    createdDate: item.createdDate || '',
    createdBy: item.createdByName || '',
    owner: item.ownerName || '',
    rowCount: item.rowCount ?? null,
    fieldCount: item.fieldCount ?? null,
    sendable: !!item.isSendable,
    testable: !!item.isTestable,
    recoverableDays: days,
  }
}

/** Every DE in the Recycle Bin, newest deletion first: { count, items }. */
export async function fetchDeletedDEs(stack, { fetch = sfmcFetch, now = Date.now() } = {}) {
  const folderId = await fetchRecycleBinFolderId(stack, fetch)
  const out = []
  let count = 0
  for (let page = 1; page <= MAX_PAGES; page++) {
    const d = await fetch(`${CM(stack)}/data-internal/v1/customobjects/category/${encodeURIComponent(folderId)}?retrievalType=1&$page=${page}&$pagesize=${PAGE}&$orderBy=modifiedDate%20DESC`, 'GET')
    const items = d?.items || []
    count = Number(d?.count ?? 0) || count
    out.push(...items)
    if (items.length < PAGE || (count && out.length >= count)) break
  }
  return { folderId, count: Math.max(count, out.length), items: out.map((i) => toDeletedDE(i, now)) }
}

// ── Content Builder ──────────────────────────────────────
const EMAIL_TYPES = new Set(['htmlemail', 'templatebasedemail', 'textonlyemail'])
export const CONTENT_TYPE_GROUPS = [
  { id: 'all', label: 'All' },
  { id: 'emails', label: 'Emails' },
  { id: 'files', label: 'Images and files' },
  { id: 'blocks', label: 'Blocks' },
  { id: 'other', label: 'Other' },
]

/**
 * Group of an asset type. Emails by name (ids 207 to 209); blocks by a name ending in
 * "block"; images, documents, audio and video are the media types with ids below 195 in
 * SFMC's asset type list. Everything else (templates, web pages, messages) is Other.
 */
export function contentTypeGroup(assetType = {}) {
  const name = String(assetType?.name || '').toLowerCase()
  const id = Number(assetType?.id)
  if (EMAIL_TYPES.has(name) || [207, 208, 209].includes(id)) return 'emails'
  if (name.endsWith('block')) return 'blocks'
  if (id > 0 && id < 195) return 'files'
  if (/^(image|document|audio|video|png|jpe?g|gif|pdf|svg)$/.test(name)) return 'files'
  return 'other'
}

export const CONTENT_FIELDS = ['id', 'customerKey', 'name', 'assetType', 'category', 'status', 'createdDate', 'createdBy', 'modifiedDate', 'modifiedBy', 'owner']
export function deletedContentBody(page = 1, pageSize = PAGE) {
  return {
    page: { page, pageSize },
    sort: [{ property: 'modifiedDate', direction: 'desc' }],
    query: { property: 'status.id', simpleOperator: 'equals', value: 6 },
    fields: CONTENT_FIELDS,
  }
}

export function toDeletedContent(a) {
  const type = a.assetType || {}
  return {
    id: String(a.id ?? ''),
    name: a.name || '',
    key: a.customerKey || '',
    typeName: type.name || '',
    type: type.displayName || type.name || '',
    group: contentTypeGroup(type),
    folder: a.category?.name || '',
    folderId: a.category?.id ?? null,
    createdDate: a.createdDate || '',
    createdBy: a.createdBy?.name || '',
    modifiedDate: a.modifiedDate || '',
    modifiedBy: a.modifiedBy?.name || '',
    owner: a.owner?.name || '',
  }
}

/** Deleted Content Builder items: ours only (as Content Builder shows), or shared ones too. */
export async function fetchDeletedContent(stack, { includeShared = false, fetch = sfmcFetch } = {}) {
  const url = `${CB(stack)}/asset/v1/content/assets/query${includeShared ? '' : '?scope=ours'}`
  const out = []
  let count = 0
  for (let page = 1; page <= MAX_PAGES; page++) {
    const d = await fetch(url, 'POST', deletedContentBody(page))
    const items = d?.items || []
    count = Number(d?.count ?? 0) || count
    out.push(...items)
    if (items.length < PAGE || (count && out.length >= count)) break
  }
  return { count: Math.max(count, out.length), items: out.map(toDeletedContent) }
}

/** Rows of a group whose name, key, type or folder contain the text. */
export function filterContent(items, { group = 'all', text = '' } = {}) {
  const t = text.trim().toLowerCase()
  return items.filter((i) => (group === 'all' || i.group === group)
    && (!t || [i.name, i.key, i.type, i.folder].some((v) => String(v).toLowerCase().includes(t))))
}
export function groupCounts(items) {
  const out = { all: items.length, emails: 0, files: 0, blocks: 0, other: 0 }
  for (const i of items) out[i.group] = (out[i.group] || 0) + 1
  return out
}
