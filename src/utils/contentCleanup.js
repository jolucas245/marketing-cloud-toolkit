// Content > Clean-up report (API idea 18, from Mathes, 2026-11-11). Read only: it lists
// what could be cleaned up in Content Builder and links there; nothing is deleted or
// moved from the Toolkit.
//
// One Content Builder asset query over every asset type (advanced query
// asset/v1/content/assets/query, the call recycleBin.js and changes.js use), 250 a page
// with a few fields, up to MAX_ASSETS. Everything else is worked out here over what was
// read:
//   - counts and total file size by asset type;
//   - the largest images and files by fileProperties.fileSize (sorting or filtering on
//     that sub-property in the query body is not documented, so it is not asked of SFMC);
//   - templates and content blocks not modified in N months;
//   - same-name duplicates (same name and same kind of asset) and names ending in "copy".
// Not checked against a live org: the match-all query (id greaterThan 0), page size 250
// with these fields, the fileProperties field names (fileSize, extension, width, height,
// publishedURL) and whether deleted items (status 6) come back without a status filter
// (they are dropped here if they do).
//
// "Unused" is never claimed. The only usage hint is for content blocks, from the Where
// used saved Content Builder data (blockUsage below): emails, templates, blocks and
// CloudPages that name the block in AMPscript or place it in a slot. Images, files and
// templates have no such index.
import { sfmcFetch } from './sfmcApi.js'
import { ASSET_GROUPS } from './usage/sources.js'
import { allContentBlockRefs, assetText, norm } from './usage/match.js'
import { contentTypeGroup } from './recycleBin.js'

const CB = (stack) => `https://content-builder.${stack}.marketingcloudapps.com/fuelapi`
export const CLEANUP_PAGE_SIZE = 250
export const MAX_ASSETS = 10000
export const STALE_MONTHS = [6, 12, 18, 24, 36]
export const DEFAULT_STALE_MONTHS = 12
export const LARGEST_LIMIT = 100
const FIELDS = ['id', 'customerKey', 'name', 'assetType', 'category', 'status', 'createdDate', 'modifiedDate', 'modifiedBy', 'fileProperties', 'data']

export const KIND_LABELS = { email: 'Email', template: 'Template', block: 'Content block', cloudpage: 'CloudPage', file: 'Image or file', other: 'Other' }

/** Asset query body: every asset, oldest id first so pages stay stable while reading. */
export function cleanupQueryBody(page = 1, pageSize = CLEANUP_PAGE_SIZE) {
  return {
    page: { page, pageSize },
    query: { property: 'id', simpleOperator: 'greaterThan', value: 0 },
    sort: [{ property: 'id', direction: 'ASC' }],
    fields: FIELDS,
  }
}

/** The kind of an asset for this report: email, template, block, cloudpage, file or other. */
export function assetKind(assetType = {}) {
  const id = Number(assetType?.id)
  const g = Object.keys(ASSET_GROUPS).find((k) => ASSET_GROUPS[k].includes(id))
  if (g) return g
  return contentTypeGroup(assetType) === 'files' ? 'file' : 'other'
}

const num = (v) => { const n = Number(v); return Number.isFinite(n) && n >= 0 ? n : null }
const safeUrl = (v) => (/^https:\/\//i.test(String(v || '')) ? String(v) : '')

/** One asset as the report keeps it (no content, so 10,000 of them stay small). */
export function toCleanupAsset(a) {
  const t = a?.assetType || {}
  const fp = a?.fileProperties || {}
  const status = a?.status || {}
  return {
    id: String(a?.id ?? ''),
    name: a?.name || '',
    key: a?.customerKey || '',
    typeId: t.id ?? null,
    typeName: t.name || '',
    type: t.displayName || t.name || 'Asset',
    kind: assetKind(t),
    folder: a?.category?.name || '',
    folderId: a?.category?.id ?? null,
    createdDate: a?.createdDate || '',
    modifiedDate: a?.modifiedDate || '',
    modifiedBy: a?.modifiedBy?.name || (typeof a?.modifiedBy === 'string' ? a.modifiedBy : ''),
    size: num(fp.fileSize ?? fp.size),
    extension: fp.extension || '',
    width: num(fp.width),
    height: num(fp.height),
    fileUrl: safeUrl(fp.publishedURL || fp.publishedUrl),
    legacyId: a?.data?.email?.legacy?.legacyId ?? a?.legacyData?.legacyId ?? null,
    deleted: Number(status.id) === 6 || String(status.name || '').toLowerCase() === 'deleted',
  }
}

export class CleanupStopped extends Error {
  constructor() { super('Stopped.'); this.stopped = true }
}

/**
 * Every Content Builder asset, 250 a page up to `max`. onProgress(read, total).
 * @returns {Promise<{ items, total, capped, stopped }>}
 */
export async function fetchCleanupAssets(stack, { fetch = sfmcFetch, onProgress = () => {}, shouldStop = () => false, max = MAX_ASSETS, pageSize = CLEANUP_PAGE_SIZE } = {}) {
  const url = `${CB(stack)}/asset/v1/content/assets/query`
  const out = []
  let total = 0
  const pages = Math.ceil(max / pageSize)
  let stopped = false
  for (let page = 1; page <= pages; page++) {
    if (shouldStop()) { stopped = true; break }
    const d = await fetch(url, 'POST', cleanupQueryBody(page, pageSize))
    const items = d?.items || []
    total = Number(d?.count ?? 0) || Math.max(total, out.length + items.length)
    out.push(...items.map(toCleanupAsset))
    onProgress(out.length, total)
    if (items.length < pageSize || out.length >= total) break
  }
  const items = out.filter((a) => !a.deleted)
  return { items, total: Math.max(total, out.length), capped: out.length < total, stopped }
}

// ── Report parts (pure) ───────────────────────────────────
/** Counts and bytes by asset type, most first: [{ type, typeId, kind, count, size }]. */
export function countByType(items) {
  const m = new Map()
  for (const a of items) {
    const k = `${a.typeId ?? ''}|${a.type}`
    const e = m.get(k) || { type: a.type, typeId: a.typeId, kind: a.kind, count: 0, size: 0 }
    e.count++
    e.size += a.size || 0
    m.set(k, e)
  }
  return [...m.values()].sort((x, y) => y.count - x.count || x.type.localeCompare(y.type))
}

/** Counts by kind (email, template, block, ...) with an `all`. */
export function countByKind(items) {
  const out = { all: items.length }
  for (const k of Object.keys(KIND_LABELS)) out[k] = 0
  for (const a of items) out[a.kind] = (out[a.kind] || 0) + 1
  return out
}

/** Images and files with a known size, largest first. */
export function largestFiles(items, limit = LARGEST_LIMIT) {
  return items.filter((a) => a.size != null && (a.kind === 'file' || a.size > 0) && a.kind !== 'email' && a.kind !== 'template')
    .sort((x, y) => y.size - x.size).slice(0, limit)
}

/** The date `months` calendar months before `now`. */
export function monthsAgo(months, now = new Date()) {
  const d = new Date(now.getTime())
  d.setMonth(d.getMonth() - Number(months))
  return d
}

/**
 * Templates and content blocks last modified before the cutoff, oldest first. An item
 * with no modified date is left out (nothing to judge by).
 */
export function staleItems(items, months = DEFAULT_STALE_MONTHS, now = new Date()) {
  const cut = monthsAgo(months, now).getTime()
  return items.filter((a) => (a.kind === 'template' || a.kind === 'block'))
    .map((a) => ({ a, t: Date.parse(a.modifiedDate || '') }))
    .filter(({ t }) => !Number.isNaN(t) && t < cut)
    .sort((x, y) => x.t - y.t)
    .map(({ a }) => a)
}

/** True for a name ending in "copy" as Content Builder and people make them: "X copy", "X - Copy", "X (copy)", "X copy 2", "X_copy(1)". Also "Copy of X". */
export function isCopyName(name) {
  const s = String(name || '').trim()
  return /(^|[\s_.(-])copy\)?(?:[\s_-]*\(?\d+\)?)?$/i.test(s) || /^copy of\s/i.test(s)
}

/**
 * Same-name groups: two or more assets of the same kind whose names match (case and
 * outer spaces ignored). Largest group first.
 * @returns {{ name, kind, items }[]}
 */
export function duplicateGroups(items) {
  const m = new Map()
  for (const a of items) {
    const n = norm(a.name)
    if (!n) continue
    const k = `${a.kind}|${n}`
    const g = m.get(k) || { name: a.name, kind: a.kind, items: [] }
    g.items.push(a)
    m.set(k, g)
  }
  return [...m.values()].filter((g) => g.items.length > 1)
    .sort((x, y) => y.items.length - x.items.length || x.name.localeCompare(y.name))
}

export const copyNamed = (items) => items.filter((a) => isCopyName(a.name))

/** IDs of blocks placed in an asset's slots or blocks (same rule as assetPlacesBlock). */
function placedIds(asset) {
  const out = new Set()
  const walk = (v, depth) => {
    if (depth > 12 || !v || typeof v !== 'object') return
    if (!Array.isArray(v) && v.id != null && (v.assetType || v.content != null)) out.add(String(v.id))
    for (const x of Object.values(v)) walk(x, depth + 1)
  }
  walk(asset?.slots, 0)
  walk(asset?.blocks, 0)
  return out
}

/**
 * How many other assets in the Where used Content Builder data use each block, by
 * ContentBlockByKey/ID/Name in their text or by sitting in a slot. Built once over the
 * saved assets, then looked up per block.
 * @param blocks report rows ({ id, key, name })
 * @param savedAssets the Where used `assets` source items (with content)
 * @returns {Map<string, number>} block id → users (0 when none were found in that data)
 */
export function blockUsage(blocks, savedAssets) {
  const byKey = new Map()
  const byId = new Map()
  const byName = new Map()
  const add = (map, k, id) => { if (!k) return; const s = map.get(k) || new Set(); s.add(id); map.set(k, s) }
  for (const a of savedAssets || []) {
    const id = String(a.id)
    const refs = allContentBlockRefs(assetText(a))
    for (const k of refs.keys) add(byKey, k, id)
    for (const k of refs.ids) add(byId, k, id)
    for (const k of refs.names) add(byName, k, id)
    for (const k of placedIds(a)) add(byId, k, id)
  }
  const out = new Map()
  for (const b of blocks) {
    const users = new Set([...(byKey.get(norm(b.key)) || []), ...(byId.get(String(b.id)) || []), ...(byName.get(norm(b.name)) || [])])
    users.delete(String(b.id))
    out.set(String(b.id), users.size)
  }
  return out
}

/** Bytes as text: 1.2 MB, 340 KB, 12 B. */
export function formatBytes(n) {
  if (n == null || !Number.isFinite(Number(n))) return ''
  const v = Number(n)
  if (v >= 1024 * 1024 * 1024) return `${(v / 1024 ** 3).toFixed(1)} GB`
  if (v >= 1024 * 1024) return `${(v / 1024 ** 2).toFixed(1)} MB`
  if (v >= 1024) return `${Math.round(v / 1024)} KB`
  return `${v} B`
}

/** Where used target for an email or content block row (null for other kinds). */
export function usageTarget(a) {
  if (a.kind !== 'email' && a.kind !== 'block') return null
  return { kind: a.kind, asset: { id: a.id, name: a.name, customerKey: a.key, assetType: { id: a.typeId, name: a.typeName }, category: { id: a.folderId, name: a.folder }, modifiedDate: a.modifiedDate, legacyId: a.legacyId } }
}
