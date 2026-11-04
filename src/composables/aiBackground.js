// AI Assist in the background (feedback #1032): the dialog can be hidden while the
// model thinks, and the panel shows where the request is. Pure helpers, tested alone.

/**
 * What the panel shows for a hidden AI Assist request: null (nothing to show),
 * 'writing', 'ready' or 'failed'.
 * open: the dialog is visible. background: it was hidden while the model was thinking.
 * state: useAiRun's state (idle | asking | done | error).
 */
export function aiBackgroundStatus({ open, background, state }) {
  if (open || !background) return null
  if (state === 'asking') return 'writing'
  if (state === 'done') return 'ready'
  if (state === 'error') return 'failed'
  return null
}

export const AI_STATUS_TEXT = {
  writing: 'AI is writing...',
  ready: 'AI suggestion ready',
  failed: 'AI request failed',
}

export const AI_STATUS_TITLE = {
  writing: 'The built-in model is still working on your request. Click to open AI Assist and watch it.',
  ready: 'Click to see the suggestion and apply it.',
  failed: 'Click to see what went wrong.',
}

/** The toast when a hidden request ends, or '' when none is due. */
export function aiStatusToast(before, after, panelLabel = '') {
  if (before !== 'writing') return ''
  const where = panelLabel ? ` (${panelLabel})` : ''
  if (after === 'ready') return `AI suggestion ready${where}. Click it in the panel toolbar to see it.`
  if (after === 'failed') return `The AI request failed${where}. Click the panel's AI status to see why.`
  return ''
}
