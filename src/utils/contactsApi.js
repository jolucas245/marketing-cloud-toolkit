// Contacts (feedback #57): the contact count and a Contact Key search, using the
// calls Contact Builder's All Contacts screen makes (contactsmeta, reached with the
// Contact Builder session). From the user's network log; the search response's
// shape is not confirmed, so parseContacts reads it loosely.
import { sfmcFetch } from './sfmcApi.js'

const CM = (stack) => `https://mc.${stack}.marketingcloudapps.com/contactsmeta/fuelapi`
export const CONTACT_PAGE_SIZE = 25
// Contact Builder's attribute ID for Contact Key.
export const CONTACT_KEY_DEFINITION_ID = 101

// The count is a POST with an empty filter (feedback #60; a GET answers 404).
export async function fetchContactCount(stack) {
  const data = await sfmcFetch(`${CM(stack)}/contacts/v1/addresses/count/?$pageSize=${CONTACT_PAGE_SIZE}&$page=1&$orderBy=contactKey%20ASC`, 'POST', {
    queryFilter: { hasCriteria: true, rootExpressionSet: { expressions: [] } },
  })
  const n = Number(data?.totalCount)
  if (!Number.isFinite(n)) throw new Error('Contact Builder did not return a count.')
  return n
}

export async function searchContactKey(stack, contactKey, page = 1) {
  const key = String(contactKey || '').trim()
  if (!key) throw new Error('Enter a contact key.')
  const data = await sfmcFetch(`${CM(stack)}/contacts-internal/v1/addresses/search/?$pageSize=${CONTACT_PAGE_SIZE}&$page=${page}&$orderBy=contactKey%20ASC`, 'POST', {
    queryFilter: {
      hasCriteria: true,
      rootExpressionSet: { expressions: [{ customerDataDefinitionID: CONTACT_KEY_DEFINITION_ID, operator: 'Equal', values: [key] }] },
    },
  })
  return parseContacts(data)
}

const valueOf = (v) => v?.innerValue ?? v?.value ?? v?.displayValue ?? ''
// A plain value, or { type, value } as the address search sends IDs and keys.
const scalar = (x) => (x && typeof x === 'object' ? valueOf(x) : x) ?? ''

/**
 * Contacts from a search response: `addresses` (or `items`), each with its key, ID,
 * dates and the attribute values Contact Builder sent (valueSets[].values[]).
 */
// addressTypeID in the address search (seen 2026-11-03: 1 holds the email address,
// 4 the mobile number); others are shown by number.
const ADDRESS_TYPES = { 1: 'Email', 4: 'Mobile' }
export const addressTypeName = (id) => ADDRESS_TYPES[id] || (id != null ? `Address type ${id}` : 'Address')

/**
 * Contacts from Contact Builder's address search. It returns one record per address
 * (email, mobile, ...) of a contact, so records with the same contact ID are merged
 * into one contact (feedback #1022/#1023): its values from every address, its
 * `addresses`, and `raws` with every record.
 */
export function parseContacts(data) {
  const list = data?.addresses || data?.items || data?.contacts || []
  const byId = new Map()
  const contacts = []
  for (const c of list) {
    const values = []
    for (const set of c.valueSets || []) {
      for (const v of set.values || []) {
        const name = v.name || v.definitionName || v.definitionKey || String(v.customerDataDefinitionID ?? v.definitionID ?? '')
        values.push({ set: set.name || set.definitionName || '', name, value: String(valueOf(v)) })
      }
    }
    const keyValue = values.find((v) => /^contact ?key$/i.test(v.name))?.value
    const contactKey = scalar(c.contactKey) || keyValue || ''
    const contactId = scalar(c.contactID ?? c.contactId ?? c.id)
    const address = scalar(c.addressKey) || scalar(c.addressID)
    const addr = c.addressTypeID != null || address ? { type: addressTypeName(c.addressTypeID), typeId: c.addressTypeID ?? null, address: address || '' } : null
    const id = String(contactId || contactKey)
    const known = id && byId.get(id)
    if (known) {
      const have = new Set(known.values.map((v) => `${v.set}|${v.name}|${v.value}`))
      for (const v of values) if (!have.has(`${v.set}|${v.name}|${v.value}`)) known.values.push(v)
      if (addr) known.addresses.push(addr)
      known.raws.push(c)
      if (c.modifiedDate && c.modifiedDate > known.modifiedDate) known.modifiedDate = c.modifiedDate
      continue
    }
    const contact = { contactKey, contactId, createdDate: c.createdDate || '', modifiedDate: c.modifiedDate || '', values, addresses: addr ? [addr] : [], raw: c, raws: [c] }
    if (id) byId.set(id, contact)
    contacts.push(contact)
  }
  const total = Number(data?.totalCount ?? data?.count)
  return { contacts, total: Number.isFinite(total) && total >= contacts.length ? total : contacts.length }
}

/** Keys from pasted text or a file: one per line, or separated by commas, semicolons or tabs. Duplicates removed. */
export function parseKeyList(text, max = 1000) {
  const seen = new Set()
  const keys = []
  for (const raw of String(text || '').split(/[\r\n,;\t]+/)) {
    const k = raw.trim().replace(/^"(.*)"$/, '$1').trim()
    if (!k || seen.has(k)) continue
    seen.add(k)
    keys.push(k)
  }
  return { keys: keys.slice(0, max), skipped: Math.max(0, keys.length - max) }
}

/**
 * Searches each key (Contact Builder answers one exact key per call), `limit` at a
 * time. Returns [{ key, contacts, error }] in the keys' order.
 */
export async function searchContactKeys(stack, keys, { limit = 4, onProgress, search = searchContactKey } = {}) {
  const out = new Array(keys.length)
  let next = 0
  let done = 0
  async function worker() {
    while (next < keys.length) {
      const i = next++
      try {
        const r = await search(stack, keys[i])
        out[i] = { key: keys[i], contacts: r.contacts, error: '' }
      } catch (e) {
        out[i] = { key: keys[i], contacts: [], error: e.message }
      }
      onProgress?.(++done, keys.length)
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, keys.length) }, worker))
  return out
}

/**
 * The encoded id Contact Builder's contact screen uses (legacy/v1/beta/contact/<id>/address/,
 * from the user's capture: base64 of "<contact ID>:<n>:0"), when the search response has it.
 */
export function contactDetailId(raw) {
  for (const k of ['id', 'addressID', 'addressId', 'contactAddressID', 'encodedId']) {
    const v = raw?.[k]
    if (typeof v === 'string' && /^[A-Za-z0-9+/]+=*$/.test(v) && v.length >= 8) {
      try { if (/^\d+:\d+:\d+$/.test(atob(v))) return v } catch { /* not base64 */ }
    }
  }
  return null
}

export async function fetchContactDetails(stack, detailId) {
  return sfmcFetch(`${CM(stack)}/legacy/v1/beta/contact/${encodeURIComponent(detailId)}/address/?_=${Date.now()}`, 'GET')
}
