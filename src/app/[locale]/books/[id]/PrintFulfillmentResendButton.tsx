"use client";

import { useState } from "react";

export default function PrintFulfillmentResendButton({
  bookId,
}: {
  bookId: string;
}) {
  const [status, setStatus] = useState<
    "idle" | "submitting" | "submitted" | "failed"
  >("idle");
  const [message, setMessage] = useState<string | undefined>();

  async function handleClick() {
    setStatus("submitting");
    setMessage(undefined);

    const res = await fetch(`/api/admin/print-orders/${bookId}/resend`, {
      method: "POST",
    });
    const body = await res.json().catch(() => ({}));

    if (!res.ok) {
      setStatus("failed");
      setMessage(body.error ?? "Could not send the order to Prodigi.");
      return;
    }

    const fulfillment = body.printOrder?.fulfillment;
    if (fulfillment?.status === "submitted") {
      setStatus("submitted");
      setMessage(
        fulfillment.externalOrderId
          ? `Sent to Prodigi. Printer ref: ${fulfillment.externalOrderId}`
          : "Sent to Prodigi."
      );
      return;
    }

    setStatus("failed");
    setMessage(
      fulfillment?.message ?? "Prodigi did not accept the order. Check logs."
    );
  }

  return (
    <div className="mt-5 rounded-2xl border border-blush-200 bg-white/80 p-4">
      <p className="text-sm font-bold text-night-800">Admin print action</p>
      <p className="mt-1 text-sm leading-6 text-night-500">
        This retries fulfillment for this paid order only. It does not create a
        new Stripe charge.
      </p>
      <button
        type="button"
        onClick={handleClick}
        disabled={status === "submitting" || status === "submitted"}
        className="storycot-btn storycot-btn-secondary mt-3 disabled:cursor-not-allowed disabled:opacity-60"
      >
        {status === "submitting" ? "Sending..." : "Send to Prodigi"}
      </button>
      {message ? (
        <p
          className={`mt-3 text-sm ${
            status === "submitted" ? "text-green-700" : "text-blush-700"
          }`}
        >
          {message}
        </p>
      ) : null}
    </div>
  );
}
