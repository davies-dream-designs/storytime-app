import type { ChildProfile, Story } from '@/types'
import type { AgeBand, Beat, BookProject, BookSpread, BookSpreadLayoutType } from '@/types/printBook'

const HARDCOVER_PAGE_COUNT = 32
const INTERIOR_START_PAGE = 5
const INTERIOR_END_PAGE = 28

function getTargetStorySpreadCount(ageBand: AgeBand): number {
  switch (ageBand) {
    case '0-2':
      return 6
    case '3-5':
      return 10
    case '6-8':
      return 12
  }
}

function getHeroSpreadSequences(ageBand: AgeBand, total: number): Set<number> {
  if (total <= 0) return new Set()

  if (ageBand === '0-2') return new Set([Math.min(2, total), Math.max(total - 1, 1)])
  if (ageBand === '3-5') return new Set([Math.min(3, total), Math.max(total - 2, 1)])
  return new Set([Math.min(3, total), Math.ceil(total / 2), Math.max(total - 1, 1)])
}

function buildSceneBrief(beat: Beat): string {
  return [beat.summary, beat.visualIntent].filter(Boolean).join(' ')
}

function splitTextForSpread(text: string, isQuietBeat: boolean): { leftPageText: string; rightPageText: string } {
  const clean = text.replace(/\s+/g, ' ').trim()
  if (isQuietBeat) {
    return { leftPageText: clean, rightPageText: '' }
  }

  const midpoint = Math.ceil(clean.length / 2)
  const breakIndex = clean.indexOf(' ', midpoint)
  if (breakIndex === -1) {
    return { leftPageText: clean, rightPageText: '' }
  }

  return {
    leftPageText: clean.slice(0, breakIndex).trim(),
    rightPageText: clean.slice(breakIndex).trim(),
  }
}

function createSpread(
  bookProjectId: string,
  sequence: number,
  pageStart: number,
  layoutType: BookSpreadLayoutType,
  leftPageText: string,
  rightPageText: string,
  sceneBrief: string,
  illustrationPrompt: string,
  title?: string
): BookSpread {
  return {
    id: `${bookProjectId}:spread:${sequence}`,
    bookProjectId,
    sequence,
    pageStart,
    pageEnd: pageStart + 1,
    layoutType,
    title,
    leftPageText,
    rightPageText,
    sceneBrief,
    illustrationPrompt,
  }
}

function createFrontMatterSpreads(bookProjectId: string, story: Story, profile: ChildProfile): BookSpread[] {
  return [
    createSpread(
      bookProjectId,
      1,
      1,
      'front_matter',
      story.title,
      '',
      `Front cover for ${story.title}`,
      `A magical hardcover picture-book cover for "${story.title}" starring ${profile.name}.`,
      'Cover'
    ),
    createSpread(
      bookProjectId,
      2,
      3,
      'front_matter',
      story.title,
      `Created especially for ${profile.name}.`,
      `Title and dedication pages for ${story.title}`,
      `A gentle title-page illustration motif for "${story.title}".`,
      'Title'
    ),
  ]
}

function createEndMatterSpreads(bookProjectId: string, story: Story, profile: ChildProfile): BookSpread[] {
  return [
    createSpread(
      bookProjectId,
      15,
      29,
      'end_matter',
      `The End.\n\nSweet dreams, ${profile.name}.`,
      'A Storycot story',
      `Closing pages for ${story.title}`,
      `A peaceful closing image for ${profile.name} settling into sleep.`,
      'The End'
    ),
    createSpread(
      bookProjectId,
      16,
      31,
      'end_matter',
      '',
      'Storycot',
      `Back cover for ${story.title}`,
      `A simple back cover design for a Storycot hardcover children's book.`,
      'Back Cover'
    ),
  ]
}

function selectStoryBeats(beats: Beat[], targetSpreadCount: number): Beat[] {
  if (beats.length <= targetSpreadCount) return beats

  const selected: Beat[] = []
  for (let i = 0; i < targetSpreadCount; i += 1) {
    const index = Math.round((i * (beats.length - 1)) / (targetSpreadCount - 1))
    selected.push(beats[index])
  }
  return selected
}

function createStorySpreads(bookProjectId: string, ageBand: AgeBand, beats: Beat[]): BookSpread[] {
  const targetCount = getTargetStorySpreadCount(ageBand)
  const storyBeats = selectStoryBeats(beats, targetCount)
  const heroSpreadSequences = getHeroSpreadSequences(ageBand, storyBeats.length)
  const spreads: BookSpread[] = []
  let pageStart = INTERIOR_START_PAGE
  let sequence = 3

  for (let i = 0; i < storyBeats.length; i += 1) {
    const beat = storyBeats[i]
    const layoutType: BookSpreadLayoutType = beat.isQuietBeat
      ? 'quiet'
      : heroSpreadSequences.has(i + 1)
        ? 'hero'
        : 'text_art'
    const { leftPageText, rightPageText } = splitTextForSpread(beat.textDraft, beat.isQuietBeat)

    spreads.push(
      createSpread(
        bookProjectId,
        sequence,
        pageStart,
        layoutType,
        leftPageText,
        rightPageText,
        buildSceneBrief(beat),
        beat.visualIntent
      )
    )

    pageStart += 2
    sequence += 1
  }

  while (pageStart <= INTERIOR_END_PAGE) {
    const isFinalQuiet = pageStart >= INTERIOR_END_PAGE - 1
    spreads.push(
      createSpread(
        bookProjectId,
        sequence,
        pageStart,
        'quiet',
        isFinalQuiet ? 'A final calm breath before bedtime.' : '',
        '',
        'A quiet visual pause that gives the story room to breathe.',
        'A peaceful children’s-book spread with soft night-time atmosphere and room for reflection.'
      )
    )
    pageStart += 2
    sequence += 1
  }

  return spreads
}

export function composeHardcoverSpreads(input: {
  bookProjectId: string
  story: Story
  profile: ChildProfile
  ageBand: AgeBand
  beats: Beat[]
}): BookSpread[] {
  const { bookProjectId, story, profile, ageBand, beats } = input

  return [
    ...createFrontMatterSpreads(bookProjectId, story, profile),
    ...createStorySpreads(bookProjectId, ageBand, beats),
    ...createEndMatterSpreads(bookProjectId, story, profile),
  ]
}

export function createEmptyBookProject(input: {
  id: string
  userId: string
  sourceStoryId: string
  profileId: string
  ageBand: AgeBand
}): BookProject {
  const now = new Date().toISOString()

  return {
    id: input.id,
    userId: input.userId,
    sourceStoryId: input.sourceStoryId,
    profileId: input.profileId,
    ageBand: input.ageBand,
    status: 'queued',
    trimSize: 'lulu-hardcover-32',
    pageCount: HARDCOVER_PAGE_COUNT,
    spreadCount: HARDCOVER_PAGE_COUNT / 2,
    completedSpreads: 0,
    totalSpreads: HARDCOVER_PAGE_COUNT / 2,
    currentStageLabel: 'Dreaming up the adventure...',
    beats: [],
    spreads: [],
    assets: {
      proofVersion: 0,
    },
    retryCount: 0,
    createdAt: now,
    updatedAt: now,
  }
}
