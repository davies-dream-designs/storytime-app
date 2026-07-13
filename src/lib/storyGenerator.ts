import Anthropic from '@anthropic-ai/sdk'
import type { ChildProfile, Character, StoryPage } from '@/types'

const client = new Anthropic()

interface GenerateStoryInput {
  profile: ChildProfile
  characters: Character[]
  theme: string
  notes: string
}

interface GeneratedStory {
  title: string
  pages: StoryPage[]
}

function buildPrompt(input: GenerateStoryInput): string {
  const { profile, characters, theme, notes } = input

  const characterSection =
    characters.length > 0
      ? `\n\nEstablished characters for ${profile.name} (use these EXACTLY as described):
${characters.map((c) => `- ${c.name}: ${c.description}. Personality: ${c.personality}. Appearance: ${c.appearance}.`).join('\n')}`
      : ''

  const notesSection = notes ? `\n\nExtra details to include: ${notes}` : ''

  return `You are a magical storyteller creating a personalised bedtime story for a child.

Child profile:
- Name: ${profile.name}
- Age: ${profile.age} years old
- Favourite characters/toys: ${profile.favouriteCharacters.join(', ') || 'none specified'}
- Favourite activities: ${profile.favouriteActivities.join(', ') || 'none specified'}
- Favourite animals: ${profile.favouriteAnimals.join(', ') || 'none specified'}
- Favourite places: ${profile.favouritePlaces.join(', ') || 'none specified'}
- Story theme/lesson: ${theme || 'a gentle adventure'}
${characterSection}
${notesSection}

Write a warm, age-appropriate bedtime story that:
1. Features ${profile.name} as the main character alongside their favourite things
2. Follows this 5-part structure: introduction → adventure/problem → character growth → resolution → calm bedtime ending
3. Uses simple vocabulary appropriate for age ${profile.age}
4. Is approximately 700–900 words total
5. Has a positive, cosy tone with a gentle ending that encourages sleep
6. Naturally weaves in the theme: ${theme || 'a gentle adventure'}
7. Uses some warm repetition suitable for young children

Respond ONLY with valid JSON in this exact format — no markdown, no extra text:
{
  "title": "A short magical title here",
  "pages": [
    {
      "pageNumber": 1,
      "text": "2–4 sentences of story text for this page",
      "illustrationPrompt": "Brief description for a children's storybook illustration, warm watercolour style"
    }
  ]
}

Split the story into 10–14 pages. Each page should have 2–4 sentences.`
}

export async function generateStory(input: GenerateStoryInput): Promise<GeneratedStory> {
  const prompt = buildPrompt(input)

  const message = await client.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 4096,
    messages: [{ role: 'user', content: prompt }],
  })

  const content = message.content[0]
  if (content.type !== 'text') {
    throw new Error('Unexpected response type from AI')
  }

  const raw = content.text.trim()

  try {
    return JSON.parse(raw) as GeneratedStory
  } catch {
    const jsonMatch = raw.match(/\{[\s\S]*\}/)
    if (!jsonMatch) throw new Error('Could not parse story from AI response')
    return JSON.parse(jsonMatch[0]) as GeneratedStory
  }
}
