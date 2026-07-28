"use client";

import { useState, useTransition } from "react";
import { Link, useRouter } from "@/i18n/navigation";
import type { Story } from "@/types";

export default function PublicStoryReviewSection({
  stories,
}: {
  stories: Story[];
}) {
  const router = useRouter();
  const [rejectionReasons, setRejectionReasons] = useState<
    Record<string, string>
  >({});
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function review(
    storyId: string,
    decision: "approved" | "rejected",
    rejectionReason?: string
  ) {
    setError(null);
    startTransition(async () => {
      const res = await fetch(`/api/admin/public-stories/${storyId}/review`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ decision, rejectionReason }),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as {
          error?: string;
        } | null;
        setError(body?.error ?? "Could not update review status.");
        return;
      }
      router.refresh();
    });
  }

  return (
    <section className="mb-8">
      <h2 className="mb-1 font-display text-xl font-bold text-night-800">
        Public story review
      </h2>
      <p className="mb-3 text-sm text-night-400">
        Stories must be approved here before they appear in the public gallery.
      </p>
      {error ? (
        <p className="mb-3 rounded-xl bg-blush-50 px-4 py-3 text-sm font-bold text-blush-700">
          {error}
        </p>
      ) : null}
      {stories.length === 0 ? (
        <div className="rounded-2xl border border-night-100 bg-white p-6 text-center text-night-400">
          No public stories waiting for review.
        </div>
      ) : (
        <div className="flex flex-col gap-4">
          {stories.map((story) => (
            <article
              key={story.id}
              className="rounded-2xl border border-night-100 bg-white p-5 shadow-sm"
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="font-display text-xl font-bold text-night-800">
                    {story.title}
                  </p>
                  <p className="mt-1 text-sm text-night-500">
                    by {story.publicAuthorName ?? story.profileName} ·{" "}
                    {story.theme} · {story.wordCount} words
                  </p>
                  <p className="mt-1 font-mono text-xs text-night-400">
                    {story.id}
                  </p>
                </div>
                <Link
                  href={`/s/${story.shareToken}` as string}
                  target="_blank"
                  className="storycot-btn storycot-btn-secondary storycot-btn-compact"
                >
                  Preview
                </Link>
              </div>
              <div className="mt-4 rounded-xl bg-night-50 p-4 text-sm leading-6 text-night-700">
                {story.pages
                  .slice(0, 2)
                  .map((page) => page.text)
                  .join(" ")
                  .slice(0, 520)}
                ...
              </div>
              <textarea
                value={rejectionReasons[story.id] ?? ""}
                onChange={(event) =>
                  setRejectionReasons((current) => ({
                    ...current,
                    [story.id]: event.target.value,
                  }))
                }
                rows={2}
                placeholder="Reason if rejecting"
                className="mt-4 w-full rounded-xl border border-night-200 bg-white px-3 py-2 text-sm text-night-800 outline-none focus:border-star-400 focus:ring-2 focus:ring-star-100"
              />
              <div className="mt-3 flex flex-wrap gap-2">
                <button
                  type="button"
                  disabled={isPending}
                  onClick={() => review(story.id, "approved")}
                  className="storycot-btn storycot-btn-primary storycot-btn-compact"
                >
                  Approve
                </button>
                <button
                  type="button"
                  disabled={isPending}
                  onClick={() =>
                    review(story.id, "rejected", rejectionReasons[story.id])
                  }
                  className="storycot-btn storycot-btn-secondary storycot-btn-compact"
                >
                  Reject
                </button>
              </div>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}
