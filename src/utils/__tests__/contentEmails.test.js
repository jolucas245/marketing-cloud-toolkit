import { describe, it, expect, vi } from 'vitest'
vi.mock('../sfmcApi.js', () => ({ sfmcFetch: vi.fn() }))
import {
  emailAttributes, fillEmail, responseShape,
  emailSearchBody, toEmailRow, fetchEmailFolders, clearEmailCaches, emailParts,
  fillPersonalization, previewUrls, previewFromResponse, previewWithData,
} from '../contentEmails.js'

describe('Content > Emails (feedback #1054)', () => {
  it('builds the email search for a folder and a text', () => {
    const b = emailSearchBody({ text: 'welcome', folderId: '42' })
    const s = JSON.stringify(b.query)
    expect(s).toContain('"values":[207,208,209]')
    expect(s).toContain('"property":"category.id","simpleOperator":"equal","value":42')
    expect(s).toContain('"property":"views.subjectline.content","simpleOperator":"contains","value":"welcome"')
    expect(emailSearchBody().query).toEqual({ property: 'assetType.id', simpleOperator: 'in', values: [207, 208, 209] })
  })

  it('reads list rows and the legacy email ID', () => {
    const r = toEmailRow({ id: 5, name: 'W', category: { id: 9, name: 'F' }, assetType: { displayName: 'HTML Email' }, views: { subjectline: { content: 'Hi' } }, legacyData: { legacyId: 123 } })
    expect(r).toMatchObject({ id: 5, folderId: '9', folderName: 'F', subject: 'Hi', type: 'HTML Email', legacyId: 123 })
    expect(toEmailRow({ id: 1, data: { email: { legacy: { legacyId: 7 } } } }).legacyId).toBe(7)
  })

  it('lists child folders by name and caches them', async () => {
    clearEmailCaches()
    const fetch = vi.fn(async () => ({ items: [{ id: 3, name: 'b', parentId: 1 }, { id: 2, name: 'a', parentId: 1 }] }))
    const f = await fetchEmailFolders('s1', '1', fetch)
    expect(f.map((x) => x.name)).toEqual(['a', 'b'])
    expect(fetch.mock.calls[0][0]).toContain('$filter=parentId%20eq%201')
    await fetchEmailFolders('s1', '1', fetch)
    expect(fetch).toHaveBeenCalledTimes(1)
  })

  it('fills slots of the HTML view', () => {
    const p = emailParts({ views: { html: { content: '<p>A</p><div data-type="slot" data-key="s1"></div>', slots: { s1: { content: '<b>B</b>' } } }, subjectline: { content: 'S' }, text: { content: 'T' } } })
    expect(p).toMatchObject({ html: '<p>A</p><b>B</b>', subject: 'S', text: 'T' })
  })

  it('fills %%Field%% strings from a row and lists the missing ones', () => {
    const r = fillPersonalization('Hi %%FirstName%% %%=AttributeValue("Last Name")=%% %%=v([Last Name])=%% <%%Nope%%> %%=v(@x)=%% %%[ SET @a = 1 ]%% %%view_email_url%%', { firstname: 'A&B', 'Last Name': 'C' })
    expect(r.html).toBe('Hi A&amp;B C C <%%Nope%%> %%=v(@x)=%% %%[ SET @a = 1 ]%% %%view_email_url%%')
    expect(r.filled.sort()).toEqual(['FirstName', 'Last Name'])
    expect(r.missing).toEqual(['Nope'])
  })

  it('tries the guide/v1 preview by subscriber key, then by row', async () => {
    const urls = previewUrls('s1', { legacyId: 123, deId: 'G', deKey: 'K', subscriberKey: 'a@b', rowNumber: 2 })
    expect(urls[0]).toContain('/guide/v1/emails/123/dataExtension/G/contacts/a%40b/preview?kind=html')
    expect(urls[1]).toContain('/guide/v1/emails/123/dataExtension/G/row/2/preview')
    expect(urls[2]).toContain('/dataExtension/key%3AK/contacts/')
    const fetch = vi.fn()
      .mockRejectedValueOnce(new Error('SFMC API error 404'))
      .mockResolvedValueOnce({ message: { views: [{ contentType: 'vnd.exacttarget.message.email.subjectline', content: 'Hi A' }, { contentType: 'vnd.exacttarget.message.email.htmlbody', content: '<p>A</p>' }] } })
    const r = await previewWithData('s1', { legacyId: 123, deId: 'G', subscriberKey: 'a@b', rowNumber: 2 }, fetch)
    expect(r).toMatchObject({ html: '<p>A</p>', subject: 'Hi A' })
    expect(r.url).toContain('/row/2/')
    await expect(previewWithData('s1', { deId: 'G', rowNumber: 1 }, fetch)).rejects.toThrow('legacy email ID')
    expect(previewFromResponse({})).toBe(null)
  })
  it('lists the attributes an email uses (feedback #1058)', () => {
    const html = '<p>%%FirstName%%</p>%%[ SET @c = AttributeValue("City") IF [Loyalty Tier] == "Gold" THEN ]%%<a href="%%view_email_url%%">x</a>%%=v([First Name])=%% %%=Lookup("DE","F","K","[NotAField]")=%%'
    expect(emailAttributes(html, 'Hi %%firstname%%', '%%xtmonth%% %%Offer%%')).toEqual(['FirstName', 'City', 'Loyalty Tier', 'First Name', 'Offer'])
  })

  it('fills subject and preheader too, and reads them from any preview shape (feedback #1057)', () => {
    const f = fillEmail({ html: '<p>%%Name%%</p>', subject: 'Hi %%Name%%', preheader: 'For %%Name%% %%Missing%%' }, { Name: 'Ada' })
    expect(f).toMatchObject({ html: '<p>Ada</p>', subject: 'Hi Ada', preheader: 'For Ada %%Missing%%', filled: ['Name'], missing: ['Missing'] })
    const p = previewFromResponse({ message: { views: { htmlBody: { contentType: 'vnd.exacttarget.message.email.htmlBody', content: '<p>A</p>' } }, subject: 'Hi Ada', preHeader: 'Pre' } })
    expect(p).toMatchObject({ html: '<p>A</p>', subject: 'Hi Ada', preheader: 'Pre' })
    expect(responseShape({ message: { views: [{ contentType: 'x', content: 'secret' }] } })).toEqual({ message: { views: [{ contentType: 'x', content: 'string' }] } })
  })
})
