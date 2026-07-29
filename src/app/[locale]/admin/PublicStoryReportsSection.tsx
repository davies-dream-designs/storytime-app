"use client";

import { useState, useTransition } from "react";
import { useRouter } from "@/i18n/navigation";

type PublicStoryReport = {
  id: string;
  storyId: string;
  userId: string;
  reason: string;
  note: string | null;
  createdAt: string;
};

export default function PublicStoryReportsSection({
  reports,
}: {
  reports: PublicStoryReport[];
}) {
  const router = useRouter();
  const [delistReasons, setDelistReasons] = useState<Record<string, string>>(
    {}
  );
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function closeReports(storyId: string, action: "reviewed" | "dismiss") {
    setError(null);
    startTransition(async () => {
      const res = await fetch(`/api/admin/public-stories/${storyId}/reports`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as {
          error?: string;
        } | null;
        setError(body?.error ?? "Could not close reports.");
        return;
      }
      router.refresh();
    });
  }

  function delist(storyId: string) {
    setError(null);
    startTransition(async () => {
      const res = await fetch(`/api/admin/public-stories/${storyId}/delist`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reason: delistReasons[storyId] }),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as {
          error?: string;
        } | null;
        setError(body?.error ?? "Could not delist story.");
        return;
      }
      router.refresh();
    });
  }

  const reportsByStory = reports.reduce<Record<string, PublicStoryReport[]>>(
    (groups, report) => {
      groups[report.storyId] = [...(groups[report.storyId] ?? []), report];
      return groups;
    },
    {}
  );
  const storyIds = Object.keys(reportsByStory);

  return (
    <section className="mb-8">
      <h2 className="mb-1 font-display text-xl font-bold text-night-800">
        Public story reports
      </h2>
      <p className="mb-3 text-sm text-night-400">
        Open reports from signed-in readers. Stories with 3 unique open reports
        are hidden and returned to review automatically.
      </p>
      {error ? (
        <p className="mb-3 rounded-xl bg-blush-50 px-4 py-3 text-sm font-bold text-blush-700">
          {error}
        </p>
      ) : null}
      {storyIds.length === 0 ? (
        <div className="rounded-2xl border border-night-100 bg-white p-6 text-center text-night-400">
          No open public story reports.
        </div>
      ) : (
        <div className="flex flex-col gap-4">
          {storyIds.map((storyId) => {
            const storyReports = reportsByStory[storyId] ?? [];
            return (
              <article
                key={storyId}
                className="rounded-2xl border border-night-100 bg-white p-5 shadow-sm"
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="text-sm font-bold text-night-800">
                      {storyReports.length} open report
                      {storyReports.length === 1 ? "" : "s"}
                    </p>
                    <p className="mt-1 font-mono text-xs text-night-400">
                      story: {storyId}
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      disabled={isPending}
                      onClick={() => closeReports(storyId, "dismiss")}
                      className="storycot-btn storycot-btn-secondary storycot-btn-compact"
                    >
                      Dismiss reports
                    </button>
                    <button
                      type="button"
                      disabled={isPending}
                      onClick={() => closeReports(storyId, "reviewed")}
                      className="storycot-btn storycot-btn-secondary storycot-btn-compact"
                    >
                      Mark reviewed
                    </button>
                  </div>
                </div>

                <div className="mt-4 grid gap-3">
                  {storyReports.map((report) => (
                    <div
                      key={report.id}
                      className="rounded-xl bg-night-50 p-3 text-sm text-night-700"
                    >
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <p className="font-bold">{report.reason}</p>
                        <p className="text-xs text-night-400">
                          {new Date(report.createdAt).toLocaleString("en-AU", {
                            dateStyle: "short",
                            timeStyle: "short",
                          })}
                        </p>
                      </div>
                      <p className="mt-1 font-mono text-xs text-night-400">
                        reporter: {report.userId}
                      </p>
                      {report.note ? (
                        <p className="mt-2 leading-6">{report.note}</p>
                      ) : null}
                    </div>
                  ))}
                </div>

                <div className="mt-4 rounded-xl border border-blush-100 bg-blush-50 p-3">
                  <label className="block text-xs font-bold uppercase tracking-wide text-blush-700">
                    Delist reason
                  </label>
                  <textarea
                    value={delistReasons[storyId] ?? ""}
                    onChange={(event) =>
                      setDelistReasons((current) => ({
                        ...current,
                        [storyId]: event.target.value,
                      }))
                    }
                    rows={2}
                    className="mt-2 w-full rounded-xl border border-blush-100 bg-white px-3 py-2 text-sm text-night-800 outline-none focus:border-blush-300 focus:ring-2 focus:ring-blush-100"
                    placeholder="Reason sent to the owner if delisting"
                  />
                  <button
                    type="button"
                    disabled={isPending}
                    onClick={() => delist(storyId)}
                    className="storycot-btn storycot-btn-secondary storycot-btn-compact mt-3"
                  >
                    Delist story
                  </button>
                </div>
              </article>
            );
          })}
        </div>
      )}
    </section>
  );
}
