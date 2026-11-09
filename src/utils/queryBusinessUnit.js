// The business unit a saved query belongs to ({ name, accountId } on the record), for the
// BU badge and the "queries from <current BU>" view on Saved queries. Tagged when the
// query is first saved, not only on its first run: panels never run and Query Builder
// saves had none and were hidden from that view (live test, 2026-11-07).
import { fetchCurrentBU } from './sfmcApi.js'

const inFlight = new Map()

/**
 * Adds the current business unit of `stack` to the saved query `id` when it has none.
 * Never throws; resolves to the business unit written, or null.
 */
export function tagQueryBusinessUnit(id, stack, { fetchBU = fetchCurrentBU, storage = () => chrome.storage.local } = {}) {
  if (!id || !stack) return Promise.resolve(null)
  const key = `${stack}:${id}`
  if (inFlight.has(key)) return inFlight.get(key)
  const p = (async () => {
    const get = () => new Promise((resolve) => storage().get(id, (r) => resolve(r?.[id] || null)))
    const first = await get()
    if (!first || first.businessUnit?.name) return null
    const bu = await fetchBU(stack)
    if (!bu?.name) return null
    // Read again: the record may have changed while SFMC answered.
    const rec = await get()
    if (!rec || rec.businessUnit?.name) return null
    await new Promise((resolve) => storage().set({ [id]: { ...rec, businessUnit: { ...(rec.businessUnit || {}), ...bu } } }, resolve))
    return bu
  })().catch(() => null).finally(() => inFlight.delete(key))
  inFlight.set(key, p)
  return p
}
