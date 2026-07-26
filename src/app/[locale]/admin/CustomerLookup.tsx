"use client";

import { useState } from "react";
import { formatAuDateTime } from "./errorStyles";

type LookupResult = {
  found: boolean;
  query: string;
  user?: {
    id: string;
    email: string | null;
    name: string | null;
    credits: number;
    isAdmin: boolean;
  };
  stories?: {
    id: string;
    title: string;
    status: string;
    generationError: string | null;
    createdAt: string;
  }[];
  books?: {
    id: string;
    sourceStoryId: string;
    status: string;
    errorCode: string | null;
    errorMessage: string | null;
    printOrder: {
      status: string;
      productLabel: string;
      amountAud: number;
      fulfillmentStatus: string | null;
    } | null;
    updatedAt: string;
  }[];
  errors?: {
    id: string;
    code: string;
    severity: string;
    message: string;
    createdAt: string;
  }[];
};

export default function CustomerLookup() {
  const [q, setQ] = useState("");
  const [result, setResult] = useState<LookupResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [creditMsg, setCreditMsg] = useState<string | null>(null);

  const search = async (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!q.trim()) return;
    setLoading(true);
    setError(null);
    setCreditMsg(null);
    try {
      const res = await fetch(
        `/api/admin/customer-lookup?q=${encodeURIComponent(q.trim())}`
      );
      if (!res.ok) throw new Error(`Lookup failed (${res.status})`);
      setResult(await res.json());
    } catch (err) {
      setError(err instanceof Error ? err.message : "Lookup failed");
    } finally {
      setLoading(false);
    }
  };

  const grant = async (delta: number) => {
    if (!result?.user) return;
    setCreditMsg("…");
    try {
      const res = await fetch(`/api/admin/users/${result.user.id}/credits`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ delta }),
      });
      const data = await res.json();
      if (!res.ok) {
        setCreditMsg(data.error ?? "Failed");
      } else {
        setCreditMsg(`Balance now ${data.credits}`);
        setResult((r) =>
          r?.user ? { ...r, user: { ...r.user, credits: data.credits } } : r
        );
      }
    } catch {
      setCreditMsg("Failed");
    }
  };

  return (
    <div className="rounded-2xl border border-night-100 bg-white p-4 sm:p-6 shadow-sm mb-6">
      <h2 className="font-display text-xl font-bold text-night-800 mb-1">
        Customer lookup
      </h2>
      <p className="text-sm text-night-400 mb-3">
        Search by email, user id, or a story/book id - everything about them in
        one spot.
      </p>

      <form onSubmit={search} className="flex gap-2">
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="jane@example.com  ·  user_123  ·  book id"
          className="flex-1 rounded-lg border border-night-200 px-3 py-2 text-sm"
        />
        <button
          type="submit"
          disabled={loading}
          className="rounded-lg bg-night-700 px-4 py-2 text-sm font-bold text-moon-200 hover:bg-night-800 disabled:opacity-50"
        >
          {loading ? "…" : "Find"}
        </button>
      </form>

      {error && <p className="mt-3 text-sm text-red-600">{error}</p>}

      {result && !result.found && (
        <p className="mt-4 text-sm text-night-500">
          No customer found for &ldquo;{result.query}&rdquo;.
        </p>
      )}

      {result?.found && result.user && (
        <div className="mt-4 space-y-4">
          {/* User header */}
          <div className="rounded-xl border border-night-100 bg-night-50/50 p-3">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div>
                <p className="text-sm font-bold text-night-800">
                  {result.user.name ?? "-"}
                  {result.user.isAdmin && (
                    <span className="ml-2 rounded-full bg-purple-100 px-2 py-0.5 text-xs text-purple-700">
                      admin
                    </span>
                  )}
                </p>
                <p className="text-xs text-night-500">
                  {result.user.email ?? "-"}
                </p>
                <p className="font-mono text-xs text-night-400">
                  {result.user.id}
                </p>
              </div>
              <div className="text-right">
                <p className="text-xs font-bold uppercase text-night-400">
                  Credits
                </p>
                <p className="text-lg font-bold text-night-800">
                  {result.user.credits}
                </p>
              </div>
            </div>
            <div className="mt-2 flex flex-wrap items-center gap-1.5">
              {[1, 3, 8].map((d) => (
                <button
                  key={d}
                  onClick={() => grant(d)}
                  className="rounded-full border border-green-200 bg-green-50 px-2.5 py-1 text-xs font-bold text-green-700 hover:bg-green-100"
                >
                  +{d}
                </button>
              ))}
              <button
                onClick={() => grant(-1)}
                className="rounded-full border border-night-200 px-2.5 py-1 text-xs font-bold text-night-500 hover:bg-night-100"
              >
                −1
              </button>
              {creditMsg && (
                <span className="text-xs text-night-500">{creditMsg}</span>
              )}
            </div>
          </div>

          {/* Books */}
          <LookupGroup title={`Books (${result.books?.length ?? 0})`}>
            {result.books?.length ? (
              result.books.map((b) => (
                <div key={b.id} className="py-2 text-xs">
                  <div className="flex items-center justify-between gap-2">
                    <a
                      href={`/stories/${b.sourceStoryId}`}
                      className="font-mono text-blue-600 hover:underline"
                    >
                      {b.id.slice(0, 14)}…
                    </a>
                    <span className="text-night-400">
                      {formatAuDateTime(b.updatedAt)}
                    </span>
                  </div>
                  <div className="mt-0.5 flex flex-wrap gap-2 text-night-500">
                    <span>status: {b.status}</span>
                    {b.errorCode && (
                      <span className="text-red-600">err: {b.errorCode}</span>
                    )}
                    {b.printOrder && (
                      <span>
                        order: {b.printOrder.status}/
                        {b.printOrder.fulfillmentStatus ?? "-"} · $
                        {b.printOrder.amountAud}
                      </span>
                    )}
                  </div>
                </div>
              ))
            ) : (
              <p className="py-2 text-xs text-night-400">No books.</p>
            )}
          </LookupGroup>

          {/* Stories */}
          <LookupGroup title={`Stories (${result.stories?.length ?? 0})`}>
            {result.stories?.length ? (
              result.stories.slice(0, 10).map((s) => (
                <div
                  key={s.id}
                  className="flex items-center justify-between gap-2 py-1.5 text-xs"
                >
                  <a
                    href={`/stories/${s.id}`}
                    className="truncate text-blue-600 hover:underline"
                  >
                    {s.title}
                  </a>
                  <span
                    className={
                      s.status === "failed" ? "text-red-600" : "text-night-400"
                    }
                  >
                    {s.status}
                  </span>
                </div>
              ))
            ) : (
              <p className="py-2 text-xs text-night-400">No stories.</p>
            )}
          </LookupGroup>

          {/* Recent errors */}
          {result.errors && result.errors.length > 0 && (
            <LookupGroup title={`Recent errors (${result.errors.length})`}>
              {result.errors.map((e) => (
                <div key={e.id} className="py-1.5 text-xs">
                  <span className="font-mono text-night-600">{e.code}</span>{" "}
                  <span className="text-night-400">
                    {formatAuDateTime(e.createdAt)}
                  </span>
                  <p className="text-night-500">{e.message}</p>
                </div>
              ))}
            </LookupGroup>
          )}
        </div>
      )}
    </div>
  );
}

function LookupGroup({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <p className="mb-1 text-xs font-bold uppercase tracking-wide text-night-400">
        {title}
      </p>
      <div className="divide-y divide-night-50 rounded-xl border border-night-100 px-3">
        {children}
      </div>
    </div>
  );
}
