"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { usePendingUI } from "@/components/GlobalPending";

const PACKS = [
  {
    id: "starter",
    label: "Starter",
    credits: 10,
    price: "$4.99",
    priceNote: "AUD",
    popular: false,
  },
  {
    id: "family",
    label: "Family",
    credits: 30,
    price: "$11.99",
    priceNote: "AUD",
    popular: true,
  },
  {
    id: "pro",
    label: "Bedtime Pro",
    credits: 100,
    price: "$29.99",
    priceNote: "AUD",
    popular: false,
  },
] as const;

export default function CreditPacks({
  showPaidPacks = true,
  showFreeTopUp = false,
}: {
  showPaidPacks?: boolean;
  showFreeTopUp?: boolean;
}) {
  const [loading, setLoading] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [auConfirmed, setAuConfirmed] = useState(false);
  const [devAdding, setDevAdding] = useState(false);
  const [devMessage, setDevMessage] = useState("");
  const t = useTranslations("account");
  const { startPending } = usePendingUI();

  async function handleDevAddCredits() {
    setDevAdding(true);
    setDevMessage("");
    try {
      const res = await fetch("/api/dev/credits", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ amount: 10 }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed");
      setDevMessage(`Added 10 credits. Total: ${data.total}`);
    } catch (err) {
      setDevMessage(err instanceof Error ? err.message : "Failed");
    }
    setDevAdding(false);
  }

  async function handlePurchase(packId: string) {
    if (!auConfirmed) {
      setError(t("auOnlyError"));
      return;
    }

    setLoading(packId);
    setError("");
    const stopPending = startPending(t("checkoutPending"), 20000);
    try {
      const res = await fetch("/api/stripe/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pack: packId }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Something went wrong");
      startPending(t("checkoutRedirecting"), 20000);
      window.location.href = data.url;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
      setLoading(null);
      stopPending();
    }
  }

  return (
    <div className="mt-8">
      {showPaidPacks ? (
        <>
          <h2 className="font-display text-2xl font-bold text-night-800">
            {t("packsTitle")}
          </h2>
          <p className="mt-1 text-night-400">{t("packsSub")}</p>

          <div className="mt-5 rounded-2xl border border-star-200 bg-star-50 px-4 py-4">
            <label className="flex items-start gap-3 text-sm text-night-700">
              <input
                type="checkbox"
                checked={auConfirmed}
                onChange={(event) => {
                  setAuConfirmed(event.target.checked);
                  if (event.target.checked) setError("");
                }}
                className="mt-0.5 h-4 w-4 rounded border-night-300 text-night-700 focus:ring-night-500"
              />
              <span>
                <span className="block font-bold text-night-800">
                  {t("auOnlyLabel")}
                </span>
                <span className="mt-1 block text-night-500">
                  {t("auOnlyHelp")}
                </span>
              </span>
            </label>
          </div>

          <div className="mt-5 grid gap-4 sm:grid-cols-3">
            {PACKS.map((pack) => {
              const disabled = !auConfirmed || loading !== null;

              return (
                <div
                  key={pack.id}
                  className={`relative rounded-2xl border p-6 transition ${
                    pack.popular
                      ? "border-moon-400 bg-moon-50"
                      : "border-night-100 bg-white"
                  } ${!auConfirmed ? "opacity-75" : ""}`}
                >
                  {pack.popular && (
                    <span className="absolute -top-3 left-1/2 -translate-x-1/2 rounded-full bg-moon-400 px-3 py-0.5 text-xs font-bold text-night-900">
                      {t("packPopular")}
                    </span>
                  )}
                  <p className="font-display text-lg font-bold text-night-700">
                    {pack.label}
                  </p>
                  <p className="mt-1 text-night-500">
                    {t("packGet", { count: pack.credits })}
                  </p>
                  <p className="mt-3 font-display text-2xl font-bold text-night-800">
                    {pack.price}{" "}
                    <span className="text-sm font-normal text-night-400">
                      {pack.priceNote}
                    </span>
                  </p>
                  <button
                    onClick={() => handlePurchase(pack.id)}
                    disabled={disabled}
                    title={!auConfirmed ? t("packConfirmAu") : undefined}
                    className={`storycot-btn mt-4 w-full ${
                      pack.popular
                        ? "storycot-btn-primary"
                        : "storycot-btn-secondary"
                    }`}
                  >
                    {loading === pack.id
                      ? t("packLoading")
                      : !auConfirmed
                        ? t("packConfirmAu")
                        : t("packGet", { count: pack.credits })}
                  </button>
                </div>
              );
            })}
          </div>
        </>
      ) : null}

      {error && (
        <p className="mt-4 rounded-xl bg-red-50 px-4 py-3 text-sm font-bold text-red-600">
          {error}
        </p>
      )}

      {showPaidPacks ? (
        <p className="mt-4 text-center text-xs text-night-400">
          {t("packFooter")}
        </p>
      ) : null}

      {showFreeTopUp ? (
        <div className="mt-6 rounded-2xl border border-dashed border-night-300 bg-night-50 p-4">
          <p className="text-xs font-bold uppercase tracking-wide text-night-400">
            Admin
          </p>
          <button
            onClick={handleDevAddCredits}
            disabled={devAdding}
            className="storycot-btn storycot-btn-secondary mt-2"
          >
            {devAdding ? "Adding…" : "Top up 10 credits for free"}
          </button>
          {devMessage ? (
            <p className="mt-2 text-sm text-night-600">{devMessage}</p>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
