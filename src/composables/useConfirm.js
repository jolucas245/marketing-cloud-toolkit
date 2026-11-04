// In-app confirm dialog (feedback #1050: no browser alert or confirm boxes).
// const ok = await askConfirm({ title, message, confirmLabel, danger })
import { ref } from 'vue'

export const confirmState = ref(null) // { title, message, confirmLabel, cancelLabel, danger, note, resolve }

/** Opens the dialog; resolves true for the confirm button, false for Cancel, Esc or outside. */
export function askConfirm({ title = 'Are you sure?', message = '', confirmLabel = 'OK', cancelLabel = 'Cancel', danger = false, note = '' } = {}) {
  confirmState.value?.resolve(false)
  return new Promise((resolve) => {
    confirmState.value = { title, message, confirmLabel, cancelLabel, danger, note, resolve }
  })
}

export function answerConfirm(ok) {
  const s = confirmState.value
  confirmState.value = null
  s?.resolve(!!ok)
}
