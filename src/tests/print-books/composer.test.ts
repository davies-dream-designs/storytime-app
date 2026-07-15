import { describe, expect, it } from 'vitest'
import { composeHardcoverSpreads, createEmptyBookProject } from '@/lib/print-books/composer'
import { deriveBeatsFromStory } from '@/lib/print-books/beats'
import type { ChildProfile, Story } from '@/types'

function createProfile(age: number): ChildProfile {
  return {
    id: 'profile-1',
    userId: 'user-1',
    name: 'Mila',
    age,
    favouriteCharacters: ['Bunny'],
    favouriteActivities: ['painting'],
    favouriteAnimals: ['fox'],
    favouritePlaces: ['garden'],
    lessons: ['kindness'],
    createdAt: '2026-07-15T00:00:00.000Z',
  }
}

function createStory(pageCount: number): Story {
  return {
    id: 'story-1',
    userId: 'user-1',
    title: 'Moonlight Garden',
    profileId: 'profile-1',
    profileName: 'Mila',
    wordCount: pageCount * 20,
    theme: 'kindness',
    notes: '',
    createdAt: '2026-07-15T00:00:00.000Z',
    pages: Array.from({ length: pageCount }, (_, index) => ({
      pageNumber: index + 1,
      text: `Story page ${index + 1} with a gentle bedtime moment and a little adventure.`,
      illustrationPrompt: `Illustration prompt ${index + 1}`,
    })),
  }
}

describe('createEmptyBookProject', () => {
  it('creates a queued 32-page hardcover project shell', () => {
    const project = createEmptyBookProject({
      id: 'book-1',
      userId: 'user-1',
      sourceStoryId: 'story-1',
      profileId: 'profile-1',
      ageBand: '3-5',
    })

    expect(project.status).toBe('queued')
    expect(project.pageCount).toBe(32)
    expect(project.spreadCount).toBe(16)
  })
})

describe('composeHardcoverSpreads', () => {
  it('always composes to 16 spreads covering 32 pages', () => {
    const story = createStory(10)
    const spreads = composeHardcoverSpreads({
      bookProjectId: 'book-1',
      story,
      profile: createProfile(4),
      ageBand: '3-5',
      beats: deriveBeatsFromStory(story),
    })

    expect(spreads).toHaveLength(16)
    expect(spreads[0]?.pageStart).toBe(1)
    expect(spreads[15]?.pageEnd).toBe(32)
  })

  it('creates more quiet pacing for the youngest age band', () => {
    const story = createStory(6)
    const spreads = composeHardcoverSpreads({
      bookProjectId: 'book-1',
      story,
      profile: createProfile(2),
      ageBand: '0-2',
      beats: deriveBeatsFromStory(story),
    })

    const quietCount = spreads.filter((spread) => spread.layoutType === 'quiet').length
    expect(quietCount).toBeGreaterThanOrEqual(4)
    expect(spreads.some((spread) => spread.leftPageText.includes('Mila'))).toBe(true)
    expect(spreads.some((spread) => spread.sceneBrief.includes('Story page'))).toBe(true)
  })

  it('keeps front matter and end matter fixed', () => {
    const story = createStory(12)
    const spreads = composeHardcoverSpreads({
      bookProjectId: 'book-1',
      story,
      profile: createProfile(7),
      ageBand: '6-8',
      beats: deriveBeatsFromStory(story),
    })

    expect(spreads[0]?.layoutType).toBe('front_matter')
    expect(spreads[1]?.layoutType).toBe('front_matter')
    expect(spreads[14]?.layoutType).toBe('end_matter')
    expect(spreads[15]?.layoutType).toBe('end_matter')
  })

  it('derives extra interior spreads from the story instead of using only generic filler', () => {
    const story = createStory(4)
    const spreads = composeHardcoverSpreads({
      bookProjectId: 'book-1',
      story,
      profile: createProfile(2),
      ageBand: '0-2',
      beats: deriveBeatsFromStory(story),
    })

    const interiorSpreads = spreads.slice(2, 14)
    expect(interiorSpreads.some((spread) => spread.leftPageText.includes('Story page 1'))).toBe(true)
    expect(
      interiorSpreads.some((spread) => spread.illustrationPrompt.includes('toddler board-book style'))
    ).toBe(true)
  })
})
