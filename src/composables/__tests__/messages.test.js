import { describe, it, expect, vi, beforeEach } from 'vitest'
import { showToast, messages, dismissMessage, guessKind } from '../useToast.js'
import { askConfirm, answerConfirm, confirmState } from '../useConfirm.js'

describe('messages (feedback #1050)', () => {
  beforeEach(() => { for (const m of [...messages.value]) dismissMessage(m.id) })

  it('guesses the kind from the words', () => {
    expect(guessKind('SFMC did not start "X": SFMC API error 404')).toBe('error')
    expect(guessKind('Could not copy.')).toBe('error')
    expect(guessKind('Copied.')).toBe('success')
    expect(guessKind('Deleted 3 emails from Marketing Cloud Toolkit.')).toBe('success')
    expect(guessKind('Every email already has 5 version(s) or fewer.')).toBe('info')
  })

  it('keeps errors until closed, closes the rest by itself, no duplicates', () => {
    vi.useFakeTimers()
    showToast('Copied.')
    showToast('Could not save: 500')
    showToast('Copied.')
    expect(messages.value.map((m) => m.message)).toEqual(['Could not save: 500', 'Copied.'])
    vi.advanceTimersByTime(7000)
    expect(messages.value.map((m) => m.kind)).toEqual(['error'])
    vi.useRealTimers()
  })
})

describe('askConfirm', () => {
  it('resolves with the answer and closes', async () => {
    const p = askConfirm({ title: 'Delete?', danger: true })
    expect(confirmState.value.title).toBe('Delete?')
    answerConfirm(true)
    expect(await p).toBe(true)
    expect(confirmState.value).toBeNull()
  })
  it('a second question cancels the first', async () => {
    const first = askConfirm({ title: 'A' })
    const second = askConfirm({ title: 'B' })
    expect(await first).toBe(false)
    answerConfirm(false)
    expect(await second).toBe(false)
  })
})
