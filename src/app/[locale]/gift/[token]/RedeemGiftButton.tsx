"use client";

import { useState } from "react";
import { useRouter } from "@/i18n/navigation";

export default function RedeemGiftButton({ token }: { token: string }) {
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const router = useRouter();

  async function redeem() {
    setLoading(true);
    setMessage("");
    setError("");
    try {
      const res = await fetch(`/api/gifts/${token}/redeem`, {
        method: "POST",
      });
      const data = (await res.json()) as {
        added?: number;
        credits?: number;
        error?: string;
      };
      if (!res.ok) throw new Error(data.error ?? "Could not redeem gift.");
      setMessage(`Added ${data.added} credits. Balance now ${data.credits}.`);
      window.dispatchEvent(new CustomEvent("storycot:credits-updated"));
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not redeem gift.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="mt-6">
      <button
        onClick={redeem}
        disabled={loading}
        className="storycot-btn storycot-btn-primary w-full sm:w-auto"
      >
        {loading ? "Redeeming..." : "Redeem gift credits"}
      </button>
      {message ? (
        <p className="mt-4 rounded-xl border border-green-200 bg-green-50 px-4 py-3 text-sm font-bold text-green-700">
          {message}
        </p>
      ) : null}
      {error ? (
        <p className="mt-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-bold text-red-700">
          {error}
        </p>
      ) : null}
    </div>
  );
}
