import { describe, it, expect } from 'vitest'
import { aiBackgroundStatus, aiStatusToast, AI_STATUS_TEXT } from '../aiBackground.js'

describe('aiBackgroundStatus', () => {
  it('shows nothing while the dialog is open', () => {
    expect(aiBackgroundStatus({ open: true, background: true, state: 'asking' })).toBe(null)
  })
  it('shows nothing for a dialog closed without a running request', () => {
    expect(aiBackgroundStatus({ open: false, background: false, state: 'done' })).toBe(null)
    expect(aiBackgroundStatus({ open: false, background: true, state: 'idle' })).toBe(null)
  })
  it('follows the run while hidden', () => {
    expect(aiBackgroundStatus({ open: false, background: true, state: 'asking' })).toBe('writing')
    expect(aiBackgroundStatus({ open: false, background: true, state: 'done' })).toBe('ready')
    expect(aiBackgroundStatus({ open: false, background: true, state: 'error' })).toBe('failed')
  })
  it('has text for every status', () => {
    for (const s of ['writing', 'ready', 'failed']) expect(AI_STATUS_TEXT[s]).toBeTruthy()
  })
})

describe('aiStatusToast', () => {
  it('toasts when a hidden request ends', () => {
    expect(aiStatusToast('writing', 'ready', 'panel #2')).toMatch(/ready \(panel #2\)/)
    expect(aiStatusToast('writing', 'failed')).toMatch(/failed/)
  })
  it('stays quiet otherwise', () => {
    expect(aiStatusToast(null, 'ready')).toBe('')
    expect(aiStatusToast('writing', null)).toBe('')
    expect(aiStatusToast('ready', null)).toBe('')
  })
})
