"use client";

import { useState } from "react";

export default function TestEmailActions() {
  const [status, setStatus] = useState<"idle" | "loading" | "done" | "error">(
    "idle"
  );
  const [result, setResult] = useState<string | null>(null);

  async function send() {
    setStatus("loading");
    try {
      const res = await fetch("/api/admin/test-emails");
      const data = (await res.json()) as {
        sentTo?: string;
        results?: Record<string, string>;
        error?: string;
      };
      if (!res.ok) throw new Error(data.error ?? "Unknown error");
      setResult(`Sent to ${data.sentTo} - ${JSON.stringify(data.results)}`);
      setStatus("done");
    } catch (err) {
      setResult(err instanceof Error ? err.message : String(err));
      setStatus("error");
    }
  }

  return (
    <div className="rounded-2xl border border-night-100 bg-white p-6 shadow-sm mb-8">
      <h2 className="font-display text-lg font-bold text-night-800 mb-1">
        Test emails
      </h2>
      <p className="text-sm text-night-400 mb-4">
        Sends sample transactional and public-gallery emails to your account
        email.
      </p>
      <button
        onClick={send}
        disabled={status === "loading"}
        className="rounded-full bg-night-700 px-5 py-2 text-sm font-bold text-moon-200 transition hover:bg-night-800 disabled:opacity-50"
      >
        {status === "loading" ? "Sending…" : "Send test emails"}
      </button>
      {result && (
        <p
          className={`mt-3 text-xs font-mono ${status === "error" ? "text-red-600" : "text-night-500"}`}
        >
          {result}
        </p>
      )}
    </div>
  );
}
