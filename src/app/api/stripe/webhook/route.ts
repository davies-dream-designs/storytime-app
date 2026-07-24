import { NextRequest, NextResponse } from "next/server";
import Stripe from "stripe";
import { clerkClient } from "@clerk/nextjs/server";
import { db } from "@/lib/db";
import { submitPrintFulfillment } from "@/lib/print-books/fulfillment";
import { inngest, INNGEST_EVENTS } from "@/lib/inngest/client";
import {
  isPrintProductKey,
  quotePrintProduct,
} from "@/lib/print-books/printProducts";
import {
  getPrintShippingAddress,
  getSessionCountry,
  retrieveSessionWhenShippingIsMissing,
} from "@/lib/stripe/checkoutShipping";
import type { PrintBookOrder } from "@/types/printBook";

export async function POST(req: NextRequest) {
  const body = await req.text();
  const sig = req.headers.get("stripe-signature");

  if (
    !sig ||
    !process.env.STRIPE_WEBHOOK_SECRET ||
    !process.env.STRIPE_SECRET_KEY
  ) {
    return NextResponse.json(
      { error: "Missing signature or secret" },
      { status: 400 }
    );
  }

  const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(
      body,
      sig,
      process.env.STRIPE_WEBHOOK_SECRET
    );
  } catch {
    return NextResponse.json({ error: "Invalid signature" }, { status: 400 });
  }

  if (event.type === "checkout.session.completed") {
    let session = event.data.object as Stripe.Checkout.Session;
    const checkoutType = session.metadata?.checkoutType ?? "credits";
    if (checkoutType === "print_book") {
      session = await retrieveSessionWhenShippingIsMissing(stripe, session);
    }
    const userId = session.metadata?.userId;
    const purchased = parseInt(session.metadata?.credits ?? "0", 10);
    const billingCountry = getSessionCountry(session);

    // AU-only sales policy: automatically refund non-AU purchases.
    if (billingCountry !== "AU") {
      if (typeof session.payment_intent === "string") {
        await stripe.refunds.create({
          payment_intent: session.payment_intent,
          reason: "requested_by_customer",
          metadata: {
            policy: "AU_ONLY",
            checkout_session_id: session.id,
            billing_country: billingCountry ?? "UNKNOWN",
          },
        });
      }

      if (checkoutType === "print_book" && session.metadata?.projectId) {
        const project = await db.bookProjects.getById(
          session.metadata.projectId
        );
        if (project) {
          await db.bookProjects.update(project.id, {
            printOrder: {
              ...(project.printOrder ?? {
                productKey: "softcover",
                productLabel: "Printed book",
                provider: "Storycot",
                format: "Storycot printed book",
                amountAud: Number(session.metadata.amountAud ?? 0),
                pageCount: Number(
                  session.metadata.pageCount ?? project.pageCount
                ),
              }),
              status: "refunded",
              checkoutSessionId: session.id,
              paymentIntentId:
                typeof session.payment_intent === "string"
                  ? session.payment_intent
                  : undefined,
              billingCountry: billingCountry ?? "UNKNOWN",
              refundedAt: new Date().toISOString(),
            },
          });
        }
      }

      return NextResponse.json({ received: true, refunded: true });
    }

    if (checkoutType === "animated_video") {
      const projectId = session.metadata?.projectId;
      if (projectId && userId) {
        const project = await db.bookProjects.getById(projectId);
        if (project && project.userId === userId) {
          await db.bookProjects.update(project.id, {
            assets: {
              ...project.assets,
              animatedVideoUnlockedAt: new Date().toISOString(),
              animatedVideoCheckoutSessionId: session.id,
              animatedVideoStatus: "generating",
              animatedVideoStartedAt: new Date().toISOString(),
            },
          });
          await inngest.send({
            name: INNGEST_EVENTS.bookVideoRequested,
            data: { projectId: project.id },
          });
        }
      }
    } else if (checkoutType === "digital_download") {
      const projectId = session.metadata?.projectId;
      if (projectId && userId) {
        const project = await db.bookProjects.getById(projectId);
        if (project && project.userId === userId) {
          await db.bookProjects.update(project.id, {
            assets: {
              ...project.assets,
              digitalDownloadUnlockedAt: new Date().toISOString(),
              digitalDownloadCheckoutSessionId: session.id,
            },
          });
        }
      }
    } else if (checkoutType === "print_book") {
      const projectId = session.metadata?.projectId;
      const productKey = session.metadata?.productKey;
      if (projectId && isPrintProductKey(productKey)) {
        const project = await db.bookProjects.getById(projectId);
        if (project && project.userId === userId) {
          const quote = quotePrintProduct(project, productKey);
          const printOrder: PrintBookOrder = {
            productKey: quote.key,
            productLabel: quote.label,
            provider: quote.provider,
            format: quote.format,
            status: "paid",
            amountAud: quote.priceAud,
            pageCount: quote.pageCount,
            checkoutSessionId: session.id,
            paymentIntentId:
              typeof session.payment_intent === "string"
                ? session.payment_intent
                : undefined,
            billingCountry,
            shipping: getPrintShippingAddress(session),
            paidAt: new Date().toISOString(),
          };
          const fulfillment = await submitPrintFulfillment({
            project,
            order: printOrder,
          });
          await db.bookProjects.update(project.id, {
            printOrder: {
              ...printOrder,
              fulfillment,
            },
            assets: {
              ...project.assets,
              ...(project.assets.digitalDownloadUnlockedAt
                ? {}
                : { digitalDownloadUnlockedAt: new Date().toISOString() }),
            },
          });
        }
      }
    } else if (userId && purchased > 0) {
      const client = await clerkClient();
      const user = await client.users.getUser(userId);
      const current = (user.privateMetadata.credits as number | undefined) ?? 3;
      await client.users.updateUserMetadata(userId, {
        privateMetadata: { credits: current + purchased },
      });
    }
  }

  return NextResponse.json({ received: true });
}
