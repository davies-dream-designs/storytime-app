import { randomUUID } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import Stripe from "stripe";
import { auth, clerkClient } from "@clerk/nextjs/server";
import { getStripeLocale } from "@/i18n/locales";
import { db } from "@/lib/db";
import {
  getRequestLocale,
  getRequestOrigin,
  parsePrintShippingAddress,
} from "@/lib/checkout/request";
import { isStoryPrintRestricted } from "@/lib/ipGuardrails";
import {
  getLuluShippingAmountAud,
  hasLuluPrintAssets,
  isLuluPrintProvider,
  quoteLuluPrintJob,
} from "@/lib/print-books/lulu";
import { hasBlockingProofingIssue } from "@/lib/print-books/readiness";
import {
  isPrintProductKey,
  quotePrintProduct,
} from "@/lib/print-books/printProducts";
import { getLuluTotalCostAud, toAudCents } from "@/lib/print-books/margin";

function getPublicStoryReturnPath(locale: string | undefined, token?: string) {
  const path = token ? `/s/${token}` : "/public";
  return locale ? `/${locale}${path}` : path;
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!process.env.STRIPE_SECRET_KEY) {
    return NextResponse.json(
      { error: "Stripe not configured" },
      { status: 503 }
    );
  }

  const { id: storyId } = await params;
  const body = (await req.json()) as {
    productKey?: string;
    quantity?: number;
    shipping?: unknown;
  };

  if (!isPrintProductKey(body.productKey)) {
    return NextResponse.json(
      { error: "Invalid print book checkout" },
      { status: 400 }
    );
  }

  const story = await db.stories.getById(storyId);
  if (
    !story ||
    story.visibility !== "public" ||
    story.publicReviewStatus !== "approved" ||
    story.status !== "ready"
  ) {
    return NextResponse.json(
      { error: "Public story not found" },
      { status: 404 }
    );
  }

  if (story.userId === userId) {
    return NextResponse.json(
      { error: "Story creators cannot buy their own public listing here." },
      { status: 409 }
    );
  }

  if (isStoryPrintRestricted(story)) {
    return NextResponse.json(
      {
        error:
          "This story cannot be ordered as a printed book because it may include protected characters, brands, or source material.",
      },
      { status: 409 }
    );
  }

  const printReadiness =
    await db.bookProjects.getPublicPrintReadinessByStoryIds([story.id]);
  const readiness = printReadiness[story.id];
  if (!readiness?.ready) {
    return NextResponse.json(
      {
        error:
          readiness?.detail ??
          "This public story is not ready for print checkout yet.",
      },
      { status: 409 }
    );
  }

  const project = await db.bookProjects.getById(readiness.bookProjectId);
  if (
    !project ||
    project.sourceStoryId !== story.id ||
    project.userId !== story.userId ||
    project.status !== "ready"
  ) {
    return NextResponse.json(
      { error: "Print-ready book not found" },
      { status: 404 }
    );
  }

  if (
    project.assets.orderabilityState !== "export_ready" &&
    project.assets.orderabilityState !== "order_ready"
  ) {
    return NextResponse.json(
      { error: "This book still needs print review before checkout." },
      { status: 409 }
    );
  }

  if (
    hasBlockingProofingIssue(project) ||
    !hasLuluPrintAssets(project, body.productKey)
  ) {
    return NextResponse.json(
      { error: "Lulu print files are not ready yet." },
      { status: 409 }
    );
  }

  const shipping = parsePrintShippingAddress(body.shipping);
  if (!shipping) {
    return NextResponse.json(
      { error: "Australian shipping address is required before checkout." },
      { status: 400 }
    );
  }

  const quantity = Math.min(10, Math.max(1, Math.floor(body.quantity ?? 1)));
  const quote = await quotePrintProduct(project, body.productKey);
  if (!quote.isWithinSpecs) {
    return NextResponse.json(
      {
        error:
          quote.unsupportedReason ??
          "Selected print format is unavailable for this story.",
      },
      { status: 400 }
    );
  }
  if (quote.pricingUnavailable || quote.priceAud === undefined) {
    return NextResponse.json(
      {
        error:
          "We couldn't get a live price for that format right now. Please try again shortly.",
      },
      { status: 502 }
    );
  }

  if (!isLuluPrintProvider()) {
    return NextResponse.json(
      {
        error: "Printed book ordering is temporarily unavailable for this format.",
      },
      { status: 503 }
    );
  }

  let luluQuote;
  let shippingAmountAud: number;
  try {
    luluQuote = await quoteLuluPrintJob({
      pageCount: quote.pageCount,
      productKey: quote.key,
      quantity,
      shipping,
    });
    shippingAmountAud = getLuluShippingAmountAud(luluQuote);
  } catch (err) {
    console.error("Public print shipping quote failed", err);
    return NextResponse.json(
      {
        error:
          "We couldn't calculate shipping for that address. Please check it and try again.",
      },
      { status: 502 }
    );
  }

  // Product subtotal is precisely the configured margin multiplier (1.2x by
  // default) applied to Lulu's live manufacturing cost. Shipping is a
  // separate, exact pass-through of Lulu's live address/quantity quote —
  // neither is adjusted by the legacy support-buffer / margin-floor logic.
  const subtotalAud = Number((quote.priceAud * quantity).toFixed(2));
  const totalAud = Number((subtotalAud + shippingAmountAud).toFixed(2));
  const luluCostAud = getLuluTotalCostAud(luluQuote);
  const marginAud = Number((totalAud - luluCostAud).toFixed(2));

  const appUrl = getRequestOrigin(req);
  const locale = getRequestLocale(req);
  const returnPath = getPublicStoryReturnPath(locale, story.shareToken);
  const client = await clerkClient();
  const user = await client.users.getUser(userId);
  const buyerEmail =
    user.primaryEmailAddress?.emailAddress ?? shipping.email ?? undefined;
  const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
  const session = await stripe.checkout.sessions.create({
    locale: getStripeLocale(locale),
    payment_method_types: ["card"],
    mode: "payment",
    billing_address_collection: "required",
    customer_email: buyerEmail,
    shipping_address_collection: {
      allowed_countries: ["AU"],
    },
    line_items: [
      {
        price_data: {
          currency: "aud",
          product_data: {
            name: `Storycot ${quote.label} - ${story.title}`,
            description: quote.format,
          },
          unit_amount: toAudCents(quote.priceAud),
        },
        quantity,
      },
      {
        price_data: {
          currency: "aud",
          product_data: {
            name: "Shipping",
            description: "Australian print delivery",
          },
          unit_amount: toAudCents(shippingAmountAud),
        },
        quantity: 1,
      },
    ],
    metadata: {
      checkoutType: "public_print_book",
      userId,
      buyerUserId: userId,
      ownerUserId: story.userId,
      storyId: story.id,
      projectId: project.id,
      productKey: quote.key,
      productLabel: quote.label,
      provider: quote.provider,
      format: quote.format,
      pageCount: quote.pageCount.toString(),
      amountAud: totalAud.toFixed(2),
      subtotalAud: subtotalAud.toFixed(2),
      shippingAmountAud: shippingAmountAud.toFixed(2),
      luluCostAud: luluCostAud.toFixed(2),
      marginAud: marginAud.toFixed(2),
      quantity: quantity.toString(),
    },
    success_url: `${appUrl}${returnPath}?print_success=1`,
    cancel_url: `${appUrl}${returnPath}?print_canceled=1`,
  });

  const now = new Date().toISOString();
  await db.printOrders.create({
    id: randomUUID(),
    type: "public_purchase",
    projectId: project.id,
    storyId: story.id,
    ownerUserId: story.userId,
    buyerUserId: userId,
    buyerEmail,
    productKey: quote.key,
    productLabel: quote.label,
    provider: "lulu",
    format: quote.format,
    status: "checkout_started",
    amountAudCents: toAudCents(totalAud),
    subtotalAudCents: toAudCents(subtotalAud),
    shippingAudCents: toAudCents(shippingAmountAud),
    luluCostAudCents: toAudCents(luluCostAud),
    marginAudCents: toAudCents(marginAud),
    pageCount: quote.pageCount,
    quantity,
    checkoutSessionId: session.id,
    billingCountry: "AU",
    shipping,
    checkoutStartedAt: now,
    createdAt: now,
    updatedAt: now,
  });

  return NextResponse.json({ url: session.url });
}
