// Automation Studio's health summary for one automation, as chips for Run history.
// Live shape (s10, 2026-11-07): { id, successCount, successPercentage: '100%', errorCount,
// errorPercentage: '0%', averageTime: '92', count: '1', hasChanged: false }. averageTime is
// in seconds (a run from 20:04:05.9 to 20:05:38.4 gave '92'). It used to be shown as raw
// keys: "Id", "Has Changed: false", "Average Time: 92".
import { durationText } from './preloadSteps.js'

const num = (v) => {
  if (v == null || String(v).trim() === '') return null
  const n = Number(String(v).replace('%', ''))
  return Number.isFinite(n) ? n : null
}

/** [{ label, value }] for the chips; [] when SFMC sent nothing useful. */
export function healthChips(health) {
  const h = health && typeof health === 'object' && health.data && typeof health.data === 'object' ? health.data : health
  if (!h || typeof h !== 'object') return []
  const chips = []
  const count = num(h.count)
  if (count != null) chips.push({ label: 'Runs', value: count.toLocaleString() })
  const ok = num(h.successCount)
  if (ok != null) chips.push({ label: 'Succeeded', value: h.successPercentage ? `${ok} (${h.successPercentage})` : String(ok) })
  const failed = num(h.errorCount)
  if (failed != null) chips.push({ label: 'Failed', value: h.errorPercentage ? `${failed} (${h.errorPercentage})` : String(failed), tone: failed ? 'bad' : '' })
  const avg = num(h.averageTime)
  if (avg != null) chips.push({ label: 'Average run', value: durationText(avg * 1000) })
  return chips
}
