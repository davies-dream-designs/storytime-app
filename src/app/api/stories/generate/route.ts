import { NextRequest, NextResponse } from 'next/server'
import { randomUUID } from 'crypto'
import { db } from '@/lib/db'
import { generateStory } from '@/lib/storyGenerator'
import type { Story } from '@/types'

export async function POST(req: NextRequest) {
  const { profileId, theme, notes } = (await req.json()) as {
    profileId: string
    theme?: string
    notes?: string
  }

  if (!profileId) {
    return NextResponse.json({ error: 'profileId is required' }, { status: 400 })
  }

  const profile = db.profiles.getById(profileId)
  if (!profile) {
    return NextResponse.json({ error: 'Profile not found' }, { status: 404 })
  }

  if (!process.env.ANTHROPIC_API_KEY) {
    return NextResponse.json(
      { error: 'ANTHROPIC_API_KEY is not configured. Add it to your .env.local file.' },
      { status: 503 }
    )
  }

  const characters = db.characters.getByProfileId(profileId)

  const generated = await generateStory({
    profile,
    characters,
    theme: theme ?? 'a gentle adventure',
    notes: notes ?? '',
  })

  const wordCount = generated.pages.reduce((acc, p) => acc + p.text.split(/\s+/).length, 0)

  const story: Story = {
    id: randomUUID(),
    title: generated.title,
    profileId,
    profileName: profile.name,
    pages: generated.pages,
    wordCount,
    theme: theme ?? 'a gentle adventure',
    notes: notes ?? '',
    createdAt: new Date().toISOString(),
  }

  db.stories.create(story)
  return NextResponse.json(story, { status: 201 })
}
