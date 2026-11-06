// Home layout (user, 2026-11-06): the order of Home's sections and of the cards inside
// them, and which are hidden. Kept in chrome.storage.local only; nothing is sent.
// Saved shape: { order: { [group]: [id, ...] }, hidden: ['group:id', ...] }.
// Ids the saved layout does not know (a card added in a later version) take their
// default place; ids no longer on Home are dropped.
import { moveItem } from './deReorder.js'

export const HOME_LAYOUT_KEY = 'toolkit_homeLayout'

// `sections` are the blocks of the page; the others are the cards inside one of them.
export const HOME_GROUPS = {
  sections: ['ai', 'connection', 'glance', 'starts', 'lists'],
  glance: ['automations', 'journeys', 'needsLook', 'watched'],
  starts: ['runQuery', 'buildQuery', 'contactJourneys', 'emailValidation', 'whereUsed', 'automationList'],
  lists: ['recentQueries', 'jumpBackIn'],
}

// A list, also from an array Chrome stored as an object ({ 0: 'a', 1: 'b' }).
const asList = (v) => (Array.isArray(v) ? v : v && typeof v === 'object' ? Object.values(v) : [])

/** Saved ids in their saved order, with new default ids placed after their default neighbour. */
function mergeOrder(saved, defaults) {
  const known = new Set(defaults)
  const out = [...new Set(asList(saved))].filter((id) => known.has(id))
  defaults.forEach((id, i) => {
    if (out.includes(id)) return
    const before = defaults.slice(0, i).reverse().find((d) => out.includes(d))
    out.splice(before ? out.indexOf(before) + 1 : 0, 0, id)
  })
  return out
}

export function normalizeLayout(saved) {
  const order = {}
  for (const [group, ids] of Object.entries(HOME_GROUPS)) order[group] = mergeOrder(saved?.order?.[group], ids)
  const valid = new Set(Object.entries(HOME_GROUPS).flatMap(([g, ids]) => ids.map((id) => `${g}:${id}`)))
  const hidden = [...new Set(asList(saved?.hidden))].filter((k) => valid.has(k))
  return { order, hidden }
}

export const isHidden = (layout, group, id) => layout.hidden.includes(`${group}:${id}`)

/** A copy of `layout` with `id` moved to position `to` in its group. */
export function moveTo(layout, group, id, to) {
  const list = layout.order[group]
  const from = list.indexOf(id)
  const at = Math.max(0, Math.min(list.length - 1, to))
  if (from < 0) return layout
  return { ...layout, order: { ...layout.order, [group]: moveItem(list, from, at) } }
}

/** A copy of `layout` with `id` moved `delta` places (-1 earlier, 1 later). */
export const moveBy = (layout, group, id, delta) => moveTo(layout, group, id, layout.order[group].indexOf(id) + delta)

export function setHidden(layout, group, id, hidden) {
  const key = `${group}:${id}`
  const rest = layout.hidden.filter((k) => k !== key)
  return { ...layout, hidden: hidden ? [...rest, key] : rest }
}

export function isDefaultLayout(layout) {
  return !layout.hidden.length && Object.entries(HOME_GROUPS).every(([g, ids]) => layout.order[g].join() === ids.join())
}
