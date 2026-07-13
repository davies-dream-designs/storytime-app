import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import { db } from '@/lib/db'
import { generateSuggestions } from '@/lib/storyGenerator'

export async function POST(req: NextRequest) {
  const { userId } = await auth()
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { profileId } = (await req.json()) as { profileId: string }
  if (!profileId) return NextResponse.json({ error: 'profileId is required' }, { status: 400 })

  const profile = await db.profiles.getById(profileId)
  if (!profile || profile.userId !== userId) {
    return NextResponse.json({ error: 'Profile not found' }, { status: 404 })
  }

  if (!process.env.ANTHROPIC_API_KEY) {
    return NextResponse.json({ error: 'ANTHROPIC_API_KEY not configured' }, { status: 503 })
  }

  // Pass recent story titles so suggestions feel fresh
  const recentStories = (await db.stories.getByProfileId(profileId))
    .filter((s) => s.userId === userId)
    .sort((a, b) => (a.createdAt > b.createdAt ? -1 : 1))
    .slice(0, 5)
    .map((s) => s.title)

  const suggestions = await generateSuggestions(profile, recentStories)
  return NextResponse.json(suggestions)
}
