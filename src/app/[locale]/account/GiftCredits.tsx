"use client";

import { useState } from "react";
import { usePendingUI } from "@/components/GlobalPending";
import { CREDIT_PACKS } from "@/lib/creditPacks";

const PACKS = Object.values(CREDIT_PACKS);

export default function GiftCredits() {
  const [packId, setPackId] = useState("family");
  const [recipientName, setRecipientName] = useState("");
  const [recipientEmail, setRecipientEmail] = useState("");
  const [message, setMessage] = useState("");
  const [auConfirmed, setAuConfirmed] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const { startPending } = usePendingUI();

  async function purchaseGift() {
    if (!auConfirmed) {
      setError("Please confirm you are purchasing from Australia first.");
      return;
    }
    if (!recipientEmail.trim()) {
      setError("Add the recipient email first.");
      return;
    }

    setLoading(true);
    setError("");
    const stopPending = startPending("Preparing gift checkout...", 20000);
    try {
      const res = await fetch("/api/stripe/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: "gift_credits",
          pack: packId,
          recipientName,
          recipientEmail,
          message,
        }),
      });
      const data = (await res.json()) as { url?: string; error?: string };
      if (!res.ok || !data.url) {
        throw new Error(data.error ?? "Could not start gift checkout.");
      }
      startPending("Opening secure checkout...", 20000);
      window.location.href = data.url;
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Could not start gift checkout."
      );
      setLoading(false);
      stopPending();
    }
  }

  return (
    <section className="mt-8 rounded-3xl border border-moon-200 bg-white p-8 shadow-sm">
      <div className="flex items-start gap-4">
        <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-moon-100 text-2xl">
          🎁
        </div>
        <div className="min-w-0 flex-1">
          <h2 className="font-display text-2xl font-bold text-night-800">
            Gift a story
          </h2>
          <p className="mt-1 text-sm text-night-500">
            Send credits to a parent or grandparent. They get a private redeem
            link after checkout.
          </p>
        </div>
      </div>

      <div className="mt-6 grid gap-3">
        <label className="grid gap-1.5 text-sm font-bold text-night-700">
          Recipient email
          <input
            type="email"
            value={recipientEmail}
            onChange={(event) => setRecipientEmail(event.target.value)}
            placeholder="parent@example.com"
            className="rounded-xl border border-night-200 bg-white px-4 py-3 text-sm font-normal text-night-700 outline-none focus:border-moon-400 focus:ring-2 focus:ring-moon-100"
          />
        </label>
        <label className="grid gap-1.5 text-sm font-bold text-night-700">
          Recipient name
          <input
            value={recipientName}
            onChange={(event) => setRecipientName(event.target.value)}
            placeholder="Grandma, Dad, Auntie Jo..."
            maxLength={80}
            className="rounded-xl border border-night-200 bg-white px-4 py-3 text-sm font-normal text-night-700 outline-none focus:border-moon-400 focus:ring-2 focus:ring-moon-100"
          />
        </label>
        <label className="grid gap-1.5 text-sm font-bold text-night-700">
          Gift note
          <textarea
            value={message}
            onChange={(event) => setMessage(event.target.value)}
            placeholder="For bedtime stories with Bailey."
            maxLength={240}
            rows={3}
            className="resize-none rounded-xl border border-night-200 bg-white px-4 py-3 text-sm font-normal text-night-700 outline-none focus:border-moon-400 focus:ring-2 focus:ring-moon-100"
          />
        </label>
      </div>

      <div className="mt-5 grid gap-3 sm:grid-cols-3">
        {PACKS.map((pack) => (
          <button
            key={pack.id}
            onClick={() => setPackId(pack.id)}
            className={`rounded-2xl border px-4 py-4 text-left transition ${
              packId === pack.id
                ? "border-moon-400 bg-moon-50"
                : "border-night-100 bg-night-50 hover:bg-white"
            }`}
          >
            <span className="block font-display text-lg font-bold text-night-800">
              {pack.label}
            </span>
            <span className="mt-1 block text-sm text-night-500">
              {pack.credits} credits
            </span>
            <span className="mt-2 block font-bold text-night-700">
              {pack.price} {pack.priceNote}
            </span>
          </button>
        ))}
      </div>

      <label className="mt-5 flex items-start gap-3 rounded-2xl border border-star-200 bg-star-50 px-4 py-4 text-sm text-night-700">
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
            I am purchasing from Australia
          </span>
          <span className="mt-1 block text-night-500">
            Gift credit packs are sold in AUD for Australian customers only.
          </span>
        </span>
      </label>

      {error ? (
        <p className="mt-4 rounded-xl bg-red-50 px-4 py-3 text-sm font-bold text-red-600">
          {error}
        </p>
      ) : null}

      <button
        onClick={purchaseGift}
        disabled={loading || !auConfirmed}
        className="storycot-btn storycot-btn-primary mt-5 w-full"
      >
        {loading ? "Opening checkout..." : "Buy gift credits"}
      </button>
    </section>
  );
}
