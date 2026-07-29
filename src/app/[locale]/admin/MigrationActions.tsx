"use client";

import { useState } from "react";

type Status = "idle" | "loading" | "done" | "error";

function MigrationButton({
  label,
  endpoint,
  description,
  confirm,
}: {
  label: string;
  endpoint: string;
  description?: string;
  confirm?: string;
}) {
  const [status, setStatus] = useState<Status>("idle");
  const [result, setResult] = useState<string | null>(null);

  async function run() {
    if (confirm && !window.confirm(confirm)) return;

    setStatus("loading");
    setResult(null);
    try {
      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(
          confirm ? { confirm: "RUN_PENDING_MIGRATIONS" } : undefined
        ),
      });
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
      {description && <p className="text-sm text-night-500">{description}</p>}
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
        Database Migrations
      </h2>
      <p className="text-sm text-night-400 mb-5">
        Admin-only schema maintenance. These actions run against the database
        configured in the deployed app environment.
      </p>
      <div className="flex flex-col gap-4">
        <MigrationButton
          label="Run pending Drizzle migrations"
          endpoint="/api/admin/db/migrate"
          description="Use after a preview/dev deployment if the database schema has not caught up with the code."
          confirm="Run all pending Drizzle migrations against the database configured for this deployment?"
        />
        <MigrationButton
          label="Create error log table (error_events)"
          endpoint="/api/admin/migrate-error-events"
        />
      </div>
    </section>
  );
}
