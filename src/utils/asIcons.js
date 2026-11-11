// Automation Studio's icons, read at run time from the user's own SFMC stack (user,
// 2026-11-10: not shipped in the extension). Automation Studio's stylesheet
// (https://mc.<stack>.marketingcloudapps.com/AutomationStudioFuel3/css/styles.css, public,
// about 1.8 MB) has each icon as an inline SVG on a class as-icon-<name>. It is fetched
// once per stack without cookies or a session (credentials: 'omit'), only the glyphs in
// AS_GLYPH_NAMES are kept (about 25 KB, as data: URLs), and they are stored in
// chrome.storage.local for 30 days. Until they arrive, or if SFMC changes the file, the
// components fall back to their own icons.
import { reactive } from 'vue'
import { AS_GLYPH_NAMES } from '@/data/automationStudioIcons.js'

export const AS_ICON_MAX_AGE = 30 * 24 * 3600 * 1000
// Bump the version when the parser or AS_GLYPH_NAMES change, so stored copies are read again.
const STORE_VERSION = 2
const STORE_KEY = (stack) => `toolkit_asIcons_v${STORE_VERSION}_${stack}`
export const asStylesheetUrl = (stack) => `https://mc.${stack}.marketingcloudapps.com/AutomationStudioFuel3/css/styles.css`

/** The glyphs read so far: { stack, glyphs: { name: dataUrl } }. Components read it reactively. */
export const asIcons = reactive({ stack: '', glyphs: {} })

/** name -> data: URL for each wanted as-icon-<name> class with an inline SVG background. */
export function parseAsIcons(css, names = AS_GLYPH_NAMES) {
  const want = new Set(names)
  const out = {}
  const rule = /([^{}]+)\{([^{}]*)\}/g
  let m
  while ((m = rule.exec(String(css || '')))) {
    const found = [...m[1].matchAll(/\.as-icon-([A-Za-z0-9_-]+)/g)].map((x) => x[1]).filter((n) => want.has(n) && !out[n])
    if (!found.length) continue
    const u = /url\((["']?)(data:image\/svg\+xml[^)]*?)\1\)/.exec(m[2])
    if (!u) continue
    let svg
    try { svg = decodeURIComponent(u[2].slice(u[2].indexOf(',') + 1)) } catch { continue }
    // Only an SVG document; anything scripted is refused (shown as an <img>, it could not run anyway).
    svg = svg.replace(/<\?xml[^>]*\?>/, '').replace(/<!--[\s\S]*?-->/g, '').replace(/<!DOCTYPE[^>]*>/i, '')
      .replace(/<title>[\s\S]*?<\/title>/g, '').replace(/>\s+</g, '><').trim()
    if (!/^<svg[\s>]/i.test(svg) || /<script|\son[a-z]+\s*=|javascript:/i.test(svg)) continue
    for (const n of found) out[n] = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`
  }
  return out
}

const storage = () => (typeof chrome !== 'undefined' && chrome.storage?.local ? chrome.storage.local : null)
const loading = new Map() // stack -> Promise<boolean>; a failed load is not retried until the page reloads
const byStack = new Map() // stack -> glyphs
const show = (stack) => { Object.assign(asIcons, { stack, glyphs: byStack.get(stack) }); return true }

/**
 * Makes the glyphs for `stack` available in `asIcons` (stored copy first, else one fetch).
 * Safe to call from every icon: one load per stack. Never throws.
 */
export function loadAsIcons(stack, { fetchText = defaultFetch, now = Date.now } = {}) {
  if (!stack) return Promise.resolve(false)
  if (byStack.has(stack)) return Promise.resolve(show(stack))
  if (loading.has(stack)) return loading.get(stack)
  const job = (async () => {
    const key = STORE_KEY(stack)
    try {
      const stored = (await storage()?.get(key))?.[key]
      if (stored?.glyphs && now() - (stored.savedAt || 0) < AS_ICON_MAX_AGE && Object.keys(stored.glyphs).length) {
        byStack.set(stack, stored.glyphs)
        return show(stack)
      }
    } catch { /* storage blocked: read from SFMC */ }
    try {
      const glyphs = parseAsIcons(await fetchText(asStylesheetUrl(stack)))
      if (!Object.keys(glyphs).length) return false
      byStack.set(stack, glyphs)
      try { await storage()?.set({ [key]: { savedAt: now(), glyphs } }) } catch { /* kept in memory only */ }
      return show(stack)
    } catch { return false }
  })()
  loading.set(stack, job)
  return job
}

async function defaultFetch(url) {
  const r = await fetch(url, { credentials: 'omit', cache: 'force-cache' })
  if (!r.ok) throw new Error(`HTTP ${r.status}`)
  return r.text()
}

/** Test helper: forget what was loaded. */
export function resetAsIcons() { loading.clear(); byStack.clear(); Object.assign(asIcons, { stack: '', glyphs: {} }) }
