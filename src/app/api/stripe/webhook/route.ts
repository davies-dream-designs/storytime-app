import { NextRequest, NextResponse } from 'next/server'
import Stripe from 'stripe'
import { clerkClient } from '@clerk/nextjs/server'
import { db } from '@/lib/db'
import { isPrintProductKey, quotePrintProduct } from '@/lib/print-books/printProducts'

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
    const sessionWithShipping = session as Stripe.Checkout.Session & {
      shipping_details?: { address?: { country?: string | null } | null } | null
    }
    const checkoutType = session.metadata?.checkoutType ?? 'credits'
    const userId = session.metadata?.userId
    const purchased = parseInt(session.metadata?.credits ?? '0', 10)
    const billingCountry =
      sessionWithShipping.shipping_details?.address?.country ??
      session.customer_details?.address?.country

    // AU-only sales policy: automatically refund non-AU purchases.
    if (billingCountry !== 'AU') {
      if (typeof session.payment_intent === 'string') {
        await stripe.refunds.create({
          payment_intent: session.payment_intent,
          reason: 'requested_by_customer',
          metadata: {
            policy: 'AU_ONLY',
            checkout_session_id: session.id,
            billing_country: billingCountry ?? 'UNKNOWN',
          },
        })
      }

      if (checkoutType === 'print_book' && session.metadata?.projectId) {
        const project = await db.bookProjects.getById(session.metadata.projectId)
        if (project) {
          await db.bookProjects.update(project.id, {
            printOrder: {
              ...(project.printOrder ?? {
                productKey: 'softcover',
                productLabel: 'Printed book',
                provider: 'Storycot',
                format: 'Storycot printed book',
                amountAud: Number(session.metadata.amountAud ?? 0),
                pageCount: Number(session.metadata.pageCount ?? project.pageCount),
              }),
              status: 'refunded',
              checkoutSessionId: session.id,
              paymentIntentId:
                typeof session.payment_intent === 'string' ? session.payment_intent : undefined,
              billingCountry: billingCountry ?? 'UNKNOWN',
              refundedAt: new Date().toISOString(),
            },
          })
        }
      }

      return NextResponse.json({ received: true, refunded: true })
    }

    if (checkoutType === 'print_book') {
      const projectId = session.metadata?.projectId
      const productKey = session.metadata?.productKey
      if (projectId && isPrintProductKey(productKey)) {
        const project = await db.bookProjects.getById(projectId)
        if (project && project.userId === userId) {
          const quote = quotePrintProduct(project, productKey)
          await db.bookProjects.update(project.id, {
            printOrder: {
              productKey: quote.key,
              productLabel: quote.label,
              provider: quote.provider,
              format: quote.format,
              status: 'paid',
              amountAud: quote.priceAud,
              pageCount: quote.pageCount,
              checkoutSessionId: session.id,
              paymentIntentId:
                typeof session.payment_intent === 'string' ? session.payment_intent : undefined,
              billingCountry,
              paidAt: new Date().toISOString(),
            },
          })
        }
      }
    } else if (userId && purchased > 0) {
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
