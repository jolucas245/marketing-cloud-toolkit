import { describe, it, expect } from 'vitest'
import { SFMC_APPS, resolveUrl } from '../apps.js'

describe('dataUi app (feedback #68)', () => {
  it('is known for mc-data-ui URLs but on demand only', () => {
    const r = resolveUrl('https://mc-data-ui.s4.marketingcloudapps.com/fuelapi/data/v1/customobjects/storageDetails')
    expect(r.app?.id).toBe('dataUi')
    expect(r.stack).toBe('s4')
    const app = SFMC_APPS.find((a) => a.id === 'dataUi')
    expect(app.onDemand).toBe(true)
    expect(app.bearer).toBe(true)
  })
})

describe('Setup apps (user, 2026-11-05)', () => {
  it.each([
    ['https://email-app.s12.marketingcloudapps.com/fuelapi/messaging/v1/domainverification?$page=1', 'emailApp'],
    ['https://custom-domains-ui.s12.marketingcloudapps.com/fuelapi/internal/v1/ssl/customdomains/', 'customDomains'],
    ['https://mc-domainwhitelist-admin-app.s12.marketingcloudapps.com/fuelapi/platform/v1/endpoints', 'domainAllowlist'],
  ])('%s is %s, on demand, with its own session and a Setup login link', (url, id) => {
    const r = resolveUrl(url)
    expect(r).toMatchObject({ stack: 's12', family: 'mca' })
    expect(r.app?.id).toBe(id)
    expect(r.app.onDemand).toBe(true)
    expect(r.app.bearer).toBe(false)
    expect(r.app.probeUrl('s12')).toMatch(/^https:\/\/[a-z-]+\.s12\.marketingcloudapps\.com\/fuelapi\//)
    expect(r.app.landings('s12').some((u) => u === 'https://mc.s12.exacttarget.com/cloud/#app/Setup')).toBe(true)
  })
})
