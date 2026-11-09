import { describe, it, expect } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'

describe("What's New (feedback #1083)", () => {
  it('keeps the title and close in a fixed header, scrolls the list, shows earlier news on request, closes on Esc', async () => {
    const store = { _seenVersion: '2.0.21' }
    globalThis.chrome = { storage: { local: { get: (k, cb) => cb({ ...store }), set: (o) => Object.assign(store, o) } } }
    const { default: WhatsNew } = await import('../WhatsNew.vue')
    const w = mount(WhatsNew, { attachTo: document.body })
    await flushPromises()
    const dialog = w.find('[data-whatsnew]')
    expect(dialog.classes()).toContain('max-h-[calc(100vh-2rem)]')
    expect(w.find('#whatsnew-title').text()).toBe("What's new in Marketing Cloud Toolkit")
    expect(w.find('ul').classes()).toContain('overflow-y-auto')
    expect(w.text()).toContain('Ask an AI')
    expect(w.text()).not.toContain('Customize Home')
    expect(w.text()).not.toContain('Run trends further back')
    await w.find('[data-whatsnew-earlier]').trigger('click')
    expect(w.text()).toContain('Run trends further back')
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }))
    await flushPromises()
    expect(w.find('[data-whatsnew]').exists()).toBe(false)
    expect(store._seenVersion).not.toBe('2.0.21')
    w.unmount()
  })
})
