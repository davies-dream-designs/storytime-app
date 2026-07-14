import { NextRequest, NextResponse } from 'next/server'
import { auth, clerkClient } from '@clerk/nextjs/server'

export async function POST(req: NextRequest) {
  const { userId } = await auth()
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { ref } = (await req.json()) as { ref: string }

  // Basic validation — Clerk user IDs start with user_
  if (!ref || !/^user_[A-Za-z0-9]+$/.test(ref)) {
    return NextResponse.json({ error: 'Invalid referral code' }, { status: 400 })
  }

  // Can't refer yourself
  if (ref === userId) {
    return NextResponse.json({ error: 'Cannot use your own referral link' }, { status: 400 })
  }

  const client = await clerkClient()

  // Check this user hasn't already been referred
  const currentUser = await client.users.getUser(userId)
  if (currentUser.privateMetadata.referredBy) {
    return NextResponse.json({ already: true }, { status: 409 })
  }

  // Validate referrer exists
  let referrer
  try {
    referrer = await client.users.getUser(ref)
  } catch {
    return NextResponse.json({ error: 'Referrer not found' }, { status: 400 })
  }

  // Grant +1 story to referrer
  const referrerCredits = (referrer.privateMetadata.credits as number | undefined) ?? 3
  await client.users.updateUserMetadata(ref, {
    privateMetadata: { credits: referrerCredits + 1 },
  })

  // Mark current user as referred (prevents double-dipping)
  await client.users.updateUserMetadata(userId, {
    privateMetadata: { referredBy: ref },
  })

  return NextResponse.json({ success: true })
}
