import { NextRequest, NextResponse } from 'next/server'
import Stripe from 'stripe'
import { auth } from '@clerk/nextjs/server'

const PACKS = {
  starter: { credits: 10, amount: 499, label: 'Storycot Starter — 10 stories' },
  family:  { credits: 30, amount: 1199, label: 'Storycot Family — 30 stories' },
  pro:     { credits: 100, amount: 2999, label: 'Storycot Bedtime Pro — 100 stories' },
} as const

export async function POST(req: NextRequest) {
  const { userId } = await auth()
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  if (!process.env.STRIPE_SECRET_KEY) {
    return NextResponse.json({ error: 'Stripe not configured' }, { status: 503 })
  }

  const stripe = new Stripe(process.env.STRIPE_SECRET_KEY)

  const { pack } = (await req.json()) as { pack: string }
  const packData = PACKS[pack as keyof typeof PACKS]
  if (!packData) return NextResponse.json({ error: 'Invalid pack' }, { status: 400 })

  // NEXT_PUBLIC_APP_URL wins; fall back to Vercel's auto-injected URL, then localhost
  const appUrl =
    process.env.NEXT_PUBLIC_APP_URL ??
    (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : 'http://localhost:3000')

  const session = await stripe.checkout.sessions.create({
    payment_method_types: ['card'],
    mode: 'payment',
    line_items: [{
      price_data: {
        currency: 'aud',
        product_data: { name: packData.label },
        unit_amount: packData.amount,
      },
      quantity: 1,
    }],
    metadata: {
      userId,
      credits: packData.credits.toString(),
    },
    success_url: `${appUrl}/account?success=1`,
    cancel_url: `${appUrl}/account?canceled=1`,
  })

  return NextResponse.json({ url: session.url })
}
