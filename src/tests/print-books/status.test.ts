import { describe, expect, it } from 'vitest'
import { getBookProjectStageLabel } from '@/lib/print-books/status'

describe('getBookProjectStageLabel', () => {
  it('returns magical labels for planning states', () => {
    expect(getBookProjectStageLabel('queued')).toBe('Dreaming up the adventure...')
    expect(getBookProjectStageLabel('illustrating')).toBe('Painting moonlit pages...')
    expect(getBookProjectStageLabel('ready')).toBe('Your print book is ready for review.')
  })
})
