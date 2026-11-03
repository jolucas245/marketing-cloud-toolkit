// The Ctrl+K palette (components/shell/CommandPalette.vue), opened from anywhere:
// Home's search box (redesign, feedback #1031) opens it with the text typed there.
import { ref } from 'vue'

export const paletteState = ref({ open: false, text: '' })

export function openPalette(text = '') {
  paletteState.value = { open: true, text: String(text || '') }
}
export function closePalette() {
  paletteState.value = { open: false, text: '' }
}
