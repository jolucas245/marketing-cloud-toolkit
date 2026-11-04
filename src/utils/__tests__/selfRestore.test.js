import { describe, it, expect } from 'vitest'
import { selfRestoreRequest, curlFor, bodyText, selfRestoreSteps, selfRestoreMarkdown, tokenCurl } from '../selfRestore.js'

describe('Restore by myself (feedback #1045)', () => {
  it('builds the request each kind needs', () => {
    expect(selfRestoreRequest({ kind: 'email', id: 5, name: 'News', versionLabel: 'v2', body: {} })).toMatchObject({ method: 'PUT', path: '/asset/v1/content/assets/5' })
    expect(selfRestoreRequest({ kind: 'cloudpage', id: 77, name: 'Spring landing', versionLabel: 'v1', body: {} })).toMatchObject({ method: 'PUT', path: '/asset/v1/content/assets/77', file: 'Spring-landing-v1-body.json' })
    expect(selfRestoreRequest({ kind: 'query', id: 'ab-1', name: 'Q', versionLabel: 'v3', body: {} })).toMatchObject({ method: 'PATCH', path: '/automation/v1/queries/ab-1' })
    expect(selfRestoreRequest({ kind: 'script', id: 'cd', name: 'S', versionLabel: 'v1', body: {} }).path).toBe('/automation/v1/scripts/cd')
  })

  it('gives the body, the command, the token call and the steps, with no secrets', () => {
    const req = selfRestoreRequest({ kind: 'query', id: 'ab-1', name: 'Nightly', versionLabel: 'v3', savedAt: 0, body: { queryText: 'SELECT 1' } })
    expect(JSON.parse(bodyText(req))).toEqual({ queryText: 'SELECT 1' })
    expect(curlFor(req)).toContain('PATCH "https://YOUR_SUBDOMAIN.rest.marketingcloudapis.com/automation/v1/queries/ab-1"')
    expect(curlFor(req)).toContain('--data @Nightly-v3-body.json')
    expect(tokenCurl()).toContain('/v2/token')
    expect(selfRestoreSteps(req).join(' ')).toMatch(/Automations: Write/)
    const md = selfRestoreMarkdown(req)
    expect(md).toMatch(/^# Restore SQL Query activity "Nightly" to v3/)
    expect(md).toContain('YOUR_ACCESS_TOKEN')
  })
})
