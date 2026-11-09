import { describe, it, expect } from 'vitest'
import { buildDePrompt, parseDefinition, looksLikeDefinition } from '../createDE/definition.js'
import { checkCreateForm, isFormValid, buildFields } from '../createDE/createDE.js'

describe('Create DE: prompt for AI and its definition (feedback #1084)', () => {
  it('builds a prompt with the description, the SFMC rules and an example that the reader accepts', () => {
    const p = buildDePrompt('orders for confirmation emails')
    expect(p).toContain('orders for confirmation emails')
    expect(p).toContain('Text, Number, Decimal, Date, Boolean, EmailAddress, Phone, Locale')
    expect(p).toContain('A primary key field must also be required')
    expect(buildDePrompt('')).toContain('<describe what the data extension should hold')
    const example = p.slice(p.indexOf('```json'))
    const def = parseDefinition(example)
    expect(def.notes).toEqual([])
    const settings = { name: '', folderId: 5, ...def.settings }
    expect(isFormValid(checkCreateForm(settings, def.fields))).toBe(true)
  })

  it('reads an answer with text around the code block, aliases and the current date', () => {
    const answer = `Sure! Here it is:
\`\`\`json
{ "dataExtension": { "name": "Loyalty Members", "isSendable": "true", "sendField": "contactkey",
    "retention": { "mode": "all", "length": 6, "unit": "months" } },
  "fields": [
    { "name": "ContactKey", "type": "string", "length": 254, "primaryKey": true },
    { "name": "Email", "type": "email" },
    { "name": "Points", "type": "Integer", "required": true },
    { "name": "Balance", "type": "money", "precision": 12, "scale": 2 },
    { "name": "JoinedAt", "type": "datetime", "default": "now" },
    { "name": "Tier", "type": "enum" }
  ],
  "sampleRows": [ { "contactkey": "C1", "Email": "a@example.com", "Points": 10 } ] }
\`\`\`
Let me know if you need changes.`
    expect(looksLikeDefinition(answer)).toBe(true)
    const d = parseDefinition(answer)
    expect(d.fields.map((f) => f.type)).toEqual(['Text', 'EmailAddress', 'Number', 'Decimal', 'Date', 'Text'])
    expect(d.fields[0]).toMatchObject({ isPrimaryKey: true, isNullable: false, length: 254 })
    expect(d.fields[2].isNullable).toBe(false)
    expect(d.fields[3]).toMatchObject({ length: 12, scale: 2 })
    expect(d.fields[4]).toMatchObject({ currentDate: true, defaultValue: '' })
    expect(d.settings).toMatchObject({ name: 'Loyalty Members', isSendable: true, sendField: 'ContactKey', retention: { mode: 'all', length: 6, unit: 5 } })
    expect(d.notes).toEqual(['Tier: type "enum" is not an SFMC type, so it is Text.'])
    expect(d.sample.rows).toEqual([['C1', 'a@example.com', '10', '', '', '']])
    expect(d.fields.map((f) => f.src)).toEqual([0, 1, 2, 3, 4, 5])
    expect(buildFields(d.fields)[4].defaultValue).toBe('getdate()')
  })

  it('says what is wrong with an answer it cannot use', () => {
    expect(() => parseDefinition('no json here')).toThrow(/not valid JSON/)
    expect(() => parseDefinition('{"name":"x"}')).toThrow(/no "fields" list/)
    expect(() => parseDefinition('{"fields":[]}')).toThrow(/no fields/)
    expect(looksLikeDefinition('[{"a":1}]')).toBe(false)
    expect(parseDefinition('{"isSendable":true,"sendField":"Nope","fields":[{"name":"A"}]}').notes[0]).toMatch(/Nope/)
  })
})
