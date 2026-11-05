// Folder sources for the folder trees on Automations, Journeys (feedback #1064) and
// Data Extensions (#1065). Each returns (parentId) => Promise<[{ id, name }]>, '0'
// being the top level, by name.
import { sfmcFetch, listDERootFolders, listDEChildFolders } from './sfmcApi.js'

const AS = (stack) => `https://mc.${stack}.exacttarget.com/cloud/fuelapi`
const byName = (a, b) => a.name.localeCompare(b.name)

/**
 * Automation Studio's folders API (the one Query activity folders use), for one
 * category type: 'automations' or 'journey'. Every folder of the type comes in one
 * call and is split by parent here. The type names are not checked live.
 */
export function automationFolderLoader(stack, categoryType, fetch = sfmcFetch) {
  let all = null
  const read = () => {
    if (!all) {
      all = fetch(`${AS(stack)}/automation/v1/folders/?$filter=${encodeURIComponent(`categorytype eq ${categoryType}`)}&$pagesize=5000`, 'GET')
        .then((d) => (d?.items || []).map((f) => ({ id: String(f.categoryId ?? f.id), name: f.name || '', parentId: String(f.parentId ?? '0') })))
      all.catch(() => { all = null })
    }
    return all
  }
  return async (parentId) => {
    const list = await read()
    const ids = new Set(list.map((f) => f.id))
    // The top level: parent 0, or a parent that is not in the list (the type's root).
    const kids = parentId === '0' ? list.filter((f) => f.parentId === '0' || !ids.has(f.parentId)) : list.filter((f) => f.parentId === parentId)
    return kids.sort(byName)
  }
}

/** Data extension folders: the roots Contact Builder shows (no recycle bin), then children. */
export function deFolderLoader(stack, { rootsFetch = listDERootFolders, childrenFetch = listDEChildFolders } = {}) {
  const toFolder = (f) => ({ id: String(f.id ?? f.categoryId), name: f.name || '', type: f.type || '' })
  return async (parentId) => {
    const d = parentId === '0' ? await rootsFetch(stack) : await childrenFetch(stack, parentId)
    const list = (d?.entry || d?.items || []).filter((f) => f.type !== 'recyclebin').map(toFolder)
    return parentId === '0' ? list : list.sort(byName)
  }
}

/** Whether a record sits in the folder (by any of the usual category fields). */
export function inFolder(item, folderId) {
  if (folderId == null) return true
  const c = item?.categoryId ?? item?.categoryID ?? item?.category?.id ?? item?.folderId
  return c == null ? true : String(c) === String(folderId)
}
