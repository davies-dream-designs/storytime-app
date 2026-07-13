import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const profileId = searchParams.get('profileId')

  const stories = profileId
    ? db.stories.getByProfileId(profileId)
    : db.stories.getAll()

  return NextResponse.json(stories.sort((a, b) => (a.createdAt > b.createdAt ? -1 : 1)))
}
