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

/**
 * Child folders of a Content Builder folder ('0' for the top level), by name. With a
 * categoryType (cloudpages, feedback #1059) only folders of that type, as SFMC's own
 * CloudPages folder calls ask (not checked live for the top level).
 */
export function fetchContentFolders(stack, parentId = '0', { categoryType = '', fetch = sfmcFetch } = {}) {
  const key = `${stack}:${categoryType}:${parentId}`
  if (!folderCache.has(key)) {
    const filter = encodeURIComponent(`parentId eq ${Number(parentId) || 0}`)
    const type = categoryType ? `&categoryType=${encodeURIComponent(categoryType)}` : ''
    const p = fetch(`${CB(stack)}/asset/v1/content/categories?$page=1&$pagesize=500&$filter=${filter}${type}`, 'GET')
      .then((d) => (d?.items || []).map(toFolder).sort((a, b) => a.name.localeCompare(b.name)))
    p.catch(() => folderCache.delete(key))
    folderCache.set(key, p)
  }
  return folderCache.get(key)
}

export function clearEmailCaches() { folderCache.clear() }

/** Email folders (any type, as Content Builder shows them). */
export const fetchEmailFolders = (stack, parentId = '0', fetch = sfmcFetch) => fetchContentFolders(stack, parentId, { fetch })

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
// Personalization strings SFMC fills itself: never asked for in Type values (#1058).
const SYSTEM_STRINGS = new Set([
  'view_email_url', 'unsub_center_url', 'profile_center_url', 'subscription_center_url', 'ftaf_url', 'forward_to_a_friend',
  'double_opt_in_url', 'mobile_view_url', 'member_busname', 'member_addr', 'member_city', 'member_state', 'member_postalcode',
  'member_country', 'jobid', '_jobsubscriberbatchid', '_messagecontext', '_emailid', '_preheader', 'xtmonth', 'xtmonthnumeric',
  'xtday', 'xtdayofweek', 'xtyear', 'xtshortdate', 'xtlongdate', '_datasourcename', '_replycontactemail', '_replycontactname',
  'emailname_', 'additionalemailattribute1', 'listid', '_listname', 'subscriberid', 'replyname', 'replyemailaddress',
])
const isSystemString = (n) => SYSTEM_STRINGS.has(n.toLowerCase()) || /^xt/i.test(n) || /_url$/i.test(n)

const FIELD_STRING_RE = /%%([A-Za-z_][A-Za-z0-9_ -]*?)%%/g // %%FirstName%%
const ATTR_CALL_RE = /AttributeValue\(\s*["']([^"']+)["']\s*\)/gi // AttributeValue("First Name")
const AMP_RE = /%%\[([\s\S]*?)\]%%|%%=([\s\S]*?)=%%|<script[^>]*runat=["']?server["']?[^>]*>([\s\S]*?)<\/script>/gi
const BRACKET_RE = /\[([A-Za-z_][A-Za-z0-9_ -]*)\]/g // [First Name] inside AMPscript

/**
 * The attributes an email uses (feedback #1058): %%Field%% strings, AttributeValue("x")
 * and [Field Name] inside AMPscript, in the order they first appear. System strings
 * that SFMC fills itself (view_email_url, xtmonth and the like) are left out.
 */
export function emailAttributes(...texts) {
  const out = new Map()
  const add = (n) => {
    const name = String(n || '').trim()
    if (!name || isSystemString(name)) return
    const k = name.toLowerCase()
    if (!out.has(k)) out.set(k, name)
  }
  for (const t of texts) {
    const text = String(t || '')
    for (const m of text.matchAll(FIELD_STRING_RE)) add(m[1])
    for (const m of text.matchAll(ATTR_CALL_RE)) add(m[1])
    for (const m of text.matchAll(AMP_RE)) {
      const code = (m[1] ?? m[2] ?? m[3] ?? '').replace(/"[^"]*"|'[^']*'/g, '""')
      for (const b of code.matchAll(BRACKET_RE)) add(b[1])
    }
  }
  return [...out.values()]
}

/**
 * Fills one row's values into the text (names match regardless of case): %%Field%%,
 * and output blocks that only print an attribute: %%=AttributeValue("x")=%%,
 * %%=v([x])=%%, %%=[x]=%%. Other AMPscript is left as written.
 * Returns { html, filled: names used, missing: names with no value }.
 */
export function fillPersonalization(html, row) {
  const values = new Map(Object.entries(row || {}).map(([k, v]) => [k.toLowerCase(), v]))
  const filled = new Set()
  const missing = new Set()
  const sub = (whole, name, escape = true) => {
    const n = name.trim()
    if (isSystemString(n)) return whole
    const k = n.toLowerCase()
    if (!values.has(k) || values.get(k) == null || values.get(k) === '') { missing.add(n); return whole }
    filled.add(n)
    return escape ? escapeHtml(values.get(k)) : String(values.get(k))
  }
  const out = String(html || '')
    .replace(/%%=\s*(?:v\(\s*)?(?:AttributeValue\(\s*["']([^"']+)["']\s*\)|\[([^\]]+)\])\s*\)?\s*=%%/gi, (w, a, b) => sub(w, a || b))
    .replace(FIELD_STRING_RE, (w, n) => sub(w, n))
  return { html: out, filled: [...filled], missing: [...missing] }
}

function escapeHtml(v) {
  return String(v).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;')
}

/** Subject, preheader and HTML filled in here from one set of values. */
export function fillEmail(parts, row) {
  const h = fillPersonalization(parts?.html, row)
  const s = fillPersonalization(parts?.subject, row)
  const p = fillPersonalization(parts?.preheader, row)
  const uniq = (a) => [...new Set(a)]
  return { html: h.html, subject: s.html, preheader: p.html, filled: uniq([...h.filled, ...s.filled, ...p.filled]), missing: uniq([...h.missing, ...s.missing, ...p.missing]) }
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

/**
 * HTML, subject and preheader in a guide/v1 preview answer, whatever its exact shape
 * (feedback #1057: the subject did not change): any { contentType|type|name, content }
 * pair in the answer, or keys named like subject / preheader / html.
 */
export function previewFromResponse(d) {
  const found = {}
  const take = (kind, v) => { if (typeof v === 'string' && found[kind] == null) found[kind] = v }
  const kindOf = (label) => {
    const l = String(label || '').toLowerCase()
    if (/preheader/.test(l)) return 'preheader'
    if (/subject/.test(l)) return 'subject'
    if (/html/.test(l)) return 'html'
    if (/text/.test(l)) return 'text'
    return null
  }
  const walk = (o, depth) => {
    if (!o || typeof o !== 'object' || depth > 6) return
    if (Array.isArray(o)) { for (const x of o) walk(x, depth + 1); return }
    const label = o.contentType ?? o.type ?? o.name ?? o.key
    const content = o.content ?? o.value ?? o.body
    if (label && typeof content === 'string') { const k = kindOf(label); if (k) take(k, content) }
    for (const [k, v] of Object.entries(o)) {
      if (typeof v === 'string') {
        const kind = /^(subject|subjectline|subject_line)$/i.test(k) ? 'subject' : /^pre_?header$/i.test(k) ? 'preheader' : /^(html|htmlbody|html_body)$/i.test(k) ? 'html' : null
        if (kind) take(kind, v)
      } else walk(v, depth + 1)
    }
  }
  walk(d, 0)
  if (!found.html) return null
  return { html: found.html, subject: found.subject ?? null, preheader: found.preheader ?? null, shape: responseShape(d) }
}

/** The answer's structure without its values (keys and content types), for a report. */
export function responseShape(d, depth = 0) {
  if (depth > 5) return '...'
  if (Array.isArray(d)) return d.slice(0, 6).map((x) => responseShape(x, depth + 1))
  if (d && typeof d === 'object') {
    const o = {}
    for (const [k, v] of Object.entries(d)) o[k] = /^(contentType|type|name|key)$/.test(k) && typeof v === 'string' ? v : responseShape(v, depth + 1)
    return o
  }
  return typeof d
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
      if (p) return { ...p, url, ...(await missingParts(url, p, fetch)) }
      last = new Error('SFMC answered without HTML.')
    } catch (e) { last = e }
  }
  throw last
}

/** The kind values to ask for when the first answer had only the HTML (feedback #1062). */
export const EXTRA_KINDS = [null, 'subjectline', 'preheader']

/**
 * Feedback #1062: the kind=html answer had no subject line or preheader. Asks the same
 * preview again without kind, then for those parts, and takes what comes back (any
 * answer that is not HTML is used as the part itself). Returns { subject?, preheader?,
 * extraShapes }.
 */
async function missingParts(url, p, fetch) {
  const out = { extraShapes: [] }
  if (p.subject != null && p.preheader != null) return out
  for (const kind of EXTRA_KINDS) {
    if ((out.subject ?? p.subject) != null && (out.preheader ?? p.preheader) != null) break
    const u = kind ? url.replace(/kind=html/, `kind=${kind}`) : url.replace(/[?&]kind=html/, '')
    try {
      const d = await fetch(u, 'POST', {})
      out.extraShapes.push({ kind: kind || '(none)', shape: responseShape(d) })
      const q = previewFromResponse({ ...d, html: d?.html ?? 'x' }) || {}
      const single = kind && typeof firstString(d) === 'string' ? firstString(d) : null
      if (out.subject == null && p.subject == null) out.subject = q.subject ?? (kind === 'subjectline' ? single : null) ?? undefined
      if (out.preheader == null && p.preheader == null) out.preheader = q.preheader ?? (kind === 'preheader' ? single : null) ?? undefined
    } catch (e) { out.extraShapes.push({ kind: kind || '(none)', error: String(e.message || e).slice(0, 200) }) }
  }
  for (const k of ['subject', 'preheader']) if (out[k] == null) delete out[k]
  return out
}

/** The only content string in an answer for one kind (views[0].content and the like). */
function firstString(d) {
  let found
  const walk = (o, depth) => {
    if (found !== undefined || !o || typeof o !== 'object' || depth > 6) return
    if (Array.isArray(o)) { for (const x of o) walk(x, depth + 1); return }
    if (typeof o.content === 'string') {
      // An HTML body is never a subject line or preheader (SFMC may ignore the kind).
      if (!/html/i.test(String(o.contentType ?? o.type ?? ''))) found = o.content
      return
    }
    for (const v of Object.values(o)) walk(v, depth + 1)
  }
  walk(d, 0)
  return found
}
