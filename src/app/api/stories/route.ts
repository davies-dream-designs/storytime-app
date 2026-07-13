import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import { db } from '@/lib/db'

export async function GET(req: NextRequest) {
  const { userId } = await auth()
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { searchParams } = new URL(req.url)
  const profileId = searchParams.get('profileId')

  const stories = profileId
    ? (await db.stories.getByProfileId(profileId)).filter((s) => s.userId === userId)
    : await db.stories.getByUserId(userId)

  return NextResponse.json(stories.sort((a, b) => (a.createdAt > b.createdAt ? -1 : 1)))
}
