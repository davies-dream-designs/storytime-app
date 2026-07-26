import { NextRequest, NextResponse } from "next/server";
import Stripe from "stripe";
import { clerkClient } from "@clerk/nextjs/server";
import { db } from "@/lib/db";
import { submitPrintFulfillment } from "@/lib/print-books/fulfillment";
import {
  isPrintProductKey,
  quotePrintProduct,
} from "@/lib/print-books/printProducts";
import {
  getPrintShippingAddress,
  getSessionCountry,
  retrieveSessionWhenShippingIsMissing,
} from "@/lib/stripe/checkoutShipping";
import {
  sendGiftCreditsEmail,
  sendPrintOrderConfirmedEmail,
} from "@/lib/email";
import { logEvent } from "@/lib/logEvent";
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
  } catch (err) {
    await logEvent({
      error: err,
      code: "payment.signature_invalid",
      source: "stripe/webhook",
    });
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

      if (checkoutType === "gift_credits" && session.metadata?.giftToken) {
        const gift = await db.giftOrders.getByToken(session.metadata.giftToken);
        if (gift) {
          await db.giftOrders.update(gift.id, {
            status: "refunded",
            checkoutSessionId: session.id,
            paymentIntentId:
              typeof session.payment_intent === "string"
                ? session.payment_intent
                : undefined,
            updatedAt: new Date().toISOString(),
          });
        }
      }

      return NextResponse.json({ received: true, refunded: true });
    }

    if (checkoutType === "digital_download") {
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
    } else if (checkoutType === "gift_credits") {
      const giftToken = session.metadata?.giftToken;
      if (giftToken && userId) {
        const now = new Date().toISOString();
        const updatedGift = await db.giftOrders.claimPaid(
          giftToken,
          userId,
          now,
          session.id,
          typeof session.payment_intent === "string"
            ? session.payment_intent
            : undefined
        );

        if (updatedGift) {
          if (
            updatedGift.referralReferrerUserId &&
            !updatedGift.referralGrantedAt &&
            updatedGift.referralReferrerUserId !== userId
          ) {
            const client = await clerkClient();
            const referrer = await client.users.getUser(
              updatedGift.referralReferrerUserId
            );
            const current =
              (referrer.privateMetadata.credits as number | undefined) ?? 3;
            await client.users.updateUserMetadata(
              updatedGift.referralReferrerUserId,
              {
                privateMetadata: { credits: current + 1 },
              }
            );
            await db.giftOrders.update(updatedGift.id, {
              referralGrantedAt: now,
            });
          }

          const appUrl =
            process.env.NEXT_PUBLIC_APP_URL ?? "https://storycot.com";
          const purchaser = await (async () => {
            try {
              const client = await clerkClient();
              return await client.users.getUser(userId);
            } catch {
              return undefined;
            }
          })();
          void sendGiftCreditsEmail({
            toEmail: updatedGift.recipientEmail,
            toName: updatedGift.recipientName,
            fromName:
              purchaser?.firstName ??
              purchaser?.primaryEmailAddress?.emailAddress ??
              updatedGift.purchaserEmail ??
              "Someone",
            credits: updatedGift.credits,
            message: updatedGift.message,
            redeemUrl: `${appUrl.replace(/\/$/, "")}/gift/${updatedGift.token}`,
            appUrl,
          }).catch((err) => {
            console.error("Gift email failed (non-fatal)", err);
            void logEvent({
              error: err,
              code: "payment.confirmation_email_failed",
              userId,
              userEmail: updatedGift.recipientEmail,
              entityType: "gift_order",
              entityId: updatedGift.id,
              source: "stripe/webhook",
              context: { checkoutSessionId: session.id },
            });
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
          const quantity = Math.min(
            10,
            Math.max(1, parseInt(session.metadata?.quantity ?? "1", 10) || 1)
          );
          const printOrder: PrintBookOrder = {
            productKey: quote.key,
            productLabel: quote.label,
            provider: quote.provider,
            format: quote.format,
            status: "paid",
            amountAud: quote.priceAud * quantity,
            pageCount: quote.pageCount,
            quantity,
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

          // Fire-and-forget — email failure must never break the webhook response.
          const customerEmail = printOrder.shipping?.email;
          if (customerEmail) {
            const appUrl =
              process.env.NEXT_PUBLIC_APP_URL ?? "https://storycot.com";
            void sendPrintOrderConfirmedEmail({
              toEmail: customerEmail,
              toName: printOrder.shipping?.name ?? "there",
              storyTitle:
                (await db.stories.getById(project.sourceStoryId))?.title ??
                "Your story",
              productLabel: quote.label,
              amountAud: quote.priceAud,
              trackUrl: `${appUrl}/stories/${project.sourceStoryId}`,
              appUrl,
            }).catch((err) => {
              console.error(
                "Print order confirmation email failed (non-fatal)",
                err
              );
              void logEvent({
                error: err,
                code: "payment.confirmation_email_failed",
                userId,
                userEmail: customerEmail,
                entityType: "book",
                entityId: project.id,
                source: "stripe/webhook",
                context: { checkoutSessionId: session.id },
              });
            });
          }
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
