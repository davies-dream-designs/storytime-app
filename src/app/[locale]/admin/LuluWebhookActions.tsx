"use client";

import { useState } from "react";

type WebhookEntry = { id: string; url: string; is_active: boolean; topics: string[] };

export default function LuluWebhookActions() {
  const [status, setStatus] = useState<"idle" | "loading" | "done" | "error">("idle");
  const [result, setResult] = useState<string | null>(null);
  const [webhooks, setWebhooks] = useState<WebhookEntry[] | null>(null);

  async function listWebhooks() {
    setStatus("loading");
    try {
      const res = await fetch("/api/admin/lulu/register-webhook");
      const data = await res.json() as { webhooks?: WebhookEntry[]; error?: string };
      if (!res.ok) throw new Error(data.error ?? "Failed");
      setWebhooks(data.webhooks ?? []);
      setResult(null);
      setStatus("done");
    } catch (err) {
      setResult(err instanceof Error ? err.message : String(err));
      setStatus("error");
    }
  }

  async function registerWebhook() {
    setStatus("loading");
    try {
      const res = await fetch("/api/admin/lulu/register-webhook", { method: "POST" });
      const data = await res.json() as { status?: string; webhookUrl?: string; error?: string; detail?: unknown };
      if (!res.ok) throw new Error(data.error ?? JSON.stringify(data.detail));
      setResult(`${data.status} → ${data.webhookUrl}`);
      setWebhooks(null);
      setStatus("done");
    } catch (err) {
      setResult(err instanceof Error ? err.message : String(err));
      setStatus("error");
    }
  }

  return (
    <div className="rounded-2xl border border-night-100 bg-white p-6 shadow-sm mb-8">
      <h2 className="font-display text-lg font-bold text-night-800 mb-1">Lulu webhook</h2>
      <p className="text-sm text-night-400 mb-4">Register or check the Lulu print status webhook.</p>
      <div className="flex gap-3 flex-wrap">
        <button
          onClick={listWebhooks}
          disabled={status === "loading"}
          className="rounded-full border border-night-200 px-5 py-2 text-sm font-bold text-night-700 transition hover:bg-night-50 disabled:opacity-50"
        >
          {status === "loading" ? "Loading…" : "List webhooks"}
        </button>
        <button
          onClick={registerWebhook}
          disabled={status === "loading"}
          className="rounded-full bg-night-700 px-5 py-2 text-sm font-bold text-moon-200 transition hover:bg-night-800 disabled:opacity-50"
        >
          {status === "loading" ? "Registering…" : "Register webhook"}
        </button>
      </div>
      {result && (
        <p className={`mt-3 text-xs font-mono ${status === "error" ? "text-red-600" : "text-night-500"}`}>
          {result}
        </p>
      )}
      {webhooks && (
        <div className="mt-3">
          {webhooks.length === 0 ? (
            <p className="text-xs text-night-400">No webhooks registered yet.</p>
          ) : (
            <ul className="space-y-2">
              {webhooks.map((w) => (
                <li key={w.id} className="rounded-xl bg-night-50 px-3 py-2 text-xs font-mono text-night-700">
                  <span className={`mr-2 font-bold ${w.is_active ? "text-green-600" : "text-red-500"}`}>
                    {w.is_active ? "●" : "○"}
                  </span>
                  {w.url}
                  <span className="ml-2 text-night-400">{w.topics.join(", ")}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
