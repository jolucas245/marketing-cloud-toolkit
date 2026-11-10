// AI answers come back as Markdown (feedback #1096): bullets, **bold**, `code`, headings,
// code blocks. This reads that small subset into blocks of text segments, so the dialog
// can draw them with plain Vue text bindings (no v-html: the answer is model output).

/** Inline segments: [{ text, bold, italic, code }]. */
export function parseInline(line) {
  const out = []
  const s = String(line ?? '')
  // `code`, **bold** or __bold__, *italic* or _italic_ (not inside words for _).
  const re = /`([^`]+)`|\*\*(.+?)\*\*|__(.+?)__|\*(?!\s)([^*]+?)\*|(?<![\w])_(?!\s)([^_]+?)_(?![\w])/g
  let last = 0
  let m
  while ((m = re.exec(s))) {
    if (m.index > last) out.push({ text: s.slice(last, m.index) })
    if (m[1] != null) out.push({ text: m[1], code: true })
    else if (m[2] != null || m[3] != null) {
      // Bold may hold italic or code inside; keep it simple: bold text, inner marks read too.
      for (const seg of parseInline(m[2] ?? m[3])) out.push({ ...seg, bold: true })
    } else out.push({ text: m[4] ?? m[5], italic: true })
    last = re.lastIndex
  }
  if (last < s.length) out.push({ text: s.slice(last) })
  return out.filter((x) => x.text !== '')
}

const BULLET = /^(\s*)[-*+•]\s+(.*)$/
const NUMBER = /^(\s*)(\d+)[.)]\s+(.*)$/
const HEADING = /^\s{0,3}(#{1,6})\s+(.*?)\s*#*\s*$/
const FENCE = /^\s*(```|~~~)/

/**
 * Blocks: { type: 'p', parts } | { type: 'h', level, parts } | { type: 'ul' | 'ol', items:
 * [{ parts, indent }], start } | { type: 'code', text } | { type: 'hr' }.
 */
export function parseAnswer(text) {
  const lines = String(text ?? '').replace(/\r\n?/g, '\n').split('\n')
  const blocks = []
  let para = []
  let list = null
  const flushPara = () => {
    if (para.length) blocks.push({ type: 'p', parts: parseInline(para.join(' ')) })
    para = []
  }
  const flushList = () => {
    if (list) blocks.push(list)
    list = null
  }
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    if (FENCE.test(line)) {
      flushPara(); flushList()
      const fence = line.trim().slice(0, 3)
      const body = []
      while (++i < lines.length && !lines[i].trim().startsWith(fence)) body.push(lines[i])
      blocks.push({ type: 'code', text: body.join('\n') })
      continue
    }
    if (!line.trim()) { flushPara(); flushList(); continue }
    if (/^\s*([-*_])(\s*\1){2,}\s*$/.test(line)) { flushPara(); flushList(); blocks.push({ type: 'hr' }); continue }
    const h = line.match(HEADING)
    if (h) { flushPara(); flushList(); blocks.push({ type: 'h', level: h[1].length, parts: parseInline(h[2]) }); continue }
    const b = line.match(BULLET)
    const n = b ? null : line.match(NUMBER)
    if (b || n) {
      flushPara()
      const type = b ? 'ul' : 'ol'
      if (!list || list.type !== type) { flushList(); list = { type, items: [], start: n ? Number(n[2]) : 1 } }
      const indent = Math.min(3, Math.floor((b ? b[1] : n[1]).replace(/\t/g, '    ').length / 2))
      list.items.push({ parts: parseInline(b ? b[2] : n[3]), indent })
      continue
    }
    // A line under a list item that is indented continues it.
    if (list && /^\s{2,}\S/.test(line)) {
      const item = list.items[list.items.length - 1]
      item.parts.push({ text: ' ' }, ...parseInline(line.trim()))
      continue
    }
    flushList()
    para.push(line.trim())
  }
  flushPara(); flushList()
  return blocks
}
