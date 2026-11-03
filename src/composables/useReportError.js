// "Report the error" (user, 2026-11-03): any error message can open the Feedback form
// with the error filled in. App.vue opens the form when `errorReport` is set.
import { ref } from 'vue'

export const errorReport = ref(null) // { message, details } while the form is open for an error

/** Opens Feedback as a problem report with `text` (the error as shown) and the page. */
export function reportError(text, { page = '' } = {}) {
  const error = String(text || '').replace(/\s+/g, ' ').trim()
  errorReport.value = {
    kind: 'problem',
    message: `Error${page ? ` on ${page}` : ''}: ${error.slice(0, 160)}${error.length > 160 ? '…' : ''}`,
    details: [`Error shown: ${error}`, page ? `Page: ${page}` : '', `When: ${new Date().toISOString()}`,
      '', 'What I was doing:', ''].filter((l, i) => l || i > 2).join('\n'),
  }
}
