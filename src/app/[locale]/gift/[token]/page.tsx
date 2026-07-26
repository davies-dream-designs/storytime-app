import { auth } from "@clerk/nextjs/server";
import { notFound } from "next/navigation";
import Nav from "@/components/Nav";
import { Link } from "@/i18n/navigation";
import { db } from "@/lib/db";
import { formatAudCents } from "@/lib/creditPacks";
import RedeemGiftButton from "./RedeemGiftButton";

export const metadata = { title: "Redeem Gift — Storycot" };

export default async function GiftRedeemPage({
  params,
}: {
  params: Promise<{ token: string; locale: string }>;
}) {
  const [{ token, locale }, { userId }] = await Promise.all([params, auth()]);
  const gift = await db.giftOrders.getByToken(token);
  if (!gift) notFound();

  const isPaid = gift.status === "paid";
  const isRedeemed = gift.status === "redeemed";
  const returnPath = `/${locale}/gift/${token}`;
  const signUpHref = `/sign-up?redirect_url=${encodeURIComponent(returnPath)}`;
  const signInHref = `/sign-in?redirect_url=${encodeURIComponent(returnPath)}`;

  return (
    <>
      <Nav />
      <main
        id="main-content"
        tabIndex={-1}
        className="mx-auto max-w-2xl px-5 py-14"
      >
        <div className="overflow-hidden rounded-3xl border border-moon-200 bg-white shadow-xl">
          <div className="bg-night-800 px-8 py-7 text-white">
            <p className="text-sm font-bold uppercase tracking-wide text-moon-300">
              Storycot gift
            </p>
            <h1 className="mt-2 font-display text-4xl font-bold text-moon-100">
              {gift.credits} story credits
            </h1>
            <p className="mt-2 text-night-300">
              A gift for {gift.recipientName || gift.recipientEmail}
            </p>
          </div>

          <div className="p-8">
            {gift.message ? (
              <blockquote className="rounded-2xl bg-star-50 px-5 py-4 font-display text-lg leading-relaxed text-night-700">
                {gift.message}
              </blockquote>
            ) : null}

            <div className="mt-6 grid gap-3 text-sm text-night-500 sm:grid-cols-2">
              <div className="rounded-2xl bg-night-50 px-4 py-3">
                <p className="font-bold text-night-800">Credits</p>
                <p>{gift.credits}</p>
              </div>
              <div className="rounded-2xl bg-night-50 px-4 py-3">
                <p className="font-bold text-night-800">Gift value</p>
                <p>{formatAudCents(gift.amountAud)}</p>
              </div>
            </div>

            {isPaid && userId ? <RedeemGiftButton token={token} /> : null}

            {isPaid && !userId ? (
              <div className="mt-6 flex flex-col gap-3 sm:flex-row">
                <Link
                  href={signUpHref}
                  className="storycot-btn storycot-btn-primary text-center"
                >
                  Create account to redeem
                </Link>
                <Link
                  href={signInHref}
                  className="storycot-btn storycot-btn-secondary text-center"
                >
                  Sign in
                </Link>
              </div>
            ) : null}

            {gift.status === "checkout_started" ? (
              <p className="mt-6 rounded-xl border border-star-200 bg-star-50 px-4 py-3 text-sm font-bold text-star-800">
                This gift is waiting for payment confirmation.
              </p>
            ) : null}

            {isRedeemed ? (
              <p className="mt-6 rounded-xl border border-green-200 bg-green-50 px-4 py-3 text-sm font-bold text-green-700">
                This gift has already been redeemed.
              </p>
            ) : null}

            {gift.status === "refunded" ? (
              <p className="mt-6 rounded-xl border border-night-200 bg-night-50 px-4 py-3 text-sm text-night-500">
                This gift is no longer available.
              </p>
            ) : null}
          </div>
        </div>
      </main>
    </>
  );
}
