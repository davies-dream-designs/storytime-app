"use client";

import { useState, useTransition } from "react";
import { Link, useRouter } from "@/i18n/navigation";
import type { Story } from "@/types";
import Icon from "@/components/ui/Icon";
import { useConfirmDialog } from "@/components/ui/useConfirmDialog";

export default function PublicSubmissionPanel({
  story,
  canSubmitPublicly,
  hasIllustratedBookProject,
}: {
  story: Story;
  canSubmitPublicly: boolean;
  hasIllustratedBookProject: boolean;
}) {
  const router = useRouter();
  const [authorName, setAuthorName] = useState(story.publicAuthorName ?? "");
  const [rights, setRights] = useState(false);
  const [privacy, setPrivacy] = useState(false);
  const [terms, setTerms] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const { confirm, ConfirmDialog } = useConfirmDialog();

  const status = story.publicReviewStatus ?? "not_submitted";
  const isApproved = story.visibility === "public" && status === "approved";
  const canSubmit = rights && privacy && terms && authorName.trim().length > 0;
  const showSubmissionForm =
    canSubmitPublicly && status !== "pending_review" && !isApproved;

  async function submitForReview() {
    setError(null);
    const confirmed = await confirm({
      title: "Submit For Review",
      message: `Submit this illustrated story to the public gallery as "${authorName.trim()}"?\n\nIf approved, other signed-in readers can read, vote, and report it. Monthly winners may earn bonus Storycot credits.`,
      confirmLabel: "Submit For Review",
    });
    if (!confirmed) return;

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
            {canSubmitPublicly
              ? "Share this in the public gallery"
              : hasIllustratedBookProject
                ? "Illustrations are almost ready"
                : "Would you like this story illustrated?"}
          </h2>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-night-500">
            Public gallery stories are illustrated books that families can
            discover, read, and vote for. Monthly favourites can earn bonus
            Storycot credits.
          </p>
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
            This story can appear in public discovery and leaderboards.
            Print-ready public books can also be ordered by signed-in readers
            who are not the story creator.
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
                {hasIllustratedBookProject
                  ? "Public sharing opens when illustrations are ready"
                  : "Turn this into an illustrated book first"}
              </p>
              <p className="mt-1">
                {hasIllustratedBookProject
                  ? "Once the illustrated book and cover are ready, you can submit it for public review."
                  : "The gallery and leaderboard are for illustrated Storycot books, so readers see a cover and the story keeps its special value. Use the illustrated book button near the top of this page when you are ready."}
              </p>
              <Link
                href="/public"
                className="storycot-btn storycot-btn-secondary storycot-btn-compact mt-3"
              >
                <Icon name="book" />
                View public gallery
              </Link>
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
                  placeholder="e.g. your name, pen name, or family name"
                  className="mt-1 w-full rounded-xl border border-night-200 bg-white px-3 py-2 text-sm text-night-800 outline-none focus:border-star-400 focus:ring-2 focus:ring-star-100"
                />
                <span className="mt-1 block text-xs leading-5 text-night-400">
                  This is the creator display name shown publicly. Do not use
                  your child&apos;s full name unless you want it public.
                </span>
              </label>

              <div className="rounded-xl border border-star-100 bg-star-50 p-4 text-sm leading-6 text-night-700">
                <p className="font-bold text-night-800">
                  See what public means
                </p>
                <p className="mt-1">
                  Approved stories appear in the public gallery and monthly
                  leaderboard. Readers can vote, share, and report stories.
                </p>
                <Link
                  href="/public"
                  className="storycot-btn storycot-btn-secondary storycot-btn-compact mt-3"
                >
                  <Icon name="book" />
                  Open gallery
                </Link>
              </div>

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
      <ConfirmDialog />
    </section>
  );
}
