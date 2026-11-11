// Setup > File locations (API idea 20, from Mathes, 2026-11-11). Read only.
// The list: Automation Studio's automation/v1/ftplocations/ (the call Where used already
// makes in usage/sources.js). data/v1/filetransferlocation is not called: its shape
// differs and whether this session may call it is unknown (not checked live).
// Fields assumed from the documentation and the Where used picker, not seen live: id,
// name, customerKey, locationTypeId / locationType, relPath, locationUrl / url / host,
// description. Type ids are not documented, so the type is read from a type name when
// one is sent, else guessed from the name and URL.
//
// Activities that use a location: Import File, File Transfer and Data Extract activities
// from the Where used lists (imports, filetransfers, dataextracts), matched by the
// location's id or key in any field whose path mentions "location"
// (fileTransferLocationId on imports and file transfers; data extracts usually write to
// the Safehouse and name no location, so few or none match).
//
// Never shown: anything that looks like a credential. sanitizeLocation drops such fields
// at any depth and removes user:password@ from URLs before a record reaches the page.
import { sfmcFetch } from './sfmcApi.js'
import { findValues } from './usage/match.js'
import { describeActivity, activityTypeLabel } from './activityTypes.js'

const AS = (stack) => `https://mc.${stack}.marketingcloudapps.com/AutomationStudioFuel3/fuelapi`

const SECRET_KEY = /pass(word|phrase)?|secret|token|credential|private.?key|access.?key|api.?key|sas|auth(orization)?$|^key$|keyfile|certificate|cert$|pwd/i

/** Strips user:password@ from a URL-like string. */
export function stripUserInfo(s) {
  return String(s).replace(/^([a-z][a-z0-9+.-]*:\/\/)[^/@\s]*@/i, '$1')
}

/** A copy of a location record without credential fields, URLs without user info. */
export function sanitizeLocation(v, depth = 0) {
  if (depth > 8) return null
  if (Array.isArray(v)) return v.map((x) => sanitizeLocation(x, depth + 1))
  if (v && typeof v === 'object') {
    const out = {}
    for (const [k, x] of Object.entries(v)) {
      if (SECRET_KEY.test(k) && !/^(customerKey|externalKey)$/i.test(k)) continue
      out[k] = sanitizeLocation(x, depth + 1)
    }
    return out
  }
  return typeof v === 'string' && /:\/\//.test(v) ? stripUserInfo(v) : v
}

const TYPE_NAMES = [
  [/enhanced\s*ftp|exacttarget\s*ftp|exacttargetftp|marketing cloud ftp/i, 'Enhanced FTP'],
  [/safehouse/i, 'Safehouse'],
  [/externalsftp|external\s*sftp|^sftp$/i, 'External SFTP'],
  [/externalftps|external\s*ftps|^ftps$/i, 'External FTPS'],
  [/externalftp|external\s*ftp|^ftp$/i, 'External FTP'],
  [/amazon|\bs3\b/i, 'Amazon S3'],
  [/azure|blob/i, 'Azure Blob Storage'],
  [/google\s*cloud|gcs/i, 'Google Cloud Storage'],
]

/** The location's type as text: from a type name, else the URL scheme or host, else the name. */
export function locationTypeLabel(l = {}) {
  const typeName = l.locationType || l.locationTypeName || l.type || ''
  for (const [re, label] of TYPE_NAMES) if (typeName && re.test(String(typeName))) return label
  const url = String(l.locationUrl || l.url || l.host || '')
  if (/\.blob\.core\.windows\.net/i.test(url)) return 'Azure Blob Storage'
  if (/amazonaws\.com|^s3:\/\//i.test(url)) return 'Amazon S3'
  if (/storage\.googleapis\.com|^gs:\/\//i.test(url)) return 'Google Cloud Storage'
  if (/^sftp:\/\//i.test(url)) return /exacttarget|marketingcloudops/i.test(url) ? 'Enhanced FTP' : 'External SFTP'
  if (/^ftps:\/\//i.test(url)) return 'External FTPS'
  if (/^ftp:\/\//i.test(url)) return /exacttarget|marketingcloudops/i.test(url) ? 'Enhanced FTP' : 'External FTP'
  for (const [re, label] of TYPE_NAMES) if (re.test(String(l.name || ''))) return label
  if (typeName) return String(typeName)
  return l.locationTypeId != null ? `Type ${l.locationTypeId}` : 'Unknown'
}

/** One location as the page shows it. `raw` is the sanitized record. */
export function toLocationRow(rawIn) {
  const raw = sanitizeLocation(rawIn || {})
  return {
    id: String(raw.id ?? ''),
    name: raw.name || '',
    key: raw.customerKey || raw.key || '',
    type: locationTypeLabel(raw),
    typeId: raw.locationTypeId ?? null,
    path: raw.relPath ?? raw.path ?? raw.relativePath ?? '',
    url: raw.locationUrl || raw.url || raw.host || '',
    description: raw.description || '',
    raw,
  }
}

/** Every file location in this business unit, credentials removed. */
export async function fetchFileLocations(stack, fetch = sfmcFetch) {
  const data = await fetch(`${AS(stack)}/automation/v1/ftplocations/`, 'GET')
  const items = Array.isArray(data) ? data : data?.items || []
  return items.map(toLocationRow).sort((a, b) => a.type.localeCompare(b.type) || a.name.localeCompare(b.name))
}

const ID_FIELDS = { 43: 'importDefinitionId', 53: 'id', 73: 'dataExtractDefinitionId' }
const KIND = { imports: 43, filetransfers: 53, dataextracts: 73 }

/**
 * Activities per location id, from Where used activity lists.
 * @param locations rows from fetchFileLocations
 * @param lists { imports?, filetransfers?, dataextracts? } each { items }
 * @returns {Map<string, { typeId, type, id, name, href, detail }[]>}
 */
export function activitiesByLocation(locations, lists = {}, stack = '') {
  const out = new Map(locations.map((l) => [l.id, []]))
  for (const [src, typeId] of Object.entries(KIND)) {
    for (const act of lists[src]?.items || []) {
      for (const l of locations) {
        if (!findValues(act, [l.id, l.key], /location/i).length) continue
        const id = act[ID_FIELDS[typeId]] ?? act.id
        let href = null
        try { href = describeActivity(typeId, act, stack).link || null } catch { href = null }
        const file = act.fileNamingPattern || act.fileSpec || ''
        const detail = typeId === 53 ? [act.isUpload === true ? 'Upload' : act.isUpload === false ? 'Download' : '', file].filter(Boolean).join(': ')
          : typeId === 43 ? [file, act.targetDataExtension?.name || act.destinationName ? `into ${act.targetDataExtension?.name || act.destinationName}` : ''].filter(Boolean).join(' ')
            : file
        out.get(l.id).push({ typeId, type: activityTypeLabel(typeId), id: String(id ?? ''), name: act.name || activityTypeLabel(typeId), href, detail })
      }
    }
  }
  return out
}
