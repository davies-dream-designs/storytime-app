import { describe, expect, it } from 'vitest'
import { deriveBeatsFromStory } from '@/lib/print-books/beats'
import type { Story } from '@/types'

function createStory(): Story {
  return {
    id: 'story-1',
    userId: 'user-1',
    title: 'Moonlight Garden',
    profileId: 'profile-1',
    profileName: 'Mila',
    wordCount: 120,
    theme: 'kindness',
    notes: '',
    createdAt: '2026-07-15T00:00:00.000Z',
    pages: [
      { pageNumber: 1, text: 'Mila tiptoed into the moonlit garden.', illustrationPrompt: 'A moonlit garden' },
      { pageNumber: 2, text: 'She found a silver key beneath a rose leaf.', illustrationPrompt: 'A silver key under a leaf' },
      { pageNumber: 3, text: 'The key opened a tiny gate where sleepy mice were waiting.', illustrationPrompt: 'A tiny gate and sleepy mice' },
      { pageNumber: 4, text: 'Together they helped a lost firefly find its lantern tree.', illustrationPrompt: 'A firefly and lantern tree' },
      { pageNumber: 5, text: 'Soon the whole garden glowed warm and safe again.', illustrationPrompt: 'A glowing warm garden' },
      { pageNumber: 6, text: 'Mila snuggled into bed, still carrying a little moonlight in her heart.', illustrationPrompt: 'A child falling asleep peacefully' },
    ],
  }
}

describe('deriveBeatsFromStory', () => {
  it('returns one beat per source page in v1', () => {
    const beats = deriveBeatsFromStory(createStory())
    expect(beats).toHaveLength(6)
    expect(beats[0]?.purpose).toBe('setup')
    expect(beats[5]?.purpose).toBe('bedtime_close')
  })

  it('uses illustration prompts as visual intent', () => {
    const beats = deriveBeatsFromStory(createStory())
    expect(beats[1]?.visualIntent).toBe('A silver key under a leaf')
  })

  it('marks the final beats as quiet', () => {
    const beats = deriveBeatsFromStory(createStory())
    expect(beats[4]?.isQuietBeat).toBe(true)
    expect(beats[5]?.isQuietBeat).toBe(true)
  })
})
