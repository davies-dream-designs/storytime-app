"use client";

import { useState } from "react";

type Status = "idle" | "loading" | "done" | "error";

function MigrationButton({
  label,
  endpoint,
}: {
  label: string;
  endpoint: string;
}) {
  const [status, setStatus] = useState<Status>("idle");
  const [result, setResult] = useState<string | null>(null);

  async function run() {
    setStatus("loading");
    setResult(null);
    try {
      const res = await fetch(endpoint, { method: "POST" });
      const json = await res.json();
      setResult(JSON.stringify(json, null, 2));
      setStatus(res.ok ? "done" : "error");
    } catch (e) {
      setResult(String(e));
      setStatus("error");
    }
  }

  const colours = {
    idle: "bg-night-800 text-white hover:bg-night-700",
    loading: "bg-night-300 text-white cursor-not-allowed",
    done: "bg-emerald-600 text-white",
    error: "bg-blush-600 text-white",
  };

  return (
    <div className="flex flex-col gap-2">
      <button
        onClick={run}
        disabled={status === "loading"}
        className={`rounded-xl px-4 py-2 text-sm font-semibold transition-colors ${colours[status]}`}
      >
        {status === "loading" ? "Running…" : label}
      </button>
      {result && (
        <pre className="overflow-x-auto rounded-xl bg-night-50 p-3 text-xs text-night-700 whitespace-pre-wrap break-all">
          {result}
        </pre>
      )}
    </div>
  );
}

export default function MigrationActions() {
  return (
    <section className="rounded-2xl border border-night-100 bg-white p-6 shadow-sm mb-8">
      <h2 className="font-display text-xl font-bold text-night-800 mb-1">
        Database Migration (KV → Postgres)
      </h2>
      <p className="text-sm text-night-400 mb-5">
        Run these in order. Step 1 creates tables, step 2 copies data. Safe to
        re-run — uses{" "}
        <span className="font-mono">IF NOT EXISTS</span> /{" "}
        <span className="font-mono">onConflictDoNothing</span>.
      </p>
      <div className="flex flex-col gap-4">
        <MigrationButton
          label="1. Apply schema (create tables)"
          endpoint="/api/admin/migrate-pg-schema"
        />
        <MigrationButton
          label="2. Migrate KV data → Postgres"
          endpoint="/api/admin/migrate-pg"
        />
      </div>
    </section>
  );
}
