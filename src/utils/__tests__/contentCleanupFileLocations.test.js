import { describe, it, expect } from 'vitest'
import {
  cleanupQueryBody, assetKind, toCleanupAsset, fetchCleanupAssets, countByType, countByKind, largestFiles, staleItems,
  isCopyName, duplicateGroups, copyNamed, blockUsage, formatBytes, monthsAgo, usageTarget,
} from '../contentCleanup.js'
import { sanitizeLocation, stripUserInfo, locationTypeLabel, toLocationRow, fetchFileLocations, activitiesByLocation } from '../fileLocations.js'
import { allContentBlockRefs } from '../usage/match.js'

const NOW = new Date('2026-11-11T12:00:00Z')
const asset = (o) => toCleanupAsset({ id: 1, name: 'A', assetType: { id: 197, name: 'htmlblock', displayName: 'HTML Block' }, ...o })

describe('Content clean-up report (API idea 18)', () => {
  it('asks Content Builder for every asset with a few fields, read only (POST query)', () => {
    const b = cleanupQueryBody(3)
    expect(b.page).toEqual({ page: 3, pageSize: 250 })
    expect(b.query).toEqual({ property: 'id', simpleOperator: 'greaterThan', value: 0 })
    expect(b.fields).toContain('fileProperties')
    expect(b.fields).not.toContain('content')
  })

  it('sorts assets into kinds', () => {
    expect(assetKind({ id: 208 })).toBe('email')
    expect(assetKind({ id: 4 })).toBe('template')
    expect(assetKind({ id: 197 })).toBe('block')
    expect(assetKind({ id: 28, name: 'jpg' })).toBe('file')
    expect(assetKind({ id: 999, name: 'something' })).toBe('other')
  })

  it('maps an asset with its file properties and drops http file URLs', () => {
    const a = toCleanupAsset({ id: 5, name: 'logo.png', customerKey: 'k', assetType: { id: 28, name: 'png', displayName: 'Image' }, category: { id: 9, name: 'Images' }, fileProperties: { fileSize: 2048, width: 10, height: 20, extension: 'png', publishedURL: 'https://image.s10.sfmc-content.com/x.png' }, status: { id: 1, name: 'Draft' } })
    expect(a).toMatchObject({ id: '5', key: 'k', kind: 'file', folder: 'Images', size: 2048, width: 10, height: 20, fileUrl: 'https://image.s10.sfmc-content.com/x.png', deleted: false })
    expect(toCleanupAsset({ id: 6, fileProperties: { publishedURL: 'javascript:alert(1)' } }).fileUrl).toBe('')
    expect(toCleanupAsset({ id: 7, status: { id: 6 } }).deleted).toBe(true)
  })

  it('pages through every asset with progress, drops deleted ones, and caps', async () => {
    const calls = []
    const fetch = async (url, method, body) => {
      calls.push({ url, method, page: body.page.page })
      const n = body.page.page < 3 ? 250 : 10
      return { count: 510, items: Array.from({ length: n }, (_, i) => ({ id: body.page.page * 1000 + i, name: 'x', status: i === 0 ? { id: 6 } : { id: 1 } })) }
    }
    const seen = []
    const r = await fetchCleanupAssets('s10', { fetch, onProgress: (d, t) => seen.push([d, t]) })
    expect(calls.every((c) => c.method === 'POST' && c.url === 'https://content-builder.s10.marketingcloudapps.com/fuelapi/asset/v1/content/assets/query')).toBe(true)
    expect(calls.map((c) => c.page)).toEqual([1, 2, 3])
    expect(r.items).toHaveLength(507)
    expect(r.capped).toBe(false)
    expect(seen.at(-1)).toEqual([510, 510])
    const capped = await fetchCleanupAssets('s10', { fetch, max: 250 })
    expect(capped.capped).toBe(true)
    let n = 0
    const stopped = await fetchCleanupAssets('s10', { fetch, shouldStop: () => n++ > 0 })
    expect(stopped.stopped).toBe(true)
  })

  it('counts by type and kind', () => {
    const items = [asset({ id: 1 }), asset({ id: 2 }), asset({ id: 3, assetType: { id: 28, name: 'png', displayName: 'Image' }, fileProperties: { fileSize: 100 } })]
    const t = countByType(items)
    expect(t[0]).toMatchObject({ type: 'HTML Block', count: 2, size: 0 })
    expect(t[1]).toMatchObject({ type: 'Image', count: 1, size: 100 })
    expect(countByKind(items)).toMatchObject({ all: 3, block: 2, file: 1, email: 0 })
  })

  it('lists the largest files first, without emails or templates', () => {
    const img = (id, size) => asset({ id, assetType: { id: 28, name: 'png' }, fileProperties: { fileSize: size } })
    const items = [img(1, 10), img(2, 300), img(3, 50), asset({ id: 4, assetType: { id: 208 }, fileProperties: { fileSize: 9999 } }), asset({ id: 5 })]
    expect(largestFiles(items).map((a) => a.id)).toEqual(['2', '3', '1'])
    expect(largestFiles(items, 1).map((a) => a.id)).toEqual(['2'])
  })

  it('finds templates and blocks not modified in N months, oldest first', () => {
    expect(monthsAgo(12, NOW).toISOString().slice(0, 10)).toBe('2025-11-11')
    const items = [
      asset({ id: 1, modifiedDate: '2025-01-01T00:00:00Z' }),
      asset({ id: 2, modifiedDate: '2026-10-01T00:00:00Z' }),
      asset({ id: 3, modifiedDate: '2024-01-01T00:00:00Z', assetType: { id: 4, name: 'template' } }),
      asset({ id: 4, modifiedDate: '2020-01-01T00:00:00Z', assetType: { id: 208 } }),
      asset({ id: 5, modifiedDate: '' }),
    ]
    expect(staleItems(items, 12, NOW).map((a) => a.id)).toEqual(['3', '1'])
    expect(staleItems(items, 24, NOW).map((a) => a.id)).toEqual(['3'])
  })

  it('recognises names ending in copy', () => {
    for (const n of ['Header copy', 'Header - Copy', 'Header (copy)', 'Header copy 2', 'Header_copy(1)', 'Copy of Header', 'HEADER COPY']) expect(isCopyName(n), n).toBe(true)
    for (const n of ['Copywriting', 'Header', 'Photocopy', 'Copy']) expect(isCopyName(n), n).toBe(n === 'Copy')
  })

  it('groups same-name items of the same kind', () => {
    const items = [asset({ id: 1, name: 'Footer' }), asset({ id: 2, name: ' footer ' }), asset({ id: 3, name: 'Footer', assetType: { id: 208 } }), asset({ id: 4, name: 'Other copy' })]
    const g = duplicateGroups(items)
    expect(g).toHaveLength(1)
    expect(g[0].items.map((a) => a.id)).toEqual(['1', '2'])
    expect(copyNamed(items).map((a) => a.id)).toEqual(['4'])
  })

  it('counts block users from Where used data by key, ID, name and slot, not itself', () => {
    const blocks = [{ id: '10', key: 'hdr', name: 'Header' }, { id: '11', key: 'ftr', name: 'Footer' }, { id: '12', key: 'none', name: 'Lonely' }]
    const saved = [
      { id: 1, content: '%%=ContentBlockByKey("HDR")=%%' },
      { id: 2, views: { html: { content: "%%=ContentBlockById('11')=%%" } } },
      { id: 3, content: '%%=ContentBlockByName("Content Builder\\\\Shared\\\\Header")=%%' },
      { id: 4, slots: { main: { blocks: { b1: { id: 11, assetType: { id: 197 } } } } } },
      { id: 10, content: '%%=ContentBlockByKey("hdr")=%%' },
    ]
    const m = blockUsage(blocks, saved)
    expect(m.get('10')).toBe(2)
    expect(m.get('11')).toBe(2)
    expect(m.get('12')).toBe(0)
    expect(allContentBlockRefs('ContentBlockByKey("A") ContentBlockByID(5) ContentAreaByName("x/y/Z")')).toEqual({ keys: ['a'], ids: ['5'], names: ['z'] })
  })

  it('formats bytes and builds Where used targets for emails and blocks only', () => {
    expect(formatBytes(512)).toBe('512 B')
    expect(formatBytes(2048)).toBe('2 KB')
    expect(formatBytes(3 * 1024 * 1024)).toBe('3.0 MB')
    expect(formatBytes(null)).toBe('')
    expect(usageTarget(asset({ id: 1, customerKey: 'k' }))).toMatchObject({ kind: 'block', asset: { id: '1', customerKey: 'k' } })
    expect(usageTarget(asset({ id: 2, assetType: { id: 208 }, data: { email: { legacy: { legacyId: 77 } } } })).asset.legacyId).toBe(77)
    expect(usageTarget(asset({ id: 3, assetType: { id: 4 } }))).toBeNull()
  })
})

describe('File locations (API idea 20)', () => {
  it('drops credentials at any depth and user info in URLs, keeps keys that are not secrets', () => {
    const raw = { id: 'L1', name: 'Partner', customerKey: 'pk', password: 'p', ftpPassword: 'p', privateKey: 'k', sasToken: 't', accessKeyId: 'a', secretAccessKey: 's', locationUrl: 'sftp://user:pw@ftp.example.com/in', auth: { username: 'u', passphrase: 'x' } }
    const s = sanitizeLocation(raw)
    expect(JSON.stringify(s)).not.toMatch(/"p"|"k"|"t"|"s"|pw@|passphrase|password/i)
    expect(s).toMatchObject({ id: 'L1', name: 'Partner', customerKey: 'pk', locationUrl: 'sftp://ftp.example.com/in' })
    expect(stripUserInfo('https://a:b@host/x')).toBe('https://host/x')
  })

  it('names the type from a type name, URL or name', () => {
    expect(locationTypeLabel({ locationType: 'ExternalSFTP' })).toBe('External SFTP')
    expect(locationTypeLabel({ locationUrl: 'https://acct.blob.core.windows.net/c' })).toBe('Azure Blob Storage')
    expect(locationTypeLabel({ locationUrl: 'https://bucket.s3.amazonaws.com' })).toBe('Amazon S3')
    expect(locationTypeLabel({ locationUrl: 'ftp://ftp.s10.exacttarget.com' })).toBe('Enhanced FTP')
    expect(locationTypeLabel({ name: 'ExactTarget Enhanced FTP' })).toBe('Enhanced FTP')
    expect(locationTypeLabel({ name: 'Mystery', locationTypeId: 9 })).toBe('Type 9')
  })

  it('reads ftplocations with a GET only, sanitized and sorted', async () => {
    const calls = []
    const fetch = async (url, method) => { calls.push([url, method]); return { items: [{ id: 'b', name: 'Zed', locationTypeId: 2, relPath: 'Import', password: 'nope' }, { id: 'a', name: 'Alpha', relPath: '', locationUrl: 'sftp://partner.example.com' }] } }
    const rows = await fetchFileLocations('s10', fetch)
    expect(calls).toEqual([['https://mc.s10.marketingcloudapps.com/AutomationStudioFuel3/fuelapi/automation/v1/ftplocations/', 'GET']])
    expect(rows.map((r) => r.id)).toEqual(['a', 'b'])
    expect(rows[1]).toMatchObject({ path: 'Import', type: 'Type 2' })
    expect(JSON.stringify(rows)).not.toContain('nope')
    expect(toLocationRow({ id: 1 }).id).toBe('1')
  })

  it('links import, file transfer and data extract activities to their location', () => {
    const locs = [toLocationRow({ id: 'L1', name: 'A', customerKey: 'KEY1' }), toLocationRow({ id: 'L2', name: 'B' })]
    const lists = {
      imports: { items: [{ importDefinitionId: 'i1', name: 'Imp', fileTransferLocationId: 'l1', fileNamingPattern: 'f.csv', destinationName: 'DE' }] },
      filetransfers: { items: [{ id: 'f1', name: 'Unzip', fileTransferLocationId: 'L2', isUpload: false, fileSpec: '*.zip' }, { id: 'f2', name: 'Other', fileTransferLocationId: 'X' }] },
      dataextracts: { items: [{ dataExtractDefinitionId: 'd1', name: 'Ext', fileSpec: 'out.csv', locationKey: 'KEY1' }, { dataExtractDefinitionId: 'd2', name: 'Safe', note: 'L1' }] },
    }
    const m = activitiesByLocation(locs, lists, 's10')
    expect(m.get('L1').map((a) => [a.typeId, a.name])).toEqual([[43, 'Imp'], [73, 'Ext']])
    expect(m.get('L1')[0].detail).toBe('f.csv into DE')
    expect(m.get('L2').map((a) => [a.typeId, a.name, a.detail])).toEqual([[53, 'Unzip', 'Download: *.zip']])
    expect(m.get('L2')[0].href).toContain('ActivityDetails')
  })
})
