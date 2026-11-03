// AI in the Toolkit (feedback #1028, #1029): Chrome's built-in model, on this
// computer. Experimental, on by default: Settings > Experimental turns it off, and the
// disableAiAssist admin policy hides it everywhere. Buttons show only in Google Chrome
// with the model's API and a model this computer can run (`aiShown`).
import { computed, ref } from 'vue'
import { useStoredSetting } from './useStoredSetting.js'
import { policy } from '../utils/policy.js'
import { AI_SETTING, aiAvailability, aiPresent, createAiSession, isChromeBrowser } from '../utils/aiAssist.js'

let shared = null
function sharedState() {
  if (shared) return shared
  const { value: enabled } = useStoredSetting(AI_SETTING, true, (v) => v !== false)
  const availability = ref(aiPresent() ? '' : 'unsupported')
  if (availability.value === '') aiAvailability().then((a) => { availability.value = a }).catch(() => { availability.value = 'unavailable' })
  const supported = computed(() => isChromeBrowser() && aiPresent() && availability.value !== 'unavailable' && availability.value !== 'unsupported')
  const shown = computed(() => enabled.value && !policy.disableAiAssist && supported.value)
  shared = { enabled, availability, supported, shown }
  return shared
}

/** { enabled (the Settings switch), availability, supported, shown }. */
export function useAi() {
  return sharedState()
}

// Home's "Describe the query you need": the workspace hands it to the panel it opens.
export const pendingAiRequest = ref(null) // { queryId, request }

/**
 * One request to the model at a time: availability, download progress, state,
 * error, Stop. `ask(system, prompt)` resolves to the answer text, or null when
 * stopped or failed (the error is in `error`).
 */
export function useAiRun() {
  const availability = ref('')
  const download = ref(null) // 0..1 while the model downloads
  const state = ref('idle') // idle | asking | done | error
  const error = ref('')
  let controller = null

  async function check() {
    availability.value = await aiAvailability()
    return availability.value
  }
  async function ask(system, prompt) {
    error.value = ''
    state.value = 'asking'
    controller = new AbortController()
    let session = null
    try {
      session = await createAiSession(system, { signal: controller.signal, onProgress: (p) => { download.value = p } })
      download.value = null
      availability.value = 'available'
      const raw = await session.prompt(prompt, { signal: controller.signal })
      state.value = 'done'
      return String(raw || '')
    } catch (e) {
      if (controller?.signal.aborted) { state.value = 'idle'; return null }
      error.value = /quota|too large|exceed/i.test(e?.message || '')
        ? 'The text is too long for the built-in model. Make it shorter, then try again.'
        : `The built-in model did not answer: ${e?.message || e}`
      state.value = 'error'
      return null
    } finally {
      download.value = null
      try { session?.destroy?.() } catch { /* ignore */ }
    }
  }
  function stop() { controller?.abort() }
  function reset() { stop(); state.value = 'idle'; error.value = '' }
  const canAsk = computed(() => state.value !== 'asking' && ['available', 'downloadable', 'downloading'].includes(availability.value))
  return { availability, download, state, error, check, ask, stop, reset, canAsk }
}
