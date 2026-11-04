// Messages (feedback #1050: no more toasts in a corner). showToast keeps its name and
// signature for its many callers, but messages now show in a bar at the top of the page
// (components/shell/MessageBar.vue): errors stay until closed, with Copy and Report the
// error; other messages close by themselves. Pass { kind } to override the guess.
import { ref } from 'vue'

export const messages = ref([]) // [{ id, message, kind: 'error'|'success'|'info', at }]
const MAX = 4
const timers = new Map()
let seq = 0

const ERROR_RE = /\b(could not|couldn't|cannot|can't|did not|didn't|failed|fails|error|refused|denied|not found|unable|expired|not allowed|not authori[sz]ed|blocked|stopped:)/i
const SUCCESS_RE = /^(started|saved|copied|deleted|reverted|restored|imported|exported|finished|done|added|created|updated|removed|cleared|sent|applied|moved|renamed|downloaded|watching|unwatched|turned)\b|\b(finished|saved|copied|deleted)\b/i

/** 'error' | 'success' | 'info' for a message, from its words. */
export function guessKind(message) {
  const m = String(message || '')
  if (ERROR_RE.test(m)) return 'error'
  if (SUCCESS_RE.test(m)) return 'success'
  return 'info'
}

export function dismissMessage(id) {
  clearTimeout(timers.get(id))
  timers.delete(id)
  messages.value = messages.value.filter((m) => m.id !== id)
}

/**
 * @param {string} message
 * @param {number} [ms]  how long a non-error message stays (at least 6 s)
 * @param {{ kind?: 'error'|'success'|'info' }} [opts]
 */
export function showToast(message, ms = 3500, opts = {}) {
  const text = String(message ?? '')
  const kind = opts.kind || guessKind(text)
  // The same text again replaces the old one rather than stacking up.
  for (const m of messages.value) if (m.message === text) dismissMessage(m.id)
  const id = ++seq
  // Raised while a dialog is open: shown above the dialog, not behind its backdrop.
  const overDialog = typeof document !== 'undefined' && !!document.querySelector('[aria-modal="true"]')
  messages.value = [...messages.value, { id, message: text, kind, at: Date.now(), overDialog }].slice(-MAX)
  if (kind !== 'error') timers.set(id, setTimeout(() => dismissMessage(id), Math.max(ms, 6000)))
  return id
}

export const showError = (message) => showToast(message, 0, { kind: 'error' })

export function useToast() {
  return { messages, showToast, dismissMessage }
}
