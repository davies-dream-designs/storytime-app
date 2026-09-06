import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import { db } from '@/lib/db'
import type { Character } from '@/types'

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { userId } = await auth()
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params
  const character = await db.characters.getById(id)
  if (!character || character.userId !== userId) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  const body = (await req.json()) as Partial<Character>

  // Allowlist editable fields. Identity/ownership stay server-controlled.
  const updates: Partial<Character> = {}
  for (const key of ['name', 'description', 'personality', 'appearance'] as const) {
    if (key in body && typeof body[key] === 'string') updates[key] = body[key]
  }
  // Reassigning profileId is only allowed to a profile the caller owns.
  if (typeof body.profileId === 'string' && body.profileId !== character.profileId) {
    const target = await db.profiles.getById(body.profileId)
    if (!target || target.userId !== userId) {
      return NextResponse.json({ error: 'Invalid profile' }, { status: 400 })
    }
    updates.profileId = body.profileId
  }

  const updated = await db.characters.update(id, updates)
  return NextResponse.json(updated)
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { userId } = await auth()
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params
  const character = await db.characters.getById(id)
  if (!character || character.userId !== userId) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  await db.characters.delete(id)
  return NextResponse.json({ success: true })
}
