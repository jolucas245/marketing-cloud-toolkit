// Content > Emails (feedback #1054): browse Content Builder folders, search emails, show
// an email, and preview it with a data extension row. Content Builder's REST asset API
// for folders and emails; SFMC's guide/v1 email preview for the data preview. None of the
// preview calls were checked against a live org when this was written.
import { sfmcFetch } from './sfmcApi.js'
import { compile } from './emailCompiler.js'
import { RESULTS_PAGE_SIZE } from './paging.js'

export const EMAIL_ASSET_TYPE_IDS = [207, 208, 209] // templatebasedemail, htmlemail, textonlyemail
export const EMAIL_PAGE_SIZE = RESULTS_PAGE_SIZE
const CB = (stack) => `https://content-builder.${stack}.marketingcloudapps.com/fuelapi`
const LIST_FIELDS = ['id', 'name', 'customerKey', 'assetType', 'category', 'modifiedDate', 'createdDate', 'status', 'views', 'legacyData', 'data']
const FULL_FIELDS = [...LIST_FIELDS, 'content', 'superContent', 'design', 'slots', 'blocks', 'meta']

// ── Folders ──────────────────────────────────────────────
const folderCache = new Map() // `${stack}:${parentId}` → Promise<folder[]>

export function toFolder(c) {
  return { id: String(c.id), name: c.name || '', parentId: String(c.parentId ?? '0'), type: c.categoryType || '' }
}

/** Child folders of a Content Builder folder ('0' for the top level), by name. */
export function fetchEmailFolders(stack, parentId = '0', fetch = sfmcFetch) {
  const key = `${stack}:${parentId}`
  if (!folderCache.has(key)) {
    const filter = encodeURIComponent(`parentId eq ${Number(parentId) || 0}`)
    const p = fetch(`${CB(stack)}/asset/v1/content/categories?$page=1&$pagesize=500&$filter=${filter}`, 'GET')
      .then((d) => (d?.items || []).map(toFolder).sort((a, b) => a.name.localeCompare(b.name)))
    p.catch(() => folderCache.delete(key))
    folderCache.set(key, p)
  }
  return folderCache.get(key)
}

export function clearEmailCaches() { folderCache.clear() }

// ── Emails ───────────────────────────────────────────────
/** Query body: email assets, optionally in one folder and matching a text. */
export function emailSearchBody({ text = '', folderId = null, page = 1, pageSize = EMAIL_PAGE_SIZE } = {}) {
  let query = { property: 'assetType.id', simpleOperator: 'in', values: EMAIL_ASSET_TYPE_IDS }
  if (folderId != null && folderId !== '') {
    query = { leftOperand: query, logicalOperator: 'AND', rightOperand: { property: 'category.id', simpleOperator: 'equal', value: Number(folderId) } }
  }
  const t = String(text || '').trim()
  if (t) {
    const match = {
      leftOperand: { property: 'name', simpleOperator: 'contains', value: t },
      logicalOperator: 'OR',
      rightOperand: {
        leftOperand: { property: 'views.subjectline.content', simpleOperator: 'contains', value: t },
        logicalOperator: 'OR',
        rightOperand: { property: 'customerKey', simpleOperator: 'equal', value: t },
      },
    }
    query = { leftOperand: query, logicalOperator: 'AND', rightOperand: match }
  }
  return { page: { page, pageSize }, query, sort: [{ property: 'modifiedDate', direction: 'DESC' }], fields: LIST_FIELDS }
}

export const legacyEmailId = (a) => a?.legacyData?.legacyId ?? a?.data?.email?.legacy?.legacyId ?? null

export function toEmailRow(a) {
  return {
    id: a.id,
    name: a.name || '',
    customerKey: a.customerKey || '',
    type: a.assetType?.displayName || a.assetType?.name || '',
    folderId: a.category?.id != null ? String(a.category.id) : '',
    folderName: a.category?.name || '',
    subject: a.views?.subjectline?.content || '',
    modifiedDate: a.modifiedDate || null,
    status: a.status?.name || '',
    legacyId: legacyEmailId(a),
  }
}

export async function searchEmails(stack, opts = {}, fetch = sfmcFetch) {
  const d = await fetch(`${CB(stack)}/asset/v1/content/assets/query`, 'POST', emailSearchBody(opts))
  const items = (d?.items || []).map(toEmailRow)
  return { items, total: d?.count ?? items.length }
}

/** The whole asset, for the preview. */
export function fetchEmailAsset(stack, id, fetch = sfmcFetch) {
  return fetch(`${CB(stack)}/asset/v1/content/assets/${encodeURIComponent(id)}`, 'GET')
}

/** HTML, text and subject of an email asset, with its slots and blocks filled in. */
export function emailParts(asset) {
  const views = asset?.views || {}
  const html = views.html ? (compile(views.html) || views.html.content || '') : (compile(asset) || '')
  return {
    html: typeof html === 'string' ? html : '',
    text: views.text?.content || '',
    subject: views.subjectline?.content || '',
    preheader: views.preheader?.content || '',
  }
}

// ── Preview with data ────────────────────────────────────
/**
 * %%Field%% personalization strings filled from one row (names match regardless of
 * case; brackets allowed: %%[First Name]%%). Other AMPscript is left as written.
 * Returns { html, filled: names used, missing: names with no column }.
 */
export function fillPersonalization(html, row) {
  const values = new Map(Object.entries(row || {}).map(([k, v]) => [k.toLowerCase(), v]))
  const filled = new Set()
  const missing = new Set()
  const out = String(html || '').replace(/%%\[?([A-Za-z0-9_ -]+?)\]?%%/g, (whole, name) => {
    const k = name.trim().toLowerCase()
    if (!values.has(k)) { missing.add(name.trim()); return whole }
    filled.add(name.trim())
    return escapeHtml(values.get(k) ?? '')
  })
  return { html: out, filled: [...filled], missing: [...missing] }
}

function escapeHtml(v) {
  return String(v).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;')
}

/** The guide/v1 preview URLs to try, most specific first. */
export function previewUrls(stack, { legacyId, deId, deKey, subscriberKey, rowNumber }) {
  const base = `${CB(stack)}/guide/v1/emails/${encodeURIComponent(legacyId)}`
  const des = [deId, deKey ? `key:${deKey}` : null].filter(Boolean)
  const urls = []
  for (const de of des) {
    if (subscriberKey) urls.push(`${base}/dataExtension/${encodeURIComponent(de)}/contacts/${encodeURIComponent(subscriberKey)}/preview?kind=html`)
    if (rowNumber) urls.push(`${base}/dataExtension/${encodeURIComponent(de)}/row/${rowNumber}/preview?kind=html`)
  }
  return urls
}

/** The HTML (and subject) in a guide/v1 preview answer, whatever its exact shape. */
export function previewFromResponse(d) {
  const views = d?.message?.views || d?.views || []
  const list = Array.isArray(views) ? views : Object.values(views)
  const pick = (re) => list.find((v) => re.test(String(v?.contentType || v?.type || '')))?.content
  const html = pick(/html/i) ?? (typeof d?.html === 'string' ? d.html : null)
  const subject = pick(/subject/i) ?? null
  return html ? { html, subject } : null
}

/**
 * SFMC renders the email for one row of a data extension (AMPscript and all). Tries the
 * subscriber-key form, then the row-number form, with the DE ID then its key.
 * Returns { html, subject, url } or throws the last error.
 */
export async function previewWithData(stack, args, fetch = sfmcFetch) {
  if (!args.legacyId) throw new Error('This email has no legacy email ID, which the SFMC preview needs.')
  const urls = previewUrls(stack, args)
  if (!urls.length) throw new Error('Pick a row first.')
  let last = null
  for (const url of urls) {
    try {
      const d = await fetch(url, 'POST', {})
      const p = previewFromResponse(d)
      if (p) return { ...p, url }
      last = new Error('SFMC answered without HTML.')
    } catch (e) { last = e }
  }
  throw last
}
