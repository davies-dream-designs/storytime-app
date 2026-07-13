import { NextRequest, NextResponse } from 'next/server'
import { randomUUID } from 'crypto'
import { auth, clerkClient } from '@clerk/nextjs/server'
import { db } from '@/lib/db'
import { generateStory } from '@/lib/storyGenerator'
import type { Story } from '@/types'

export async function POST(req: NextRequest) {
  const { userId } = await auth()
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  // Check credits (undefined = new user with 3 free stories)
  const client = await clerkClient()
  const user = await client.users.getUser(userId)
  const credits = (user.privateMetadata.credits as number | undefined) ?? 3

  if (credits <= 0) {
    return NextResponse.json(
      { error: 'No credits remaining. Visit /account to purchase more.' },
      { status: 402 }
    )
  }

  const { profileId, theme, notes } = (await req.json()) as {
    profileId: string
    theme?: string
    notes?: string
  }

  if (!profileId) {
    return NextResponse.json({ error: 'profileId is required' }, { status: 400 })
  }

  const profile = db.profiles.getById(profileId)
  if (!profile || profile.userId !== userId) {
    return NextResponse.json({ error: 'Profile not found' }, { status: 404 })
  }

  if (!process.env.ANTHROPIC_API_KEY) {
    return NextResponse.json(
      { error: 'ANTHROPIC_API_KEY is not configured.' },
      { status: 503 }
    )
  }

  const characters = db.characters.getByProfileId(profileId).filter((c) => c.userId === userId)

  const generated = await generateStory({
    profile,
    characters,
    theme: theme ?? 'a gentle adventure',
    notes: notes ?? '',
  })

  const wordCount = generated.pages.reduce((acc, p) => acc + p.text.split(/\s+/).length, 0)

  const story: Story = {
    id: randomUUID(),
    userId,
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

  // Deduct 1 credit
  await client.users.updateUserMetadata(userId, {
    privateMetadata: { credits: credits - 1 },
  })

  return NextResponse.json({ ...story, creditsRemaining: credits - 1 }, { status: 201 })
}
