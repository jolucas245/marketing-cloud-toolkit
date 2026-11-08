// Journey versions: which one is live, and list items grouped per journey. Pure, so
// the service worker (dashboard card) can use it too.

// Statuses of a version that contacts can be in, best first. A journey's "current"
// version is the newest of these, else its newest version.
const LIVE_STATUSES = ['Published', 'ScheduledToPublish', 'Paused', 'Finishing', 'Sent']
/** A version contacts can be in (see LIVE_STATUSES). */
export const LIVE_VERSION = new RegExp(`^(${LIVE_STATUSES.join('|')})$`, 'i')
const liveRank = (status) => { const i = LIVE_STATUSES.indexOf(String(status || '')); return i < 0 ? LIVE_STATUSES.length : i }

/** The version to show for a journey: the published (or otherwise live) one, else the newest. */
export function primaryVersion(versions) {
  return [...(versions || [])].sort((a, b) => liveRank(a.status) - liveRank(b.status) || (Number(b.version) || 0) - (Number(a.version) || 0))[0] || null
}

/**
 * List items of every version (`allVersions`) grouped per journey, in the order the
 * journeys first appear: [{ id, key, name, versions (newest first), primary }].
 */
export function groupJourneyVersions(items) {
  const groups = new Map()
  for (const j of items || []) {
    if (!groups.has(j.id)) groups.set(j.id, { id: j.id, key: j.key, name: j.name, versions: [] })
    groups.get(j.id).versions.push(j)
  }
  return [...groups.values()].map((g) => {
    g.versions.sort((a, b) => (Number(b.version) || 0) - (Number(a.version) || 0))
    const primary = primaryVersion(g.versions)
    return { ...g, name: primary?.name || g.name, primary }
  })
}
