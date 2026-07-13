import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import { kv } from '@vercel/kv'
import { db } from '@/lib/db'
import { generateSuggestions } from '@/lib/storyGenerator'
import type { StorySuggestion } from '@/types'

const CACHE_TTL_SECONDS = 60 * 60 * 24 // 24 hours

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

  const cacheKey = `suggestions:${profileId}`
  const cached = await kv.get<StorySuggestion[]>(cacheKey)
  if (cached) return NextResponse.json(cached)

  const recentStories = (await db.stories.getByProfileId(profileId))
    .filter((s) => s.userId === userId)
    .sort((a, b) => (a.createdAt > b.createdAt ? -1 : 1))
    .slice(0, 5)
    .map((s) => s.title)

  const suggestions = await generateSuggestions(profile, recentStories)
  await kv.set(cacheKey, suggestions, { ex: CACHE_TTL_SECONDS })
  return NextResponse.json(suggestions)
}
