"use client";

import { useState, useTransition } from "react";
import { useRouter } from "@/i18n/navigation";
import type { Story } from "@/types";
import Icon from "@/components/ui/Icon";

export default function PublicSubmissionPanel({
  story,
  canSubmitPublicly,
}: {
  story: Story;
  canSubmitPublicly: boolean;
}) {
  const router = useRouter();
  const [authorName, setAuthorName] = useState(
    story.publicAuthorName ?? story.profileName
  );
  const [rights, setRights] = useState(false);
  const [privacy, setPrivacy] = useState(false);
  const [terms, setTerms] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const status = story.publicReviewStatus ?? "not_submitted";
  const isApproved = story.visibility === "public" && status === "approved";
  const canSubmit = rights && privacy && terms && authorName.trim().length > 0;
  const showSubmissionForm =
    canSubmitPublicly && status !== "pending_review" && !isApproved;

  function submitForReview() {
    setError(null);
    startTransition(async () => {
      const res = await fetch(`/api/stories/${story.id}/public-submission`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          authorName,
          confirmations: { rights, privacy, terms },
        }),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as {
          error?: string;
        } | null;
        setError(body?.error ?? "Could not submit this story for review.");
        return;
      }
      router.refresh();
    });
  }

  function withdraw() {
    setError(null);
    startTransition(async () => {
      const res = await fetch(`/api/stories/${story.id}/public-submission`, {
        method: "DELETE",
      });
      if (!res.ok) {
        setError("Could not remove this story from public review.");
        return;
      }
      router.refresh();
    });
  }

  return (
    <section className="mt-8 rounded-2xl border border-night-100 bg-white p-5 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs font-bold uppercase tracking-wide text-star-600">
            Public gallery
          </p>
          <h2 className="mt-1 font-display text-2xl font-bold text-night-800">
            Submit this illustrated story
          </h2>
        </div>
        <span className="rounded-full bg-night-50 px-3 py-1 text-xs font-bold text-night-500">
          {status === "pending_review"
            ? "Pending review"
            : isApproved
              ? "Public"
              : status === "rejected"
                ? "Needs changes"
                : "Private"}
        </span>
      </div>

      {isApproved ? (
        <div className="mt-4 rounded-xl bg-moon-50 p-4 text-sm leading-6 text-night-700">
          <p className="font-bold text-night-800">Approved for the gallery</p>
          <p className="mt-1">
            This story can appear in public discovery and future leaderboard
            experiments. Public purchases and rewards are not enabled yet.
          </p>
        </div>
      ) : status === "pending_review" ? (
        <div className="mt-4 space-y-4">
          <p className="rounded-xl bg-star-50 p-4 text-sm leading-6 text-night-700">
            This story is waiting for moderation review before it can appear in
            public discovery.
          </p>
          <button
            type="button"
            onClick={withdraw}
            disabled={isPending}
            className="storycot-btn storycot-btn-secondary storycot-btn-compact"
          >
            <Icon name="lock" />
            Keep private
          </button>
        </div>
      ) : (
        <div className="mt-4 space-y-4">
          {!showSubmissionForm ? (
            <div className="rounded-xl border border-moon-100 bg-moon-50 p-4 text-sm leading-6 text-night-700">
              <p className="font-bold text-night-800">
                Public sharing opens after illustration
              </p>
              <p className="mt-1">
                The gallery and leaderboard are for illustrated Storycot books,
                so readers see a cover and the story keeps its special value.
                Create an illustrated book before submitting this story.
              </p>
            </div>
          ) : (
            <>
              {status === "rejected" && story.publicRejectionReason ? (
                <div className="rounded-xl border border-blush-100 bg-blush-50 p-4 text-sm leading-6 text-blush-700">
                  <p className="font-bold">Review note</p>
                  <p className="mt-1">{story.publicRejectionReason}</p>
                </div>
              ) : null}

              <label className="block">
                <span className="text-sm font-bold text-night-700">
                  Author display name
                </span>
                <input
                  value={authorName}
                  onChange={(event) => setAuthorName(event.target.value)}
                  maxLength={80}
                  className="mt-1 w-full rounded-xl border border-night-200 bg-white px-3 py-2 text-sm text-night-800 outline-none focus:border-star-400 focus:ring-2 focus:ring-star-100"
                />
              </label>

              <div className="space-y-2 text-sm text-night-600">
                <label className="flex gap-2">
                  <input
                    type="checkbox"
                    checked={rights}
                    onChange={(event) => setRights(event.target.checked)}
                    className="mt-1"
                  />
                  <span>
                    I have permission to publish the story, images, names, and
                    any likenesses used.
                  </span>
                </label>
                <label className="flex gap-2">
                  <input
                    type="checkbox"
                    checked={privacy}
                    onChange={(event) => setPrivacy(event.target.checked)}
                    className="mt-1"
                  />
                  <span>
                    I have removed any private identifying details that should
                    not be public.
                  </span>
                </label>
                <label className="flex gap-2">
                  <input
                    type="checkbox"
                    checked={terms}
                    onChange={(event) => setTerms(event.target.checked)}
                    className="mt-1"
                  />
                  <span>
                    I understand Storycot may review, feature, sell, or remove
                    public illustrated stories under the public gallery rules.
                  </span>
                </label>
              </div>

              {error ? (
                <p className="text-sm font-bold text-blush-700">{error}</p>
              ) : null}

              <button
                type="button"
                onClick={submitForReview}
                disabled={!canSubmit || isPending}
                className="storycot-btn storycot-btn-primary storycot-btn-compact disabled:cursor-not-allowed disabled:opacity-50"
              >
                <Icon name="share" />
                Submit for review
              </button>
            </>
          )}
        </div>
      )}
    </section>
  );
}
