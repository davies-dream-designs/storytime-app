import { NextRequest, NextResponse } from 'next/server'
import Stripe from 'stripe'
import { clerkClient } from '@clerk/nextjs/server'

export async function POST(req: NextRequest) {
  const body = await req.text()
  const sig = req.headers.get('stripe-signature')

  if (!sig || !process.env.STRIPE_WEBHOOK_SECRET || !process.env.STRIPE_SECRET_KEY) {
    return NextResponse.json({ error: 'Missing signature or secret' }, { status: 400 })
  }

  const stripe = new Stripe(process.env.STRIPE_SECRET_KEY)

  let event: Stripe.Event
  try {
    event = stripe.webhooks.constructEvent(body, sig, process.env.STRIPE_WEBHOOK_SECRET)
  } catch {
    return NextResponse.json({ error: 'Invalid signature' }, { status: 400 })
  }

  if (event.type === 'checkout.session.completed') {
    const session = event.data.object as Stripe.Checkout.Session
    const userId = session.metadata?.userId
    const purchased = parseInt(session.metadata?.credits ?? '0', 10)

    if (userId && purchased > 0) {
      const client = await clerkClient()
      const user = await client.users.getUser(userId)
      const current = (user.privateMetadata.credits as number | undefined) ?? 3
      await client.users.updateUserMetadata(userId, {
        privateMetadata: { credits: current + purchased },
      })
    }
  }

  return NextResponse.json({ received: true })
}
