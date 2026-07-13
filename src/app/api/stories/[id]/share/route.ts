import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import { db } from '@/lib/db'

function generateToken(): string {
  const chars = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'
  return Array.from({ length: 10 }, () => chars[Math.floor(Math.random() * chars.length)]).join('')
}

export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { userId } = await auth()
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params
  const story = await db.stories.getById(id)
  if (!story || story.userId !== userId) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  const token = story.shareToken ?? generateToken()
  if (!story.shareToken) {
    await db.stories.setShareToken(id, token)
  }

  return NextResponse.json({ token })
}
