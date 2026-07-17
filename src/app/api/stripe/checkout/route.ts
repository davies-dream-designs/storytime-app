import { NextRequest, NextResponse } from "next/server";
import Stripe from "stripe";
import { auth } from "@clerk/nextjs/server";
import { getStripeLocale, isLocale, type Locale } from "@/i18n/locales";

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

  const { pack } = (await req.json()) as { pack: string };
  const packData = PACKS[pack as keyof typeof PACKS];
  if (!packData)
    return NextResponse.json({ error: "Invalid pack" }, { status: 400 });

  const appUrl = getRequestOrigin(req);
  const locale = getRequestLocale(req);
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
      userId,
      credits: packData.credits.toString(),
    },
    success_url: `${appUrl}${accountPath}?success=1`,
    cancel_url: `${appUrl}${accountPath}?canceled=1`,
  });

  return NextResponse.json({ url: session.url });
}
