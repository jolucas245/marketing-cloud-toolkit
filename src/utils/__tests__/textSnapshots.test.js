import { describe, it, expect } from 'vitest'
import { addSnapshot, pruneSnapshots, typingSnapshotDue, SNAPSHOT_MAX, SNAPSHOT_MAX_AGE, TYPING_EVERY } from '../textSnapshots.js'

describe('earlier text (feedback #1028)', () => {
  it('adds newest first, skips empty text and repeats, keeps at most SNAPSHOT_MAX', () => {
    let l = addSnapshot([], 'a', 'clear', 1000)
    l = addSnapshot(l, 'a', 'clear', 2000)
    l = addSnapshot(l, '  ', 'clear', 3000)
    l = addSnapshot(l, 'b', 'open', 4000)
    expect(l.map((s) => s.text)).toEqual(['b', 'a'])
    for (let i = 0; i < 30; i++) l = addSnapshot(l, `t${i}`, 'typing', 5000 + i)
    expect(l).toHaveLength(SNAPSHOT_MAX)
  })
  it('drops copies older than 24 hours', () => {
    expect(pruneSnapshots([{ at: 0, text: 'old' }, { at: SNAPSHOT_MAX_AGE, text: 'new' }], SNAPSHOT_MAX_AGE + 1).map((s) => s.text)).toEqual(['new'])
  })
  it('takes a typing copy every few minutes when the text changed', () => {
    expect(typingSnapshotDue([], 'x', 0)).toBe(true)
    expect(typingSnapshotDue([{ at: 0, text: 'x' }], 'y', TYPING_EVERY - 1)).toBe(false)
    expect(typingSnapshotDue([{ at: 0, text: 'x' }], 'y', TYPING_EVERY)).toBe(true)
    expect(typingSnapshotDue([{ at: 0, text: 'x' }], 'x', TYPING_EVERY)).toBe(false)
  })
})
