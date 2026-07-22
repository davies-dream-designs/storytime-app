"use client";

import { useState } from "react";
import { usePendingUI } from "@/components/GlobalPending";
import type { PrintProductKey } from "@/lib/print-books/printProducts";

export default function PrintCheckoutButton({
  projectId,
  productKey,
  disabled,
  label,
}: {
  projectId: string;
  productKey: PrintProductKey;
  disabled?: boolean;
  label?: string;
}) {
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
        body: JSON.stringify({
          type: "print_book",
          projectId,
          productKey,
        }),
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

  return (
    <div className="mt-5">
      <button
        type="button"
        disabled={disabled || loading}
        onClick={startCheckout}
        className="storycot-btn storycot-btn-primary w-full"
      >
        {loading ? "Opening checkout..." : (label ?? "Order this format")}
      </button>
      {error ? (
        <p className="mt-3 rounded-xl bg-red-50 px-3 py-2 text-sm font-bold text-red-600">
          {error}
        </p>
      ) : null}
    </div>
  );
}
