// Send results on the To Test page (user, 2026-11-04): one feedback row with every
// item's result and note, so test results reach the developer, not just failures.

const LABEL = { pass: 'PASS', fail: 'FAIL', skip: 'SKIP' }

/**
 * @param {Array<{version, items: Array<{id, title, ref?}>}>} groups  TO_TEST
 * @param {Record<string, {result, at, note?}>} results
 * @param {string} commit  test build commit
 * @returns {{ message: string, details: string, counts: {pass, fail, skip, open, total} }}
 */
export function testResultsReport(groups, results, commit) {
  const counts = { pass: 0, fail: 0, skip: 0, open: 0, total: 0 }
  const lines = [`Test build: ${commit || 'unknown'}`, `Sent: ${new Date().toISOString()}`]
  for (const g of groups || []) {
    lines.push('', `Version ${g.version}`)
    for (const item of g.items || []) {
      counts.total++
      const r = results?.[item.id]
      const tag = r && LABEL[r.result] ? LABEL[r.result] : 'NOT DONE'
      if (r && LABEL[r.result]) counts[r.result]++
      else counts.open++
      lines.push(`- ${tag}: ${item.title}${item.ref ? ` (${item.ref})` : ''} [${item.id}]`)
      const note = String(r?.note || '').trim()
      if (note) lines.push(`  Note: ${note.replace(/\s+/g, ' ')}`)
    }
  }
  const message = `[To Test results] ${commit || 'unknown build'}: ${counts.pass} pass, ${counts.fail} fail, ${counts.skip} skip, ${counts.open} not done (of ${counts.total})`
  return { message, details: lines.join('\n'), counts }
}
