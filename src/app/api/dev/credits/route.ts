import { NextRequest, NextResponse } from 'next/server'
import { auth, clerkClient } from '@clerk/nextjs/server'

export async function POST(req: NextRequest) {
  if (process.env.VERCEL_ENV === 'production') {
    return NextResponse.json({ error: 'Not available in production' }, { status: 403 })
  }

  const { userId } = await auth()
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = (await req.json().catch(() => ({}))) as { amount?: number }
  const amount = Math.min(Math.max(parseInt(String(body.amount ?? 10), 10), 1), 100)

  const client = await clerkClient()
  const user = await client.users.getUser(userId)
  const current = (user.privateMetadata.credits as number | undefined) ?? 0
  await client.users.updateUserMetadata(userId, {
    privateMetadata: { credits: current + amount },
  })

  return NextResponse.json({ added: amount, total: current + amount })
}
