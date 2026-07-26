"use client";

import { useCallback, useEffect, useState } from "react";
import type { ErrorEventRecord, ErrorSeverity } from "@/lib/errors";
import {
  SEVERITY_STYLES,
  SEVERITY_DOT,
  DOMAIN_STYLE,
  formatAuDateTime,
} from "./errorStyles";

const DOMAINS = [
  "story",
  "book",
  "print",
  "payment",
  "credits",
  "webhook",
  "external",
  "system",
] as const;

const SEVERITIES: ErrorSeverity[] = ["info", "warning", "error", "critical"];

type Filters = {
  domain: string;
  minSeverity: string;
  resolved: string; // "false" | "true" | "all"
  since: string; // "24h" | "7d" | "30d" | "all"
  code: string;
  search: string;
};

const DEFAULT_FILTERS: Filters = {
  domain: "",
  minSeverity: "",
  resolved: "false",
  since: "7d",
  code: "",
  search: "",
};

export default function IssuesSection() {
  const [filters, setFilters] = useState<Filters>(DEFAULT_FILTERS);
  const [events, setEvents] = useState<ErrorEventRecord[]>([]);
  const [summary, setSummary] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    const params = new URLSearchParams();
    if (filters.domain) params.set("domain", filters.domain);
    if (filters.minSeverity) params.set("minSeverity", filters.minSeverity);
    if (filters.resolved !== "all") params.set("resolved", filters.resolved);
    if (filters.since) params.set("since", filters.since);
    if (filters.code) params.set("code", filters.code);
    if (filters.search.trim()) params.set("search", filters.search.trim());
    try {
      const res = await fetch(`/api/admin/error-events?${params.toString()}`);
      if (!res.ok) throw new Error(`Failed to load (${res.status})`);
      const data = await res.json();
      setEvents(data.events ?? []);
      setSummary(data.summary ?? {});
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load issues");
    } finally {
      setLoading(false);
    }
  }, [filters]);

  // Debounce so typing in search/code doesn't spam the API.
  useEffect(() => {
    const t = setTimeout(load, 250);
    return () => clearTimeout(t);
  }, [load]);

  const setFilter = (key: keyof Filters, value: string) =>
    setFilters((f) => ({ ...f, [key]: value }));

  const unresolvedTotal = Object.values(summary).reduce((a, b) => a + b, 0);

  return (
    <div className="rounded-2xl border border-night-100 bg-white p-4 sm:p-6 shadow-sm mb-6">
      <div className="flex flex-wrap items-center justify-between gap-2 mb-1">
        <h2 className="font-display text-xl font-bold text-night-800">
          Issues
        </h2>
        <button
          onClick={load}
          className="rounded-full border border-night-200 px-3 py-1 text-xs font-bold text-night-500 hover:bg-night-50"
        >
          ↻ Refresh
        </button>
      </div>

      {/* Unresolved summary */}
      <div className="mb-4 flex flex-wrap items-center gap-2 text-xs">
        <span className="text-night-400">{unresolvedTotal} unresolved</span>
        {SEVERITIES.slice()
          .reverse()
          .filter((s) => summary[s])
          .map((s) => (
            <button
              key={s}
              onClick={() => {
                setFilter("minSeverity", s);
                setFilter("resolved", "false");
              }}
              className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 font-bold ${SEVERITY_STYLES[s]}`}
            >
              <span className={`h-1.5 w-1.5 rounded-full ${SEVERITY_DOT[s]}`} />
              {summary[s]} {s}
            </button>
          ))}
      </div>

      {/* Filters */}
      <div className="mb-4 grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
        <select
          value={filters.domain}
          onChange={(e) => setFilter("domain", e.target.value)}
          className="rounded-lg border border-night-200 px-2 py-1.5 text-sm"
        >
          <option value="">All domains</option>
          {DOMAINS.map((d) => (
            <option key={d} value={d}>
              {d}
            </option>
          ))}
        </select>
        <select
          value={filters.minSeverity}
          onChange={(e) => setFilter("minSeverity", e.target.value)}
          className="rounded-lg border border-night-200 px-2 py-1.5 text-sm"
        >
          <option value="">Any severity</option>
          {SEVERITIES.map((s) => (
            <option key={s} value={s}>
              {s}+
            </option>
          ))}
        </select>
        <select
          value={filters.resolved}
          onChange={(e) => setFilter("resolved", e.target.value)}
          className="rounded-lg border border-night-200 px-2 py-1.5 text-sm"
        >
          <option value="false">Unresolved</option>
          <option value="true">Resolved</option>
          <option value="all">All</option>
        </select>
        <select
          value={filters.since}
          onChange={(e) => setFilter("since", e.target.value)}
          className="rounded-lg border border-night-200 px-2 py-1.5 text-sm"
        >
          <option value="24h">Last 24h</option>
          <option value="7d">Last 7 days</option>
          <option value="30d">Last 30 days</option>
          <option value="all">All time</option>
        </select>
        <input
          value={filters.code}
          onChange={(e) => setFilter("code", e.target.value)}
          placeholder="code…"
          className="rounded-lg border border-night-200 px-2 py-1.5 text-sm"
        />
        <input
          value={filters.search}
          onChange={(e) => setFilter("search", e.target.value)}
          placeholder="search email / id / msg…"
          className="col-span-2 rounded-lg border border-night-200 px-2 py-1.5 text-sm sm:col-span-1"
        />
      </div>

      {error && (
        <p className="mb-3 rounded-lg bg-red-50 p-2 text-sm text-red-700">
          {error}
        </p>
      )}

      {loading ? (
        <p className="py-6 text-center text-night-400">Loading…</p>
      ) : events.length === 0 ? (
        <p className="py-6 text-center text-night-400">
          No issues match. Nice.
        </p>
      ) : (
        <ul className="flex flex-col gap-3">
          {events.map((ev) => (
            <EventRow key={ev.id} event={ev} onChanged={load} />
          ))}
        </ul>
      )}
    </div>
  );
}

function EventRow({
  event,
  onChanged,
}: {
  event: ErrorEventRecord;
  onChanged: () => void;
}) {
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const severity = (event.severity as ErrorSeverity) ?? "error";
  const resolved = Boolean(event.resolvedAt);

  const act = async (
    label: string,
    fn: () => Promise<Response>,
    { refresh = true }: { refresh?: boolean } = {}
  ) => {
    setBusy(label);
    setMsg(null);
    try {
      const res = await fn();
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setMsg(data.error ?? `Failed (${res.status})`);
      } else {
        setMsg(data.mode ? `Queued (${data.mode})` : "Done ✓");
        if (refresh) onChanged();
      }
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "Failed");
    } finally {
      setBusy(null);
    }
  };

  const resolve = () => {
    const note = window.prompt("Resolution note (optional):") ?? undefined;
    return act("resolve", () =>
      fetch(`/api/admin/error-events/${event.id}/resolve`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ resolved: true, note }),
      })
    );
  };

  const reopen = () =>
    act("reopen", () =>
      fetch(`/api/admin/error-events/${event.id}/resolve`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ resolved: false }),
      })
    );

  const retryBook = () =>
    act(
      "retry",
      () =>
        fetch(`/api/admin/books/${event.entityId}/retry`, { method: "POST" }),
      { refresh: false }
    );

  const resendFulfillment = () =>
    act(
      "resend",
      () =>
        fetch(`/api/admin/print-orders/${event.entityId}/resend`, {
          method: "POST",
        }),
      { refresh: false }
    );

  return (
    <li
      className={`rounded-xl border p-3 ${
        resolved
          ? "border-night-100 bg-night-50/40 opacity-70"
          : "border-night-100 bg-white"
      }`}
    >
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="flex flex-wrap items-center gap-1.5">
          <span
            className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-bold ${SEVERITY_STYLES[severity]}`}
          >
            <span
              className={`h-1.5 w-1.5 rounded-full ${SEVERITY_DOT[severity]}`}
            />
            {severity}
          </span>
          <span
            className={`rounded-full px-2 py-0.5 text-xs font-bold ${DOMAIN_STYLE}`}
          >
            {event.domain}
          </span>
          <span className="font-mono text-xs text-night-600">{event.code}</span>
          {resolved && (
            <span className="rounded-full bg-green-100 px-2 py-0.5 text-xs font-bold text-green-700">
              resolved
            </span>
          )}
        </div>
        <span className="text-xs text-night-400">
          {formatAuDateTime(event.createdAt)}
        </span>
      </div>

      <p className="mt-2 text-sm font-medium text-night-700">{event.message}</p>

      {/* Customer + entity */}
      <div className="mt-1 flex flex-wrap gap-x-4 gap-y-0.5 text-xs text-night-500">
        {event.userEmail && <span>✉ {event.userEmail}</span>}
        {event.userId && (
          <button
            onClick={() => navigator.clipboard?.writeText(event.userId!)}
            className="font-mono hover:text-night-700"
            title="Copy user id"
          >
            {event.userId}
          </button>
        )}
        {event.entityId && (
          <span className="font-mono">
            {event.entityType}: {event.entityId}
          </span>
        )}
        {event.source && (
          <span className="text-night-400">via {event.source}</span>
        )}
      </div>

      {(event.rawError || event.context) && (
        <details className="mt-2">
          <summary className="cursor-pointer text-xs font-bold uppercase tracking-wide text-night-400 hover:text-night-600">
            Details
          </summary>
          {event.context && (
            <pre className="mt-2 overflow-x-auto rounded-lg bg-night-50 p-2 text-xs text-night-600">
              {JSON.stringify(event.context, null, 2)}
            </pre>
          )}
          {event.rawError && (
            <pre className="mt-2 overflow-x-auto whitespace-pre-wrap break-all rounded-lg bg-night-50 p-2 text-xs text-night-600">
              {event.rawError}
            </pre>
          )}
        </details>
      )}

      {event.note && (
        <p className="mt-2 text-xs text-night-500">
          <span className="font-bold">Note:</span> {event.note}
          {event.resolvedBy ? ` - ${event.resolvedBy}` : ""}
        </p>
      )}

      {/* Actions */}
      <div className="mt-3 flex flex-wrap items-center gap-2">
        {!resolved ? (
          <ActionButton onClick={resolve} busy={busy === "resolve"}>
            ✓ Resolve
          </ActionButton>
        ) : (
          <ActionButton onClick={reopen} busy={busy === "reopen"}>
            ↺ Reopen
          </ActionButton>
        )}
        {event.entityType === "book" && event.entityId && (
          <ActionButton onClick={retryBook} busy={busy === "retry"}>
            ⟳ Retry build
          </ActionButton>
        )}
        {event.entityType === "print_order" && event.entityId && (
          <ActionButton onClick={resendFulfillment} busy={busy === "resend"}>
            🖨 Resubmit print
          </ActionButton>
        )}
        {msg && <span className="text-xs text-night-500">{msg}</span>}
      </div>
    </li>
  );
}

function ActionButton({
  onClick,
  busy,
  children,
}: {
  onClick: () => void;
  busy: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      disabled={busy}
      className="rounded-full border border-night-200 px-3 py-1 text-xs font-bold text-night-600 hover:bg-night-50 disabled:opacity-50"
    >
      {busy ? "…" : children}
    </button>
  );
}
