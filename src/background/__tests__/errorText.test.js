import { describe, it, expect } from 'vitest'
import { errorText } from '../fetchProxy.js'

describe('errorText', () => {
  it('keeps plain text and JSON as they are', () => {
    expect(errorText('{"message":"x"}')).toBe('{"message":"x"}')
  })
  it('uses the title of a full HTML error page', () => {
    expect(errorText('<!DOCTYPE html><html><head><title>403 - Not Authorized</title></head><body><h1>Server Error</h1></body></html>')).toBe('403 - Not Authorized')
  })
  it('reads the message from Journey Builder\'s HTML fragment', () => {
    const t = '<div class="container error_400"><div class="row"><div id="error"><h1>400</h1><h3>{&quot;message&quot;:&quot;Contact key is required&quot;,&quot;errorcode&quot;:30000}</h3></div></div></div>'
    expect(errorText(t)).toBe('{"message":"Contact key is required","errorcode":30000}')
  })
})
