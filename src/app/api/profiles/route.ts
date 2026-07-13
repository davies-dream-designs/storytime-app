import { NextRequest, NextResponse } from 'next/server'
import { randomUUID } from 'crypto'
import { auth } from '@clerk/nextjs/server'
import { db } from '@/lib/db'
import type { ChildProfile } from '@/types'

export async function GET() {
  const { userId } = await auth()
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  return NextResponse.json(db.profiles.getByUserId(userId))
}

export async function POST(req: NextRequest) {
  const { userId } = await auth()
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = (await req.json()) as Partial<ChildProfile>

  if (!body.name || typeof body.name !== 'string' || body.name.trim() === '') {
    return NextResponse.json({ error: 'Name is required' }, { status: 400 })
  }
  if (!body.age || typeof body.age !== 'number' || body.age < 1 || body.age > 12) {
    return NextResponse.json({ error: 'Age must be between 1 and 12' }, { status: 400 })
  }

  const profile: ChildProfile = {
    id: randomUUID(),
    userId,
    name: body.name.trim(),
    age: body.age,
    favouriteCharacters: body.favouriteCharacters ?? [],
    favouriteActivities: body.favouriteActivities ?? [],
    favouriteAnimals: body.favouriteAnimals ?? [],
    favouritePlaces: body.favouritePlaces ?? [],
    lessons: body.lessons ?? [],
    createdAt: new Date().toISOString(),
  }

  db.profiles.create(profile)
  return NextResponse.json(profile, { status: 201 })
}
