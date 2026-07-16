import type { Story } from '@/types'
import type { Beat, BeatMood, BeatPurpose } from '@/types/printBook'

function summarizeText(text: string): string {
  const clean = text.replace(/\s+/g, ' ').trim()
  if (clean.length <= 120) return clean
  return `${clean.slice(0, 117).trimEnd()}...`
}

function inferPurpose(index: number, total: number): BeatPurpose {
  if (index === 0) return 'setup'
  if (index === total - 1) return 'bedtime_close'
  if (index === total - 2) return 'resolution'
  if (index === 1) return 'invitation'

  const progress = index / Math.max(total - 1, 1)
  if (progress < 0.4) return 'discovery'
  if (progress < 0.75) return 'challenge'
  return 'comfort'
}

function inferMood(purpose: BeatPurpose): BeatMood {
  switch (purpose) {
    case 'setup':
      return 'calm'
    case 'invitation':
      return 'wonder'
    case 'discovery':
      return 'playful'
    case 'challenge':
      return 'tense'
    case 'comfort':
      return 'wonder'
    case 'resolution':
      return 'calm'
    case 'bedtime_close':
      return 'sleepy'
  }
}

function isQuietBeat(purpose: BeatPurpose): boolean {
  return purpose === 'comfort' || purpose === 'resolution' || purpose === 'bedtime_close'
}

export function deriveBeatsFromStory(story: Story): Beat[] {
  return story.pages.map((page, index, pages) => {
    const purpose = inferPurpose(index, pages.length)
    const textDraft = page.text.trim()
    const visualIntent = typeof page.illustrationPrompt === 'string' && page.illustrationPrompt.trim().length > 0
      ? page.illustrationPrompt.trim()
      : summarizeText(textDraft)

    return {
      id: `${story.id}:beat:${page.pageNumber}`,
      sequence: index + 1,
      purpose,
      summary: summarizeText(page.text),
      textDraft,
      visualIntent,
      mood: inferMood(purpose),
      isQuietBeat: isQuietBeat(purpose),
    }
  })
}
