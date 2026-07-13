import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import { db } from '@/lib/db'
import type { ChildProfile } from '@/types'

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { userId } = await auth()
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params
  const profile = db.profiles.getById(id)
  if (!profile || profile.userId !== userId) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }
  return NextResponse.json(profile)
}

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { userId } = await auth()
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params
  const profile = db.profiles.getById(id)
  if (!profile || profile.userId !== userId) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  const body = (await req.json()) as Partial<ChildProfile>
  const updated = db.profiles.update(id, body)
  return NextResponse.json(updated)
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { userId } = await auth()
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params
  const profile = db.profiles.getById(id)
  if (!profile || profile.userId !== userId) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  db.profiles.delete(id)
  return NextResponse.json({ success: true })
}
