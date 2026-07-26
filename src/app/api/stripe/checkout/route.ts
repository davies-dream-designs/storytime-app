import { NextRequest, NextResponse } from "next/server";
import { randomBytes, randomUUID } from "crypto";
import Stripe from "stripe";
import { auth, clerkClient } from "@clerk/nextjs/server";
import { getStripeLocale, isLocale, type Locale } from "@/i18n/locales";
import { db } from "@/lib/db";
import {
  isPrintProductKey,
  quotePrintProduct,
} from "@/lib/print-books/printProducts";
import {
  hasLuluPrintAssets,
  isLuluPrintProvider,
} from "@/lib/print-books/lulu";
import {
  canStartPrintCheckout,
  PRINT_ORDERING_COMING_SOON_MESSAGE,
} from "@/lib/print-books/launch";
import { isStoryPrintRestricted } from "@/lib/ipGuardrails";
import { CREDIT_PACKS, isCreditPackId } from "@/lib/creditPacks";

function getRequestOrigin(req: NextRequest) {
  const origin = req.headers.get("origin");
  if (origin) return origin.replace(/\/$/, "");

  const forwardedHost = req.headers.get("x-forwarded-host");
  if (forwardedHost) {
    const forwardedProto = req.headers.get("x-forwarded-proto") ?? "https";
    return `${forwardedProto}://${forwardedHost}`.replace(/\/$/, "");
  }

  // Referer is reliable for same-origin fetches when Origin is omitted (common on iOS Safari)
  const referer = req.headers.get("referer");
  if (referer) {
    try {
      return new URL(referer).origin;
    } catch {}
  }

  return (
    process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, "") ??
    (process.env.VERCEL_URL
      ? `https://${process.env.VERCEL_URL}`
      : "http://localhost:3000")
  );
}

function getRequestLocale(req: NextRequest): Locale | undefined {
  const referer = req.headers.get("referer");
  if (!referer) return undefined;

  try {
    const pathname = new URL(referer).pathname;
    const locale = pathname.split("/").filter(Boolean)[0];
    return isLocale(locale) ? locale : undefined;
  } catch {
    return undefined;
  }
}

function getAccountReturnPath(locale: Locale | undefined) {
  return locale ? `/${locale}/account` : "/account";
}

function getGiftReturnPath(locale: Locale | undefined, token: string) {
  return locale ? `/${locale}/gift/${token}` : `/gift/${token}`;
}

function getBookReturnPath(locale: Locale | undefined, projectId: string) {
  return locale ? `/${locale}/books/${projectId}` : `/books/${projectId}`;
}

function cleanText(value: unknown, maxLength: number) {
  return typeof value === "string" ? value.trim().slice(0, maxLength) : "";
}

function cleanEmail(value: unknown) {
  return cleanText(value, 254).toLowerCase();
}

function isValidEmail(value: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

function getReferralCookie(req: NextRequest, userId: string) {
  const ref = req.cookies.get("storycot_ref")?.value;
  if (!ref || ref === userId || !/^user_[A-Za-z0-9]+$/.test(ref)) {
    return undefined;
  }
  return ref;
}

function generateGiftToken() {
  return randomBytes(18).toString("base64url");
}

export async function POST(req: NextRequest) {
  const { userId } = await auth();
  if (!userId)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  if (!process.env.STRIPE_SECRET_KEY) {
    return NextResponse.json(
      { error: "Stripe not configured" },
      { status: 503 }
    );
  }

  const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

  const body = (await req.json()) as {
    pack?: string;
    type?: string;
    projectId?: string;
    productKey?: string;
    quantity?: number;
    recipientEmail?: string;
    recipientName?: string;
    message?: string;
  };
  const appUrl = getRequestOrigin(req);
  const locale = getRequestLocale(req);

  if (body.type === "gift_credits") {
    const pack = body.pack;
    if (!isCreditPackId(pack)) {
      return NextResponse.json({ error: "Invalid gift pack" }, { status: 400 });
    }

    const recipientEmail = cleanEmail(body.recipientEmail);
    if (!isValidEmail(recipientEmail)) {
      return NextResponse.json(
        { error: "Recipient email is required" },
        { status: 400 }
      );
    }

    const client = await clerkClient();
    const user = await client.users.getUser(userId);
    const purchaserEmail = user.primaryEmailAddress?.emailAddress;
    const recipientName = cleanText(body.recipientName, 80);
    const message = cleanText(body.message, 240);
    const packData = CREDIT_PACKS[pack];
    const token = generateGiftToken();
    const now = new Date().toISOString();
    const giftPath = getGiftReturnPath(locale, token);

    const session = await stripe.checkout.sessions.create({
      locale: getStripeLocale(locale),
      payment_method_types: ["card"],
      mode: "payment",
      billing_address_collection: "required",
      customer_email: purchaserEmail,
      line_items: [
        {
          price_data: {
            currency: "aud",
            product_data: {
              name: `Gift ${packData.productName}`,
              description: `A Storycot gift link redeemable for ${packData.credits} credits.`,
            },
            unit_amount: packData.amount,
          },
          quantity: 1,
        },
      ],
      metadata: {
        checkoutType: "gift_credits",
        userId,
        giftToken: token,
        pack,
        credits: packData.credits.toString(),
        recipientEmail,
        recipientName,
        referralReferrerUserId: getReferralCookie(req, userId) ?? "",
      },
      success_url: `${appUrl}${giftPath}?gift_success=1`,
      cancel_url: `${appUrl}${getAccountReturnPath(locale)}?gift_canceled=1`,
    });

    await db.giftOrders.create({
      id: randomUUID(),
      token,
      purchaserUserId: userId,
      purchaserEmail,
      recipientEmail,
      recipientName: recipientName || undefined,
      message: message || undefined,
      packId: pack,
      credits: packData.credits,
      amountAud: packData.amount,
      status: "checkout_started",
      checkoutSessionId: session.id,
      referralReferrerUserId: getReferralCookie(req, userId),
      createdAt: now,
      updatedAt: now,
    });

    return NextResponse.json({ url: session.url });
  }

  if (body.type === "digital_download") {
    if (!body.projectId) {
      return NextResponse.json(
        { error: "Invalid digital download checkout" },
        { status: 400 }
      );
    }

    const project = await db.bookProjects.getById(body.projectId);
    if (!project || project.userId !== userId) {
      return NextResponse.json({ error: "Book not found" }, { status: 404 });
    }

    if (project.status !== "ready") {
      return NextResponse.json(
        { error: "This book is not ready for download yet." },
        { status: 409 }
      );
    }

    if (project.assets.digitalDownloadUnlockedAt) {
      return NextResponse.json(
        { error: "Digital download is already unlocked for this book." },
        { status: 409 }
      );
    }

    const story = await db.stories.getById(project.sourceStoryId);
    const bookPath = getBookReturnPath(locale, project.id);

    await db.bookProjects.update(project.id, {
      assets: {
        ...project.assets,
        digitalDownloadCheckoutSessionId: undefined,
      },
    });

    const session = await stripe.checkout.sessions.create({
      locale: getStripeLocale(locale),
      payment_method_types: ["card"],
      mode: "payment",
      billing_address_collection: "required",
      line_items: [
        {
          price_data: {
            currency: "aud",
            product_data: {
              name: `Storycot Digital Book - ${story?.title ?? "Illustrated Story"}`,
              description:
                "Illustrated PDF and EPUB - download to any device, read forever.",
            },
            unit_amount: 995,
          },
          quantity: 1,
        },
      ],
      metadata: {
        checkoutType: "digital_download",
        userId,
        projectId: project.id,
      },
      success_url: `${appUrl}${bookPath}?download_success=1`,
      cancel_url: `${appUrl}${bookPath}?download_canceled=1`,
    });

    await db.bookProjects.update(project.id, {
      assets: {
        ...project.assets,
        digitalDownloadCheckoutSessionId: session.id,
      },
    });

    return NextResponse.json({ url: session.url });
  }

  if (body.type === "print_book") {
    const client = await clerkClient();
    const user = await client.users.getUser(userId);
    const isAdmin = user.privateMetadata.isAdmin === true;

    if (!canStartPrintCheckout(isAdmin)) {
      return NextResponse.json(
        { error: PRINT_ORDERING_COMING_SOON_MESSAGE },
        { status: 403 }
      );
    }

    if (!body.projectId || !isPrintProductKey(body.productKey)) {
      return NextResponse.json(
        { error: "Invalid print book checkout" },
        { status: 400 }
      );
    }

    const project = await db.bookProjects.getById(body.projectId);
    if (!project || project.userId !== userId) {
      return NextResponse.json({ error: "Book not found" }, { status: 404 });
    }

    if (project.status !== "ready") {
      return NextResponse.json(
        { error: "This book is not ready for print checkout yet." },
        { status: 409 }
      );
    }

    const story = await db.stories.getById(project.sourceStoryId);
    if (!story || story.userId !== userId) {
      return NextResponse.json({ error: "Story not found" }, { status: 404 });
    }

    if (isStoryPrintRestricted(story)) {
      return NextResponse.json(
        {
          error:
            "This story can be downloaded for personal review, but it cannot be ordered as a printed book because it may include protected characters, brands, or source material.",
        },
        { status: 409 }
      );
    }

    if (!project.assets.printPdfUrl || !project.assets.coverPdfUrl) {
      if (project.assets.downloadableFilesArchivedAt) {
        return NextResponse.json(
          {
            error:
              "This book's print files have been archived. Refresh PDFs before checkout.",
          },
          { status: 409 }
        );
      }
      return NextResponse.json(
        { error: "Print files are not ready yet." },
        { status: 409 }
      );
    }

    if (isLuluPrintProvider() && !hasLuluPrintAssets(project)) {
      return NextResponse.json(
        { error: "Lulu print files are not ready yet." },
        { status: 409 }
      );
    }

    if (project.assets.orderabilityState === "draft_only") {
      return NextResponse.json(
        { error: "This book still needs print review before checkout." },
        { status: 409 }
      );
    }

    const quantity = Math.min(10, Math.max(1, Math.floor(body.quantity ?? 1)));

    const quote = quotePrintProduct(project, body.productKey);
    if (!quote.isWithinSpecs) {
      return NextResponse.json(
        {
          error:
            quote.unsupportedReason ??
            "Selected print format is unavailable for this book.",
        },
        { status: 400 }
      );
    }

    const bookPath = getBookReturnPath(locale, project.id);
    const session = await stripe.checkout.sessions.create({
      locale: getStripeLocale(locale),
      payment_method_types: ["card"],
      mode: "payment",
      billing_address_collection: "required",
      shipping_address_collection: {
        allowed_countries: ["AU"],
      },
      line_items: [
        {
          price_data: {
            currency: "aud",
            product_data: {
              name: `Storycot ${quote.label} - ${project.pageCount} page book`,
              description: quote.format,
            },
            unit_amount: Math.round(quote.priceAud * 100),
          },
          quantity,
        },
      ],
      metadata: {
        checkoutType: "print_book",
        userId,
        projectId: project.id,
        productKey: quote.key,
        productLabel: quote.label,
        provider: quote.provider,
        format: quote.format,
        pageCount: quote.pageCount.toString(),
        amountAud: quote.priceAud.toFixed(2),
        quantity: quantity.toString(),
      },
      success_url: `${appUrl}${bookPath}?print_success=1`,
      cancel_url: `${appUrl}${bookPath}?print_canceled=1`,
    });

    await db.bookProjects.update(project.id, {
      printOrder: {
        productKey: quote.key,
        productLabel: quote.label,
        provider: quote.provider,
        format: quote.format,
        status: "checkout_started",
        amountAud: quote.priceAud,
        pageCount: quote.pageCount,
        quantity,
        checkoutSessionId: session.id,
        checkoutStartedAt: new Date().toISOString(),
      },
    });

    return NextResponse.json({ url: session.url });
  }

  const pack = body.pack;
  if (!isCreditPackId(pack))
    return NextResponse.json({ error: "Invalid pack" }, { status: 400 });
  const packData = CREDIT_PACKS[pack];

  const accountPath = getAccountReturnPath(locale);

  const session = await stripe.checkout.sessions.create({
    locale: getStripeLocale(locale),
    payment_method_types: ["card"],
    mode: "payment",
    billing_address_collection: "required",
    line_items: [
      {
        price_data: {
          currency: "aud",
          product_data: { name: packData.productName },
          unit_amount: packData.amount,
        },
        quantity: 1,
      },
    ],
    metadata: {
      checkoutType: "credits",
      userId,
      credits: packData.credits.toString(),
    },
    success_url: `${appUrl}${accountPath}?success=1`,
    cancel_url: `${appUrl}${accountPath}?canceled=1`,
  });

  return NextResponse.json({ url: session.url });
}
