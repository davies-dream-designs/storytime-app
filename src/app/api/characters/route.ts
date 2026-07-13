import { NextRequest, NextResponse } from 'next/server'
import { randomUUID } from 'crypto'
import { db } from '@/lib/db'
import type { Character } from '@/types'

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const profileId = searchParams.get('profileId')

  const characters = profileId
    ? db.characters.getByProfileId(profileId)
    : db.characters.getAll()

  return NextResponse.json(characters)
}

export async function POST(req: NextRequest) {
  const body = (await req.json()) as Partial<Character>

  if (!body.name?.trim()) {
    return NextResponse.json({ error: 'Name is required' }, { status: 400 })
  }
  if (!body.profileId) {
    return NextResponse.json({ error: 'profileId is required' }, { status: 400 })
  }

  const character: Character = {
    id: randomUUID(),
    name: body.name.trim(),
    description: body.description ?? '',
    personality: body.personality ?? '',
    appearance: body.appearance ?? '',
    profileId: body.profileId,
    createdAt: new Date().toISOString(),
  }

  db.characters.create(character)
  return NextResponse.json(character, { status: 201 })
}
