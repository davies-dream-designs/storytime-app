"use client";

import { useState } from "react";
import { usePendingUI } from "@/components/GlobalPending";
import type { PrintProductKey } from "@/lib/print-books/printProducts";

function formatAud(value: number) {
  return new Intl.NumberFormat("en-AU", { style: "currency", currency: "AUD" }).format(value);
}

export default function PrintCheckoutButton({
  projectId,
  productKey,
  priceAud,
  disabled,
  label,
}: {
  projectId: string;
  productKey: PrintProductKey;
  priceAud: number;
  disabled?: boolean;
  label?: string;
}) {
  const [quantity, setQuantity] = useState(1);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const { startPending } = usePendingUI();

  async function startCheckout() {
    setLoading(true);
    setError("");
    const stopPending = startPending("Preparing secure checkout...", 20000);

    try {
      const res = await fetch("/api/stripe/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type: "print_book", projectId, productKey, quantity }),
      });
      const data = (await res.json()) as { url?: string; error?: string };
      if (!res.ok || !data.url) {
        throw new Error(data.error ?? "Could not start checkout.");
      }

      startPending("Opening secure checkout...", 20000);
      window.location.href = data.url;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not start checkout.");
      setLoading(false);
      stopPending();
    }
  }

  const total = priceAud * quantity;

  return (
    <div className="mt-5 space-y-3">
      {/* Quantity picker */}
      {!disabled && (
        <div className="flex items-center justify-between rounded-xl bg-night-50 px-4 py-3">
          <span className="text-sm font-medium text-night-600">Quantity</span>
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => setQuantity((q) => Math.max(1, q - 1))}
              disabled={quantity <= 1}
              className="flex h-8 w-8 items-center justify-center rounded-full bg-white text-night-700 shadow-sm transition hover:bg-night-100 disabled:opacity-30"
              aria-label="Decrease quantity"
            >
              −
            </button>
            <span className="w-5 text-center text-sm font-bold text-night-800">{quantity}</span>
            <button
              type="button"
              onClick={() => setQuantity((q) => Math.min(10, q + 1))}
              disabled={quantity >= 10}
              className="flex h-8 w-8 items-center justify-center rounded-full bg-white text-night-700 shadow-sm transition hover:bg-night-100 disabled:opacity-30"
              aria-label="Increase quantity"
            >
              +
            </button>
          </div>
        </div>
      )}

      {/* Total when qty > 1 */}
      {!disabled && quantity > 1 && (
        <div className="flex items-center justify-between px-1 text-sm">
          <span className="text-night-400">{formatAud(priceAud)} × {quantity}</span>
          <span className="font-bold text-night-800">{formatAud(total)} total</span>
        </div>
      )}

      <button
        type="button"
        disabled={disabled || loading}
        onClick={startCheckout}
        className="storycot-btn storycot-btn-primary w-full"
      >
        {loading ? "Opening checkout..." : (label ?? "Order this format")}
      </button>

      {error ? (
        <p className="rounded-xl bg-red-50 px-3 py-2 text-sm font-bold text-red-600">
          {error}
        </p>
      ) : null}
    </div>
  );
}
