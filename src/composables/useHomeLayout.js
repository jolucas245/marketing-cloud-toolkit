// Home's layout state (user, 2026-11-06): order and hidden cards from
// chrome.storage.local (utils/homeLayout.js), Customize mode, and drag and drop.
// HomePage provides it; each HomeBlock injects it.
import { computed, inject, provide, ref } from 'vue'
import { useStoredSetting } from './useStoredSetting.js'
import { HOME_LAYOUT_KEY, normalizeLayout, isHidden, moveBy, moveTo, setHidden, isDefaultLayout } from '@/utils/homeLayout.js'

const KEY = Symbol('homeLayout')
const plain = (l) => JSON.parse(JSON.stringify(l))

export function provideHomeLayout() {
  const { value: saved, loaded } = useStoredSetting(HOME_LAYOUT_KEY, null)
  const layout = computed(() => normalizeLayout(saved.value))
  const save = (next) => { saved.value = plain(next) }
  const customizing = ref(false)
  const drag = ref(null) // { group, id } being dragged
  const over = ref(null) // { group, id } it is over

  const api = {
    layout,
    loaded,
    customizing,
    drag,
    over,
    /** Ids of `group` in order; hidden ones only while customizing. */
    ids: (group) => layout.value.order[group].filter((id) => customizing.value || !isHidden(layout.value, group, id)),
    hidden: (group, id) => isHidden(layout.value, group, id),
    first: (group, id) => layout.value.order[group][0] === id,
    last: (group, id) => layout.value.order[group].at(-1) === id,
    move: (group, id, delta) => save(moveBy(layout.value, group, id, delta)),
    toggle: (group, id) => save(setHidden(layout.value, group, id, !isHidden(layout.value, group, id))),
    reset: () => { saved.value = null },
    isDefault: computed(() => isDefaultLayout(layout.value)),
    dragStart(group, id, e) {
      drag.value = { group, id }
      try { e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/plain', `${group}:${id}`) } catch { /* ignore */ }
    },
    // Only a block of the same group takes the drop; others let it bubble to their section.
    dragOver(group, id, e) {
      if (drag.value?.group !== group) return
      e.preventDefault()
      e.stopPropagation()
      over.value = { group, id }
    },
    drop(group, id, e) {
      if (drag.value?.group !== group) return
      e.preventDefault()
      e.stopPropagation()
      if (drag.value.id !== id) save(moveTo(layout.value, group, drag.value.id, layout.value.order[group].indexOf(id)))
      drag.value = over.value = null
    },
    dragEnd() { drag.value = over.value = null },
  }
  provide(KEY, api)
  return api
}

export const useHomeLayout = () => inject(KEY, null)
