// The journey canvas as a standalone SVG for the HTML and PDF downloads (feedback #1009).
// It draws the same model as the interactive canvas (journeyCanvasModel: positions, shapes,
// colours, icons, routed paths, path labels and join points), so the download matches what
// JourneyCanvas.vue and JourneyActivityNode.vue show. Remote Einstein icons are not loaded:
// the built-in icon is drawn instead, so a download never fetches anything.
import { htmlEscape } from './exportDoc.js'
import { journeyCanvasModel, JOURNEY_ICON_PATHS, ACTIVITY_WIDTH, ACTIVITY_HEIGHT } from './journeyCanvas.js'

const PAD = 24
const CX = ACTIVITY_WIDTH / 2 // symbol centre, as in JourneyActivityNode.vue
const CY = 26
const CONNECTOR = '#c4d8e8'
const CARD = '#ffffff'
const TEXT = '#1a1a1a'
const MUTED = '#64748b'
const BORDER = '#e2e8f0'

const esc = (s) => htmlEscape(String(s ?? ''))
const num = (n) => Math.round(n * 10) / 10
// Rough text widths for the canvas fonts (11px names, 10px labels).
const width11 = (s) => s.length * 6.1
const width10 = (s) => s.length * 5.5

/** Up to `lines` lines of at most `max` characters, the last one cut with an ellipsis. */
export function wrapText(text, max = 24, lines = 2) {
  const words = String(text ?? '').split(/\s+/).filter(Boolean)
  const out = []
  let line = ''
  for (let i = 0; i < words.length; i++) {
    let word = words[i]
    while (word.length > max) {
      if (line) { out.push(line); line = '' }
      out.push(word.slice(0, max)); word = word.slice(max)
    }
    const next = line ? `${line} ${word}` : word
    if (next.length > max) { out.push(line); line = word } else line = next
    if (out.length >= lines) break
  }
  if (line && out.length < lines) out.push(line)
  const full = words.join(' ')
  const kept = out.slice(0, lines)
  if (kept.join(' ').length < full.length) {
    const last = kept[kept.length - 1] || ''
    kept[kept.length - 1] = (last.length >= max ? last.slice(0, max - 1) : last) + '…'
  }
  return kept
}

const cut = (s, n) => { const t = String(s ?? ''); return t.length > n ? t.slice(0, n - 1) + '…' : t }

// The icon, with the same fill and stroke rules as JourneyActivityNode.vue.
function iconSvg(icon, color, size) {
  const paths = JOURNEY_ICON_PATHS[icon] || JOURNEY_ICON_PATHS.custom
  const filled = ['push', 'line', 'sessionTransfer', 'mobile', 'inbox', 'whatsapp', 'sms', 'contact', 'waitDate', 'waitAttribute', 'waitChat', 'waitEvent', 'waitInApp'].includes(icon) || icon.startsWith('salesforce')
  const strokeWidth = icon === 'optimizer' ? 1.2 : icon === 'engagement' ? 1.4 : icon === 'decision' ? 2.4 : 1.7
  const at = num(CX - size / 2), top = num(CY - size / 2)
  const out = [`<svg x="${at}" y="${top}" width="${size}" height="${size}" viewBox="0 0 24 24" color="#ffffff" fill="none" stroke="currentColor" stroke-width="${strokeWidth}" stroke-linecap="${icon === 'decision' ? 'butt' : 'round'}" stroke-linejoin="round">`]
  paths.forEach((d, index) => {
    const fill = filled || (icon === 'email' && index === 0) ? 'currentColor' : 'none'
    const stroke = filled ? 'none' : icon === 'email' ? (index === 0 ? 'none' : color) : 'currentColor'
    out.push(`<path d="${esc(d)}" fill="${fill}" stroke="${stroke}"${icon.startsWith('salesforce') ? ' fill-rule="evenodd"' : ''}${icon === 'email' ? ' stroke-width="1.1"' : ''}/>`)
  })
  if (icon === 'random') out.push(`<g fill="currentColor" stroke="none">${[5, 12, 19].map((y) => `<circle cx="17" cy="${y}" r="2.5"/>`).join('')}</g>`)
  if (icon === 'winner') out.push('<g fill="currentColor" stroke="none"><circle cx="6" cy="4" r="1.4"/><path d="M9 5c1.2-.8 2.4-.7 3.7-.4v3L9 8.2ZM16.3 5.7c1.2.2 2.4.1 3.7-.7v3l-3.7.7ZM12.7 7.6l3.6 1.1v3l-3.6-1.1ZM9 11.2l3.7-.6v3c-1.3-.3-2.5-.4-3.7.4ZM16.3 11.7L20 11v3c-1.3.5-2.5.5-3.7.4Z"/></g>')
  if (icon === 'optimizer') out.push(`<g><path d="M7 13.5c2 1.5 3.7-1.2 5.8-.4l1.2.5-1.4 2.4H11v3.4H5.3c-.5 0-.8-.5-.5-1Z" fill="currentColor" stroke="none"/><path d="M20 14h-5v8h5M12 18h8"/>${[14, 18, 22].map((y) => `<circle cx="20" cy="${y}" r="1.3" fill="currentColor" stroke="none"/>`).join('')}</g>`)
  if (icon === 'engagement') out.push('<path d="M12 10 22 18h-5l3 4-2.7 1.7-3-4.5-2.3 2.8Z" fill="currentColor" stroke="none"/>')
  out.push('</svg>')
  return out.join('')
}

function symbolSvg(shape, color) {
  if (shape === 'circle') return `<circle cx="${CX}" cy="${CY}" r="22" fill="${color}"/>`
  if (shape === 'diamond') return `<rect x="${CX - 17}" y="${CY - 17}" width="34" height="34" rx="4" fill="${color}" transform="rotate(45 ${CX} ${CY})"/>`
  return `<rect x="${CX - 22}" y="${CY - 22}" width="44" height="44" rx="7" fill="${color}"/>`
}

function nodeSvg(node) {
  const { x, y } = node.position
  const d = node.data
  const { shape, color, icon } = d.visual
  // Text sits on the card colour where connectors pass under it (branch exits, Winner).
  const masked = d.branchExit || icon === 'winner'
  const out = [`<g class="activity" transform="translate(${num(x)},${num(y)})"><title>${esc(`${d.typeLabel} · ${d.name}${d.summary ? ` · ${d.summary}` : ''}`)}</title>`,
    symbolSvg(shape, color), iconSvg(icon, color, shape === 'diamond' ? 23 : 25)]
  const lines = wrapText(d.name, 24, 2)
  let top = 58
  if (masked && lines.length) {
    const w = Math.min(156, Math.max(...lines.map(width11)) + 8)
    out.push(`<rect x="${num(CX - w / 2)}" y="${top}" width="${num(w)}" height="${lines.length * 15}" fill="${CARD}"/>`)
  }
  lines.forEach((line, i) => out.push(`<text x="${CX}" y="${top + 11 + i * 15}" text-anchor="middle" font-size="11" font-weight="500" fill="${TEXT}">${esc(line)}</text>`))
  top += lines.length * 15
  if (d.summary) {
    const summary = cut(d.summary, 27)
    if (masked) out.push(`<rect x="${num(CX - (width10(summary) + 8) / 2)}" y="${top + 3}" width="${num(width10(summary) + 8)}" height="14" fill="${CARD}"/>`)
    out.push(`<text x="${CX}" y="${top + 13}" text-anchor="middle" font-size="10" fill="${MUTED}">${esc(summary)}</text>`)
  }
  out.push('</g>')
  return out.join('')
}

function labelSvg(x, y, text) {
  const label = cut(text, 28)
  const w = Math.min(160, width10(label) + 12)
  return `<g><rect x="${num(x - w / 2)}" y="${num(y - 8)}" width="${num(w)}" height="16" rx="3" fill="${CARD}" stroke="${BORDER}"/>`
    + `<text x="${num(x)}" y="${num(y + 3.5)}" text-anchor="middle" font-size="10" fill="${MUTED}">${esc(label)}</text></g>`
}

function junctionSvg(j) {
  const text = `${j.count} ${j.count === 1 ? 'Join' : 'Joins'}`
  const w = width10(text) + 6
  return `<g><title>${esc(j.description)}</title><circle cx="${num(j.x)}" cy="${num(j.y)}" r="8" fill="${j.color}" stroke="${CARD}"/>`
    + `<rect x="${num(j.x - w / 2)}" y="${num(j.y + 14)}" width="${num(w)}" height="14" fill="${CARD}"/>`
    + `<text x="${num(j.x)}" y="${num(j.y + 24.5)}" text-anchor="middle" font-size="10" fill="${TEXT}">${esc(text)}</text></g>`
}

function pathPoints(d) {
  const points = []
  let x = 0, y = 0
  for (const [, cmd, a, b] of String(d).matchAll(/([MHV])\s*(-?[\d.]+)(?:,(-?[\d.]+))?/g)) {
    if (cmd === 'M') { x = Number(a); y = Number(b) } else if (cmd === 'H') x = Number(a); else y = Number(a)
    points.push([x, y])
  }
  return points
}

/** The journey as an SVG string, drawn like the interactive canvas. */
export function journeySvg(graph, layout, orientation = 'horizontal') {
  const { nodes, edges } = journeyCanvasModel(graph, layout, orientation)
  const activities = nodes.filter((n) => n.type === 'journeyActivity')
  // Bounds of everything drawn.
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity
  const take = (x, y) => { minX = Math.min(minX, x); minY = Math.min(minY, y); maxX = Math.max(maxX, x); maxY = Math.max(maxY, y) }
  for (const n of activities) { take(n.position.x, n.position.y); take(n.position.x + ACTIVITY_WIDTH, n.position.y + ACTIVITY_HEIGHT) }
  for (const e of edges) {
    for (const [x, y] of pathPoints(e.data.path)) take(x, y)
    if (e.data.label) { take(e.data.x - 80, e.data.y - 8); take(e.data.x + 80, e.data.y + 8) }
    if (e.data.junction) { take(e.data.junction.x - 20, e.data.junction.y - 8); take(e.data.junction.x + 20, e.data.junction.y + 28) }
  }
  if (!Number.isFinite(minX)) { minX = 0; minY = 0; maxX = 0; maxY = 0 }
  const w = Math.ceil(maxX - minX + PAD * 2), h = Math.ceil(maxY - minY + PAD * 2)
  const out = [`<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" font-family="'Segoe UI',Arial,sans-serif" role="img" aria-label="Journey diagram">`,
    `<rect width="${w}" height="${h}" fill="${CARD}"/>`,
    `<g transform="translate(${num(PAD - minX)},${num(PAD - minY)})">`]
  for (const e of edges) out.push(`<path d="${esc(e.data.path)}" fill="none" stroke="${CONNECTOR}" stroke-width="1.7"/>`)
  for (const n of activities) out.push(nodeSvg(n))
  for (const e of edges) {
    if (e.data.label) out.push(labelSvg(e.data.x, e.data.y, e.data.label))
    if (e.data.junction) out.push(junctionSvg(e.data.junction))
  }
  out.push('</g></svg>')
  return out.join('')
}
