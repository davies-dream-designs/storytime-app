import { NextRequest, NextResponse } from 'next/server'
import { randomUUID } from 'crypto'
import { auth } from '@clerk/nextjs/server'
import { db } from '@/lib/db'
import type { Character } from '@/types'

export async function GET(req: NextRequest) {
  const { userId } = await auth()
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { searchParams } = new URL(req.url)
  const profileId = searchParams.get('profileId')

  const characters = profileId
    ? (await db.characters.getByProfileId(profileId)).filter((c) => c.userId === userId)
    : await db.characters.getByUserId(userId)

  return NextResponse.json(characters)
}

export async function POST(req: NextRequest) {
  const { userId } = await auth()
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = (await req.json()) as Partial<Character>

  if (!body.name?.trim()) {
    return NextResponse.json({ error: 'Name is required' }, { status: 400 })
  }
  if (!body.profileId) {
    return NextResponse.json({ error: 'profileId is required' }, { status: 400 })
  }

  const profile = await db.profiles.getById(body.profileId)
  if (!profile || profile.userId !== userId) {
    return NextResponse.json({ error: 'Profile not found' }, { status: 404 })
  }

  const character: Character = {
    id: randomUUID(),
    userId,
    name: body.name.trim(),
    description: body.description ?? '',
    personality: body.personality ?? '',
    appearance: body.appearance ?? '',
    profileId: body.profileId,
    createdAt: new Date().toISOString(),
  }

  await db.characters.create(character)
  return NextResponse.json(character, { status: 201 })
}
