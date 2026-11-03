// The Automation Summary tab on Automation Studio pages (public/automationPanel.js):
// one automation with every step's activities described (the same descriptions as the
// app's automation page: describeActivity), read here so the content script needs no
// SFMC access of its own. Only reads. Activity details load 4 at a time.
import { sfmcFetch } from './fetchProxy.js'
import { activityEndpoint, describeActivity } from '../utils/activityTypes.js'

const AS = (stack) => `https://mc.${stack}.marketingcloudapps.com/AutomationStudioFuel3/fuelapi`
const CODE_MAX = 6000
const ROWS_MAX = 12

const cell = (v) => (v == null ? '' : typeof v === 'object' ? (v.text ?? v.label ?? JSON.stringify(v)) : String(v))

/** Plain rows and code for the panel (it renders text only). */
export function panelActivity(desc, raw) {
  return {
    type: desc.typeLabel,
    title: desc.title || raw?.name || '',
    rows: (desc.main || []).map(([k, v]) => [String(k), cell(v).trim()]).filter(([, v]) => v !== '' && v !== '\u2014' && v !== '-').slice(0, ROWS_MAX),
    code: desc.code?.text ? { text: String(desc.code.text).slice(0, CODE_MAX), cut: String(desc.code.text).length > CODE_MAX } : null,
    note: desc.note || null,
  }
}

export async function automationSummary(stack, id, fetcher = sfmcFetch) {
  if (!/^s\d+$/i.test(String(stack || '')) || !/^[A-Za-z0-9-]+$/.test(String(id || ''))) throw new Error('Not an automation.')
  const d = await fetcher({ url: `${AS(stack)}/automation/v1/automations/${encodeURIComponent(id)}` })
  const steps = (d?.steps || []).map((s) => ({ name: s.name || '', activities: (s.activities || []).map((a) => ({ raw: a, out: null })) }))
  const all = steps.flatMap((s) => s.activities)
  let next = 0
  async function worker() {
    while (next < all.length) {
      const item = all[next++]
      const a = item.raw
      try {
        const url = activityEndpoint(stack, a)
        const details = url ? await fetcher({ url }) : { ...a, _fromStep: true }
        item.out = panelActivity(describeActivity(a.objectTypeId, details, stack), a)
      } catch (e) {
        item.out = { ...panelActivity(describeActivity(a.objectTypeId, { ...a, _fromStep: true }, stack), a), error: e.message }
      }
    }
  }
  await Promise.all(Array.from({ length: Math.min(4, all.length) }, worker))
  return {
    name: d?.name || '', status: d?.status ?? null, lastRunTime: d?.lastRunTime || null, lastRunStatus: d?.lastRunStatus || null,
    schedule: d?.schedule ? { status: d.schedule.scheduleStatus ?? null, next: d.schedule.scheduledTime || null } : null,
    type: d?.type || null, key: d?.key || null, description: d?.description || '',
    steps: steps.map((s) => ({ name: s.name, activities: s.activities.map((x) => x.out) })),
  }
}
