"use client";

import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";
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
  const t = useTranslations("publicSubmission");
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
      title: t("submitConfirmTitle"),
      message: t("submitConfirmMessage", { name: authorName.trim() }),
      confirmLabel: t("submitConfirmLabel"),
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
        setError(body?.error ?? t("errorSubmit"));
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
        setError(t("errorWithdraw"));
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
            {t("eyebrow")}
          </p>
          <h2 className="mt-1 font-display text-2xl font-bold text-night-800">
            {canSubmitPublicly
              ? t("headingShare")
              : hasIllustratedBookProject
                ? t("headingAlmostReady")
                : t("headingWantIllustrated")}
          </h2>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-night-500">
            {t("intro")}
          </p>
        </div>
        <span className="rounded-full bg-night-50 px-3 py-1 text-xs font-bold text-night-500">
          {status === "pending_review"
            ? t("statusPending")
            : isApproved
              ? t("statusPublic")
              : status === "rejected"
                ? t("statusNeedsChanges")
                : t("statusPrivate")}
        </span>
      </div>

      {isApproved ? (
        <div className="mt-4 rounded-xl bg-moon-50 p-4 text-sm leading-6 text-night-700">
          <p className="font-bold text-night-800">{t("approvedTitle")}</p>
          <p className="mt-1">{t("approvedBody")}</p>
        </div>
      ) : status === "pending_review" ? (
        <div className="mt-4 space-y-4">
          <p className="rounded-xl bg-star-50 p-4 text-sm leading-6 text-night-700">
            {t("pendingBody")}
          </p>
          <button
            type="button"
            onClick={withdraw}
            disabled={isPending}
            className="storycot-btn storycot-btn-secondary storycot-btn-compact"
          >
            <Icon name="lock" />
            {t("keepPrivate")}
          </button>
        </div>
      ) : (
        <div className="mt-4 space-y-4">
          {!showSubmissionForm ? (
            <div className="rounded-xl border border-moon-100 bg-moon-50 p-4 text-sm leading-6 text-night-700">
              <p className="font-bold text-night-800">
                {hasIllustratedBookProject
                  ? t("lockedTitleIllustrating")
                  : t("lockedTitleNeedsBook")}
              </p>
              <p className="mt-1">
                {hasIllustratedBookProject
                  ? t("lockedBodyIllustrating")
                  : t("lockedBodyNeedsBook")}
              </p>
              <Link
                href="/public"
                className="storycot-btn storycot-btn-secondary storycot-btn-compact mt-3"
              >
                <Icon name="book" />
                {t("viewGallery")}
              </Link>
            </div>
          ) : (
            <>
              {status === "rejected" && story.publicRejectionReason ? (
                <div className="rounded-xl border border-blush-100 bg-blush-50 p-4 text-sm leading-6 text-blush-700">
                  <p className="font-bold">{t("reviewNote")}</p>
                  <p className="mt-1">{story.publicRejectionReason}</p>
                </div>
              ) : null}

              <label className="block">
                <span className="text-sm font-bold text-night-700">
                  {t("authorNameLabel")}
                </span>
                <input
                  value={authorName}
                  onChange={(event) => setAuthorName(event.target.value)}
                  maxLength={80}
                  placeholder={t("authorNamePlaceholder")}
                  className="mt-1 w-full rounded-xl border border-night-200 bg-white px-3 py-2 text-sm text-night-800 outline-none focus:border-star-400 focus:ring-2 focus:ring-star-100"
                />
                <span className="mt-1 block text-xs leading-5 text-night-400">
                  {t("authorNameHint")}
                </span>
              </label>

              <div className="rounded-xl border border-star-100 bg-star-50 p-4 text-sm leading-6 text-night-700">
                <p className="font-bold text-night-800">
                  {t("seePublicTitle")}
                </p>
                <p className="mt-1">{t("seePublicBody")}</p>
                <Link
                  href="/public"
                  className="storycot-btn storycot-btn-secondary storycot-btn-compact mt-3"
                >
                  <Icon name="book" />
                  {t("openGallery")}
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
                  <span>{t("checkRights")}</span>
                </label>
                <label className="flex gap-2">
                  <input
                    type="checkbox"
                    checked={privacy}
                    onChange={(event) => setPrivacy(event.target.checked)}
                    className="mt-1"
                  />
                  <span>{t("checkPrivacy")}</span>
                </label>
                <label className="flex gap-2">
                  <input
                    type="checkbox"
                    checked={terms}
                    onChange={(event) => setTerms(event.target.checked)}
                    className="mt-1"
                  />
                  <span>{t("checkTerms")}</span>
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
                {t("submitButton")}
              </button>
            </>
          )}
        </div>
      )}
      <ConfirmDialog />
    </section>
  );
}
