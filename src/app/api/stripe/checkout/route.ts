import { NextRequest, NextResponse } from "next/server";
import Stripe from "stripe";
import { auth } from "@clerk/nextjs/server";
import { getStripeLocale, isLocale, type Locale } from "@/i18n/locales";
import { db } from "@/lib/db";
import {
  isPrintProductKey,
  quotePrintProduct,
} from "@/lib/print-books/printProducts";

const PACKS = {
  starter: { credits: 10, amount: 499, label: "Storycot Starter — 10 stories" },
  family: { credits: 30, amount: 1199, label: "Storycot Family — 30 stories" },
  pro: {
    credits: 100,
    amount: 2999,
    label: "Storycot Bedtime Pro — 100 stories",
  },
} as const;

function getRequestOrigin(req: NextRequest) {
  const origin = req.headers.get("origin");
  if (origin) return origin.replace(/\/$/, "");

  const forwardedHost = req.headers.get("x-forwarded-host");
  if (forwardedHost) {
    const forwardedProto = req.headers.get("x-forwarded-proto") ?? "https";
    return `${forwardedProto}://${forwardedHost}`.replace(/\/$/, "");
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

function getBookReturnPath(locale: Locale | undefined, projectId: string) {
  return locale ? `/${locale}/books/${projectId}` : `/books/${projectId}`;
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
  };
  const appUrl = getRequestOrigin(req);
  const locale = getRequestLocale(req);

  if (body.type === "print_book") {
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

    if (!project.assets.printPdfUrl || !project.assets.coverPdfUrl) {
      return NextResponse.json(
        { error: "Print files are not ready yet." },
        { status: 409 }
      );
    }

    if (project.assets.orderabilityState === "draft_only") {
      return NextResponse.json(
        { error: "This book still needs print review before checkout." },
        { status: 409 }
      );
    }

    const quote = quotePrintProduct(project, body.productKey);
    if (!quote.isWithinSpecs) {
      return NextResponse.json(
        { error: "Selected print format is unavailable for this book." },
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
          quantity: 1,
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
        checkoutSessionId: session.id,
        checkoutStartedAt: new Date().toISOString(),
      },
    });

    return NextResponse.json({ url: session.url });
  }

  const pack = body.pack;
  const packData = PACKS[pack as keyof typeof PACKS];
  if (!packData)
    return NextResponse.json({ error: "Invalid pack" }, { status: 400 });

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
          product_data: { name: packData.label },
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
