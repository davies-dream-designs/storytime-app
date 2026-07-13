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
  const updated = await db.characters.update(id, body)
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
