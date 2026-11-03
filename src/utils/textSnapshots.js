// Earlier text (feedback #1028, "unsaved query recovery"): copies of a Run Query
// panel's SQL from the last 24 hours, taken before the text is replaced (Clear, opening
// a query activity, AI Assist, Restore) and every few minutes while typing. Kept in
// chrome.storage.local under SNAPSHOTS_KEY: { [queryId]: [{ at, text, reason }] }.
export const SNAPSHOTS_KEY = 'toolkit_snapshots'
export const SNAPSHOT_MAX_AGE = 24 * 3600 * 1000
export const SNAPSHOT_MAX = 20
export const TYPING_EVERY = 5 * 60 * 1000

/** The list with `text` added (newest first), unless it is empty or equals the newest; old ones dropped. */
export function addSnapshot(list, text, reason, now = Date.now()) {
  const kept = pruneSnapshots(list, now)
  if (!String(text || '').trim() || kept[0]?.text === text) return kept
  return [{ at: now, text, reason }, ...kept].slice(0, SNAPSHOT_MAX)
}

export function pruneSnapshots(list, now = Date.now()) {
  return (Array.isArray(list) ? list : []).filter((s) => s && now - s.at < SNAPSHOT_MAX_AGE)
}

/** Whether typing has gone on long enough since the newest copy to take another. */
export const typingSnapshotDue = (list, text, now = Date.now()) => !list?.length || (now - list[0].at >= TYPING_EVERY && list[0].text !== text)

export const SNAPSHOT_REASONS = {
  clear: 'Before Clear', open: 'Before opening a query activity', ai: 'Before AI Assist', restore: 'Before Restore', typing: 'While typing',
}
