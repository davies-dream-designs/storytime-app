import type { ChildProfile, Story } from '@/types'
import type {
  AgeBand,
  Beat,
  BookProject,
  BookSpread,
  BookSpreadLayoutType,
  CharacterBible,
} from '@/types/printBook'
import { buildIllustrationDirection } from '@/lib/print-books/characterBible'

const HARDCOVER_PAGE_COUNT = 32
const INTERIOR_START_PAGE = 5
const INTERIOR_END_PAGE = 28
const MAX_INTERIOR_STORY_SPREADS = (INTERIOR_END_PAGE - INTERIOR_START_PAGE + 1) / 2

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
  return beat.summary
}

function getFirstSentence(text: string): string {
  const clean = text.replace(/\s+/g, ' ').trim()
  const match = clean.match(/^.*?[.!?](?:\s|$)/)
  return (match?.[0] ?? clean).trim()
}

function clampText(text: string, maxLength: number): string {
  if (text.length <= maxLength) return text
  return `${text.slice(0, maxLength - 3).trimEnd()}...`
}

function splitIntoSentences(text: string): string[] {
  const clean = text.replace(/\s+/g, ' ').trim()
  if (!clean) return []

  const matches = clean.match(/[^.!?]+[.!?]+(?:\s|$)|[^.!?]+$/g)
  return (matches ?? [clean]).map((sentence) => sentence.trim()).filter(Boolean)
}

function splitLongSentence(text: string): { leftPageText: string; rightPageText: string } {
  const clauses = text.split(/(?<=,|;|:)\s+/).map((clause) => clause.trim()).filter(Boolean)
  if (clauses.length < 2) return { leftPageText: text, rightPageText: '' }

  const targetLength = text.length / 2
  let left = ''

  for (const clause of clauses) {
    const candidate = left ? `${left} ${clause}` : clause
    if (candidate.length <= targetLength || !left) {
      left = candidate
      continue
    }
    break
  }

  const right = text.slice(left.length).trim()
  return right ? { leftPageText: left.trim(), rightPageText: right } : { leftPageText: text, rightPageText: '' }
}

function splitTextForSpread(text: string, isQuietBeat: boolean): { leftPageText: string; rightPageText: string } {
  const clean = text.replace(/\s+/g, ' ').trim()
  if (isQuietBeat) {
    return { leftPageText: clean, rightPageText: '' }
  }

  const sentences = splitIntoSentences(clean)
  if (sentences.length <= 1) {
    return splitLongSentence(clean)
  }

  const totalLength = sentences.reduce((sum, sentence) => sum + sentence.length, 0)
  const targetLength = totalLength / 2
  const leftSentences: string[] = []
  let leftLength = 0

  for (const sentence of sentences) {
    if (leftSentences.length === 0 || leftLength + sentence.length <= targetLength) {
      leftSentences.push(sentence)
      leftLength += sentence.length
      continue
    }
    break
  }

  if (leftSentences.length === sentences.length) {
    return { leftPageText: clean, rightPageText: '' }
  }

  const rightSentences = sentences.slice(leftSentences.length)
  return {
    leftPageText: leftSentences.join(' ').trim(),
    rightPageText: rightSentences.join(' ').trim(),
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

function withCharacterBiblePrompt(prompt: string, characterBible?: CharacterBible): string {
  if (!characterBible) return prompt
  return `${buildIllustrationDirection(characterBible)} Scene direction: ${prompt}`.trim()
}

function createFrontMatterSpreads(
  bookProjectId: string,
  story: Story,
  profile: ChildProfile,
  characterBible?: CharacterBible
): BookSpread[] {
  return [
    createSpread(
      bookProjectId,
      1,
      1,
      'front_matter',
      story.title,
      '',
      `Front cover for ${story.title}`,
      withCharacterBiblePrompt(
        `A magical hardcover picture-book cover for "${story.title}" starring ${profile.name}.`,
        characterBible
      ),
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
      withCharacterBiblePrompt(`A gentle title-page illustration motif for "${story.title}".`, characterBible),
      'Title'
    ),
  ]
}

function createEndMatterSpreads(
  bookProjectId: string,
  story: Story,
  profile: ChildProfile,
  characterBible?: CharacterBible
): BookSpread[] {
  return [
    createSpread(
      bookProjectId,
      15,
      29,
      'end_matter',
      `The End.\n\nSweet dreams, ${profile.name}.`,
      'A Storycot story',
      `Closing pages for ${story.title}`,
      withCharacterBiblePrompt(
        `A peaceful closing image for ${profile.name} settling into sleep.`,
        characterBible
      ),
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
      withCharacterBiblePrompt(
        `A simple back cover design for a Storycot hardcover children's book.`,
        characterBible
      ),
      'Back Cover'
    ),
  ]
}

function combineBeatGroup(beats: Beat[], sequence: number): Beat {
  const firstBeat = beats[0]
  const lastBeat = beats[beats.length - 1]
  if (!firstBeat || !lastBeat) {
    throw new Error('Cannot compose an empty beat group')
  }

  if (beats.length === 1) {
    return firstBeat
  }

  const summary = clampText(
    `${firstBeat.summary} ${lastBeat.summary === firstBeat.summary ? '' : lastBeat.summary}`.replace(/\s+/g, ' ').trim(),
    180
  )
  const visualIntent = beats
    .map((beat) => beat.visualIntent)
    .filter(Boolean)
    .join(' Then, ')

  return {
    id: `${firstBeat.id}:group:${sequence}`,
    sequence,
    purpose: firstBeat.purpose,
    summary,
    textDraft: beats.map((beat) => beat.textDraft).join('\n\n'),
    visualIntent,
    mood: lastBeat.mood,
    isQuietBeat: beats.every((beat) => beat.isQuietBeat),
  }
}

function groupStoryBeatsForSpreads(beats: Beat[]): Beat[] {
  if (beats.length <= MAX_INTERIOR_STORY_SPREADS) return beats

  const groups: Beat[] = []
  let cursor = 0

  for (let i = 0; i < MAX_INTERIOR_STORY_SPREADS; i += 1) {
    const remainingBeats = beats.length - cursor
    const remainingGroups = MAX_INTERIOR_STORY_SPREADS - i
    const groupSize = Math.ceil(remainingBeats / remainingGroups)
    const group = beats.slice(cursor, cursor + groupSize)
    groups.push(combineBeatGroup(group, i + 1))
    cursor += groupSize
  }

  return groups
}

function createStoryExpansionSpread(input: {
  bookProjectId: string
  profile: ChildProfile
  sequence: number
  pageStart: number
  ageBand: AgeBand
  sourceBeat: Beat
  variantIndex: number
  characterBible?: CharacterBible
}): BookSpread {
  const { bookProjectId, profile, sequence, pageStart, ageBand, sourceBeat, variantIndex, characterBible } = input
  const anchorLine = clampText(getFirstSentence(sourceBeat.textDraft), 120)
  const summary = clampText(sourceBeat.summary, 110)
  const roleIndex = variantIndex % 4

  if (ageBand === '0-2') {
    const toddlerRoles = [
      {
        sceneBrief: `A sensory close-up inspired by ${sourceBeat.summary}`,
        leftPageText: `${anchorLine}\n\n${profile.name} looked, listened, and smiled.`,
        illustrationPrompt: `A calm, spacious toddler board-book style spread inspired by ${sourceBeat.visualIntent}. Focus on one clear sensory moment with simple shapes and soothing bedtime colors.`,
      },
      {
        sceneBrief: `A repetition spread that gently echoes ${sourceBeat.summary}`,
        leftPageText: `${profile.name} stayed with the moment.\n\n${summary}`,
        illustrationPrompt: `A repetitive toddler picture-book spread based on ${sourceBeat.visualIntent}. Keep the composition simple, reassuring, and easy to read at a glance.`,
      },
      {
        sceneBrief: `A pause-and-notice spread drawn from ${sourceBeat.summary}`,
        leftPageText: `${profile.name} noticed one lovely little thing after another.`,
        illustrationPrompt: `A toddler board-book pause spread inspired by ${sourceBeat.visualIntent}. Emphasize one charming visual detail and a restful bedtime mood.`,
      },
      {
        sceneBrief: `A settling spread that softens the energy of ${sourceBeat.summary}`,
        leftPageText: `Everything felt slower now.\n\n${profile.name} was ready for the story to grow gentle again.`,
        illustrationPrompt: `A soft settling spread for a very young child, derived from ${sourceBeat.visualIntent}. Quiet atmosphere, clear focal point, and bedtime calm.`,
      },
    ] as const

    const role = toddlerRoles[roleIndex]
    return createSpread(
      bookProjectId,
      sequence,
      pageStart,
      'quiet',
      role.leftPageText,
      '',
      role.sceneBrief,
      withCharacterBiblePrompt(role.illustrationPrompt, characterBible)
    )
  }

  if (ageBand === '3-5') {
    const earlyReaderRoles = [
      {
        layoutType: 'hero' as const,
        leftPageText: summary,
        rightPageText: '',
        sceneBrief: `A scene-setting spread that lets ${sourceBeat.summary} land clearly`,
        illustrationPrompt: `A warm storybook spread that opens up the world around ${sourceBeat.visualIntent} with inviting atmosphere and clear focal storytelling.`,
      },
      {
        layoutType: 'quiet' as const,
        leftPageText: `${profile.name} took a little longer to notice every lovely detail.`,
        rightPageText: anchorLine,
        sceneBrief: `A notice-and-linger spread inspired by ${sourceBeat.summary}`,
        illustrationPrompt: `A gentle children’s-book spread based on ${sourceBeat.visualIntent}, giving the moment room to breathe with soft detail and bedtime calm.`,
      },
      {
        layoutType: 'text_art' as const,
        leftPageText: `${anchorLine}\n\nIt felt like the adventure was opening one little piece at a time.`,
        rightPageText: '',
        sceneBrief: `A turn-the-page spread extending ${sourceBeat.summary}`,
        illustrationPrompt: `A storybook transition spread inspired by ${sourceBeat.visualIntent}, designed to create anticipation without adding noise.`,
      },
      {
        layoutType: 'quiet' as const,
        leftPageText: `Soon, the excitement softened into comfort.`,
        rightPageText: `${profile.name} was ready to carry the feeling with them.`,
        sceneBrief: `A gentle settling spread that eases out of ${sourceBeat.summary}`,
        illustrationPrompt: `A cozy winding-down spread that grows out of ${sourceBeat.visualIntent}, with warm light and an emotionally calm finish.`,
      },
    ] as const

    const role = earlyReaderRoles[roleIndex]
    return createSpread(
      bookProjectId,
      sequence,
      pageStart,
      role.layoutType,
      role.leftPageText,
      role.rightPageText,
      role.sceneBrief,
      withCharacterBiblePrompt(role.illustrationPrompt, characterBible)
    )
  }

  const olderReaderRoles = [
    {
      layoutType: 'hero' as const,
      leftPageText: summary,
      rightPageText: '',
      sceneBrief: `A wider scene-setting spread built from ${sourceBeat.summary}`,
      illustrationPrompt: `A cinematic illustrated spread expanding ${sourceBeat.visualIntent} into a fuller environment with strong story focus.`,
    },
    {
      layoutType: 'text_art' as const,
      leftPageText: anchorLine,
      rightPageText: 'The moment felt bigger when there was time to really look at it.',
      sceneBrief: `A reflective pause that holds on ${sourceBeat.summary}`,
      illustrationPrompt: `A reflective story spread based on ${sourceBeat.visualIntent}, giving visual space to mood, scale, and continuity.`,
    },
    {
      layoutType: 'hero' as const,
      leftPageText: 'Some parts of the adventure deserved a full spread all to themselves.',
      rightPageText: '',
      sceneBrief: `A hero-image emphasis spread inspired by ${sourceBeat.summary}`,
      illustrationPrompt: `A full, cinematic hero spread revisiting ${sourceBeat.visualIntent} with depth, atmosphere, and emotional clarity.`,
    },
    {
      layoutType: 'quiet' as const,
      leftPageText: `By now, ${profile.name} could feel the story turning toward rest.`,
      rightPageText: clampText(summary, 90),
      sceneBrief: `A quiet transition that lowers the tempo after ${sourceBeat.summary}`,
      illustrationPrompt: `A calm transition spread derived from ${sourceBeat.visualIntent}, easing the book toward a bedtime finish.`,
    },
  ] as const
  const role = olderReaderRoles[roleIndex]
  return createSpread(
    bookProjectId,
    sequence,
    pageStart,
    role.layoutType,
    role.leftPageText,
    role.rightPageText,
    role.sceneBrief,
    withCharacterBiblePrompt(role.illustrationPrompt, characterBible)
  )
}

function createStorySpreads(
  bookProjectId: string,
  profile: ChildProfile,
  ageBand: AgeBand,
  beats: Beat[],
  characterBible?: CharacterBible
): BookSpread[] {
  const targetCount = getTargetStorySpreadCount(ageBand)
  const storyBeats = beats.length <= targetCount ? beats : groupStoryBeatsForSpreads(beats)
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
        withCharacterBiblePrompt(beat.visualIntent, characterBible)
      )
    )

    pageStart += 2
    sequence += 1
  }

  const expansionSeed = storyBeats.length > 0 ? storyBeats : beats
  let variantIndex = 0
  while (pageStart <= INTERIOR_END_PAGE) {
    const isFinalQuiet = pageStart >= INTERIOR_END_PAGE - 1
    const sourceBeat = expansionSeed[variantIndex % expansionSeed.length]

    if (sourceBeat && !isFinalQuiet) {
      spreads.push(
        createStoryExpansionSpread({
          bookProjectId,
          profile,
          sequence,
          pageStart,
          ageBand,
          sourceBeat,
          variantIndex,
          characterBible,
        })
      )
      pageStart += 2
      sequence += 1
      variantIndex += 1
      continue
    }

    spreads.push(
      createSpread(
        bookProjectId,
        sequence,
        pageStart,
        'quiet',
        isFinalQuiet ? 'A final calm breath before bedtime.' : '',
        '',
        'A quiet visual pause that gives the story room to breathe.',
        withCharacterBiblePrompt(
          'A peaceful children’s-book spread with soft night-time atmosphere and room for reflection.',
          characterBible
        )
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
  characterBible?: CharacterBible
}): BookSpread[] {
  const { bookProjectId, story, profile, ageBand, beats, characterBible } = input

  return [
    ...createFrontMatterSpreads(bookProjectId, story, profile, characterBible),
    ...createStorySpreads(bookProjectId, profile, ageBand, beats, characterBible),
    ...createEndMatterSpreads(bookProjectId, story, profile, characterBible),
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
