import { NextRequest, NextResponse } from 'next/server'
import { randomUUID } from 'crypto'
import { auth } from '@clerk/nextjs/server'
import { db } from '@/lib/db'
import type { ChildProfile } from '@/types'

export async function GET() {
  const { userId } = await auth()
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  return NextResponse.json(await db.profiles.getByUserId(userId))
}

export async function POST(req: NextRequest) {
  const { userId } = await auth()
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = (await req.json()) as Partial<ChildProfile>

  if (!body.name || typeof body.name !== 'string' || body.name.trim() === '') {
    return NextResponse.json({ error: 'Name is required' }, { status: 400 })
  }
  if (body.age === undefined && !body.dateOfBirth) {
    return NextResponse.json({ error: 'Birthday or age is required' }, { status: 400 })
  }

  const profile: ChildProfile = {
    id: randomUUID(),
    userId,
    name: body.name.trim(),
    age: body.age ?? 0,
    dateOfBirth: body.dateOfBirth,
    favouriteCharacters: body.favouriteCharacters ?? [],
    favouriteActivities: body.favouriteActivities ?? [],
    favouriteAnimals: body.favouriteAnimals ?? [],
    favouritePlaces: body.favouritePlaces ?? [],
    lessons: body.lessons ?? [],
    createdAt: new Date().toISOString(),
  }

  await db.profiles.create(profile)
  return NextResponse.json(profile, { status: 201 })
}
