// The automation canvas as a standalone SVG for the HTML and PDF downloads (feedback #1035).
// It draws the same model as AutomationCanvas.vue (automationCanvasModel): the starting
// source, one lane per step with its activity cards, and arrows between them. Activity and
// starting source icons are Automation Studio's own when the app has read them from the
// user's SFMC stack (utils/asIcons.js, user 2026-11-10), embedded as images; otherwise
// lucide's (ISC licence). Nothing is fetched here.
import { htmlEscape } from './exportDoc.js'
import { wrapText } from './journeySvg.js'
import { automationCanvasModel } from './automationCanvas.js'
import { activityGlyph, activityIconKind } from './activityIcons.js'
import { AS_GLYPH_BY_TYPE, AS_SOURCE, AS_SOURCE_GLYPH, AS_TILE } from '../data/automationStudioIcons.js'
import { asIcons } from './asIcons.js'

// Inner markup of the lucide icons (24x24, stroke).
export const AUTOMATION_ICONS = {
  query: '<ellipse cx="12" cy="5" rx="9" ry="3"/><path d="M3 5V19A9 3 0 0 0 21 19V5"/><path d="M3 12A9 3 0 0 0 21 12"/>',
  script: '<path d="M4 12.15V4a2 2 0 0 1 2-2h8a2.4 2.4 0 0 1 1.706.706l3.588 3.588A2.4 2.4 0 0 1 20 8v12a2 2 0 0 1-2 2h-3.35"/><path d="M14 2v5a1 1 0 0 0 1 1h5"/><path d="m5 16-3 3 3 3"/><path d="m9 22 3-3-3-3"/>',
  import: '<path d="M4 11V4a2 2 0 0 1 2-2h8a2.4 2.4 0 0 1 1.706.706l3.588 3.588A2.4 2.4 0 0 1 20 8v12a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2v-1"/><path d="M14 2v5a1 1 0 0 0 1 1h5"/><path d="M2 15h10"/><path d="m9 18 3-3-3-3"/>',
  extract: '<path d="M4.226 20.925A2 2 0 0 0 6 22h12a2 2 0 0 0 2-2V8a2.4 2.4 0 0 0-.706-1.706l-3.588-3.588A2.4 2.4 0 0 0 14 2H6a2 2 0 0 0-2 2v3.127"/><path d="M14 2v5a1 1 0 0 0 1 1h5"/><path d="m5 11-3 3"/><path d="m5 17-3-3h10"/>',
  transfer: '<path d="m16 3 4 4-4 4"/><path d="M20 7H4"/><path d="m8 21-4-4 4-4"/><path d="M4 17h16"/>',
  email: '<path d="M14.536 21.686a.5.5 0 0 0 .937-.024l6.5-19a.496.496 0 0 0-.635-.635l-19 6.5a.5.5 0 0 0-.024.937l7.93 3.18a2 2 0 0 1 1.112 1.11z"/><path d="m21.854 2.147-10.94 10.939"/>',
  verification: '<path d="M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z"/><path d="m9 12 2 2 4-4"/>',
  filter: '<path d="M10 20a1 1 0 0 0 .553.895l2 1A1 1 0 0 0 14 21v-7a2 2 0 0 1 .517-1.341L21.74 4.67A1 1 0 0 0 21 3H3a1 1 0 0 0-.742 1.67l7.225 7.989A2 2 0 0 1 10 14z"/>',
  wait: '<path d="M5 22h14"/><path d="M5 2h14"/><path d="M17 22v-4.172a2 2 0 0 0-.586-1.414L12 12l-4.414 4.414A2 2 0 0 0 7 17.828V22"/><path d="M7 2v4.172a2 2 0 0 0 .586 1.414L12 12l4.414-4.414A2 2 0 0 0 17 6.172V2"/>',
  journey: '<rect width="8" height="8" x="3" y="3" rx="2"/><path d="M7 11v4a2 2 0 0 0 2 2h4"/><rect width="8" height="8" x="13" y="13" rx="2"/>',
  mobile: '<rect width="14" height="20" x="5" y="2" rx="2" ry="2"/><path d="M12 18h.01"/>',
  sms: '<path d="M22 17a2 2 0 0 1-2 2H6.828a2 2 0 0 0-1.414.586l-2.202 2.202A.71.71 0 0 1 2 21.286V5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2z"/>',
  refresh: '<path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8"/><path d="M21 3v5h-5"/><path d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16"/><path d="M8 16H3v5"/>',
  audience: '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><path d="M16 3.128a4 4 0 0 1 0 7.744"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><circle cx="9" cy="7" r="4"/>',
  other: '<path d="M11 10.27 7 3.34"/><path d="m11 13.73-4 6.93"/><path d="M12 22v-2"/><path d="M12 2v2"/><path d="M14 12h8"/><path d="m17 20.66-1-1.73"/><path d="m17 3.34-1 1.73"/><path d="M2 12h2"/><path d="m20.66 17-1.73-1"/><path d="m20.66 7-1.73 1"/><path d="m3.34 17 1.73-1"/><path d="m3.34 7 1.73 1"/><circle cx="12" cy="12" r="2"/><circle cx="12" cy="12" r="8"/>',
  schedule: '<path d="M16 14v2.2l1.6 1"/><path d="M16 2v4"/><path d="M21 7.5V6a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h3.5"/><path d="M3 10h5"/><path d="M8 2v4"/><circle cx="16" cy="16" r="6"/>',
  fileDrop: '<path d="M2 9V5a2 2 0 0 1 2-2h3.9a2 2 0 0 1 1.69.9l.81 1.2a2 2 0 0 0 1.67.9H20a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2v-1"/><path d="M2 13h10"/><path d="m9 16 3-3-3-3"/>',
  trigger: '<path d="M4 14a1 1 0 0 1-.78-1.63l9.9-10.2a.5.5 0 0 1 .86.46l-1.92 6.02A1 1 0 0 0 13 10h7a1 1 0 0 1 .78 1.63l-9.9 10.2a.5.5 0 0 1-.86-.46l1.92-6.02A1 1 0 0 0 11 14z"/>',
  start: '<path d="M5 5a2 2 0 0 1 3.008-1.728l11.997 6.998a2 2 0 0 1 .003 3.458l-12 7A2 2 0 0 1 5 19z"/>',
}

// Hex versions of the colours ActivityIcon.vue uses (light theme).
export const ICON_COLORS = {
  query: '#0284c7', script: '#7c3aed', import: '#059669', extract: '#0d9488', transfer: '#0891b2',
  email: '#ea580c', verification: '#65a30d', filter: '#d97706', wait: '#64748b', journey: '#4f46e5',
  mobile: '#db2777', sms: '#db2777', refresh: '#0284c7', audience: '#c026d3', other: '#4b5563',
}

const PRIMARY = '#0F766E'
const CARD = '#ffffff'
const LANE = '#F3F4F6'
const BORDER = '#E5E7EB'
const TEXT = '#111827'
const MUTED = '#4B5563'
const ARROW = '#9CA3AF'

const esc = (s) => htmlEscape(String(s ?? ''))

// An Automation Studio glyph as an embedded image, or the lucide icon `kind` in white.
function glyph(name, x, y, size, kind = 'other') {
  const href = asIcons.glyphs[name]
  if (href) return `<image x="${x}" y="${y}" width="${size}" height="${size}" href="${esc(href)}"/>`
  const inner = AUTOMATION_ICONS[kind] || AUTOMATION_ICONS.other
  return `<svg x="${x}" y="${y}" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="#ffffff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${inner}</svg>`
}

function sourceSvg(s) {
  const out = [`<g class="source"><title>${esc([s.title, ...s.lines].join(' · '))}</title>`,
    `<rect x="${s.x}" y="${s.y}" width="${s.w}" height="${s.h}" rx="12" fill="${CARD}" stroke="${BORDER}"/>`,
    `<circle cx="${s.x + 26}" cy="${s.y + 24}" r="14" fill="${s.kind === 'none' ? '#94a3b8' : AS_SOURCE}"/>`,
    glyph(AS_SOURCE_GLYPH[s.kind] || AS_SOURCE_GLYPH.none, s.x + 17, s.y + 15, 18, { schedule: 'schedule', fileDrop: 'fileDrop' }[s.kind] || 'start'),
    `<text x="${s.x + 48}" y="${s.y + 28}" font-size="13" font-weight="600" fill="${TEXT}">${esc(s.title)}</text>`]
  s.lines.forEach((line, i) => {
    out.push(`<text x="${s.x + 14}" y="${s.y + 58 + i * 18}" font-size="11" fill="${MUTED}">${esc(wrapText(line, 34, 1)[0] || '')}</text>`)
  })
  out.push('</g>')
  return out.join('')
}

function cardSvg(c) {
  const name = activityGlyph(c.typeId ?? c.typeLabel, AS_GLYPH_BY_TYPE)
  const tile = !asIcons.glyphs[name] || /-white$/.test(name)
  const out = [`<g class="activity"><title>${esc(`${c.label} ${c.typeLabel} · ${c.name}`)}</title>`,
    `<rect x="${c.x}" y="${c.y}" width="${c.w}" height="${c.h}" rx="10" fill="${CARD}" stroke="${BORDER}"/>`,
    tile ? `<rect x="${c.x + 10}" y="${c.y + 8}" width="18" height="18" rx="3" fill="${AS_TILE}"/>` : '',
    glyph(name, c.x + (tile ? 12 : 10), c.y + (tile ? 10 : 8), tile ? 14 : 18, activityIconKind(c.typeId ?? c.typeLabel)),
    `<text x="${c.x + 34}" y="${c.y + 21}" font-size="10" font-weight="600" fill="${TEXT}" letter-spacing="0.4">${esc(c.typeLabel.toUpperCase())}</text>`,
    `<text x="${c.x + c.w - 10}" y="${c.y + 21}" text-anchor="end" font-size="10" fill="${MUTED}">${esc(c.label)}</text>`]
  wrapText(c.name, 30, 2).forEach((line, i) => out.push(`<text x="${c.x + 12}" y="${c.y + 39 + i * 14}" font-size="11" fill="${TEXT}">${esc(line)}</text>`))
  out.push('</g>')
  return out.join('')
}

function laneSvg(col) {
  const out = [`<g class="step"><rect x="${col.x}" y="${col.y}" width="${col.w}" height="${col.h}" rx="14" fill="${LANE}" stroke="${col.running ? PRIMARY : BORDER}"${col.running ? ' stroke-width="2"' : ''}/>`,
    `<text x="${col.x + 14}" y="${col.y + 22}" font-size="12" font-weight="700" fill="${PRIMARY}">${esc(col.label)}</text>`]
  if (col.name) out.push(`<text x="${col.x + 14}" y="${col.y + 39}" font-size="11" fill="${MUTED}">${esc(wrapText(col.name, 32, 1)[0] || '')}</text>`)
  for (const c of col.cards) out.push(cardSvg(c))
  if (!col.cards.length) out.push(`<text x="${col.x + col.w / 2}" y="${col.y + 90}" text-anchor="middle" font-size="11" font-style="italic" fill="${MUTED}">No activities</text>`)
  out.push('</g>')
  return out.join('')
}

/** The automation as an SVG string, drawn like the page's canvas. */
export function automationSvg(details) {
  const m = automationCanvasModel(details)
  const out = [`<svg xmlns="http://www.w3.org/2000/svg" width="${m.width}" height="${m.height}" viewBox="0 0 ${m.width} ${m.height}" font-family="'Segoe UI',Arial,sans-serif" role="img" aria-label="Automation diagram">`,
    `<defs><marker id="tk-auto-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto"><path d="M0 0L10 5L0 10z" fill="${ARROW}"/></marker></defs>`,
    `<rect width="${m.width}" height="${m.height}" fill="${CARD}"/>`]
  for (const a of m.connectors) out.push(`<line x1="${a.x1 + 4}" y1="${a.y1}" x2="${a.x2 - 4}" y2="${a.y2}" stroke="${ARROW}" stroke-width="1.8" marker-end="url(#tk-auto-arrow)"/>`)
  out.push(sourceSvg(m.source))
  for (const col of m.columns) out.push(laneSvg(col))
  out.push('</svg>')
  return out.join('')
}
