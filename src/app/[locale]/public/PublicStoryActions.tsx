"use client";

import { useState, useTransition } from "react";
import { useLocale } from "next-intl";
import Icon from "@/components/ui/Icon";
import { buildSharedStoryUrl } from "@/lib/shareLinks";
import type { PublicStoryPrintReadiness } from "@/lib/publicStoryPrintReadiness";

const reportReasons = [
  { value: "privacy", label: "Private details" },
  { value: "copyright", label: "Copyright/IP" },
  { value: "unsafe", label: "Unsafe content" },
  { value: "spam", label: "Spam" },
  { value: "other", label: "Other" },
] as const;

export default function PublicStoryActions({
  storyId,
  storyTitle,
  shareToken,
  printReadiness,
  initialVotes,
  variant = "default",
}: {
  storyId: string;
  storyTitle: string;
  shareToken?: string | null;
  printReadiness?: PublicStoryPrintReadiness;
  initialVotes: number;
  variant?: "default" | "compact";
}) {
  const locale = useLocale();
  const [votes, setVotes] = useState(initialVotes);
  const [message, setMessage] = useState<string | null>(null);
  const [shareState, setShareState] = useState<"idle" | "copied">("idle");
  const [reportOpen, setReportOpen] = useState(false);
  const [reason, setReason] =
    useState<(typeof reportReasons)[number]["value"]>("privacy");
  const [isPending, startTransition] = useTransition();

  function getShareUrl() {
    if (!shareToken) return null;
    return buildSharedStoryUrl({
      origin: window.location.origin,
      locale,
      token: shareToken,
    });
  }

  function vote() {
    setMessage(null);
    startTransition(async () => {
      const res = await fetch(`/api/public-stories/${storyId}/vote`, {
        method: "POST",
      });
      const body = (await res.json().catch(() => null)) as {
        error?: string;
        votes?: number;
        alreadyVoted?: boolean;
      } | null;
      if (!res.ok) {
        setMessage(body?.error ?? "Sign in to vote.");
        return;
      }
      setVotes(body?.votes ?? votes);
      setMessage(body?.alreadyVoted ? "Vote already counted" : "Vote counted");
    });
  }

  function report() {
    setMessage(null);
    startTransition(async () => {
      const res = await fetch(`/api/public-stories/${storyId}/report`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reason }),
      });
      const body = (await res.json().catch(() => null)) as {
        error?: string;
        alreadyReported?: boolean;
        hiddenForReview?: boolean;
      } | null;
      if (!res.ok) {
        setMessage(body?.error ?? "Sign in to report this story.");
        return;
      }
      setReportOpen(false);
      setMessage(
        body?.hiddenForReview
          ? "Reported and hidden for review"
          : body?.alreadyReported
            ? "Report already received"
            : "Report received"
      );
    });
  }

  async function copyShareLink() {
    const url = getShareUrl();
    if (!url) return;
    await navigator.clipboard.writeText(url);
    setShareState("copied");
    setMessage("Link copied");
    setTimeout(() => {
      setShareState("idle");
      setMessage((current) => (current === "Link copied" ? null : current));
    }, 2500);
  }

  async function shareStory() {
    const url = getShareUrl();
    if (!url) return;

    if (navigator.share) {
      await navigator
        .share({
          title: storyTitle,
          url,
        })
        .catch(() => undefined);
      return;
    }

    await copyShareLink();
  }

  if (variant === "compact") {
    return (
      <div className="space-y-1">
        <div className="flex flex-wrap items-center justify-end gap-1.5">
          <button
            type="button"
            onClick={vote}
            disabled={isPending}
            className="storycot-btn storycot-btn-secondary storycot-btn-compact px-3"
          >
            <Icon name="sparkle" />
            <span>{votes}</span>
          </button>
          {shareToken ? (
            <button
              type="button"
              onClick={() => void shareStory()}
              className="storycot-btn storycot-btn-secondary storycot-btn-compact px-3"
              aria-label={`Share ${storyTitle}`}
            >
              <Icon name="share" />
            </button>
          ) : null}
          <button
            type="button"
            onClick={() => setReportOpen((open) => !open)}
            disabled={isPending}
            className="storycot-btn storycot-btn-secondary storycot-btn-compact px-3"
          >
            Report
          </button>
        </div>
        {reportOpen ? (
          <div className="rounded-xl border border-night-100 bg-night-50 p-3">
            <label className="block text-xs font-bold uppercase tracking-wide text-night-400">
              Reason
            </label>
            <select
              value={reason}
              onChange={(event) =>
                setReason(
                  event.target.value as (typeof reportReasons)[number]["value"]
                )
              }
              className="mt-1 w-full rounded-lg border border-night-200 bg-white px-2 py-2 text-sm text-night-800"
            >
              {reportReasons.map((item) => (
                <option key={item.value} value={item.value}>
                  {item.label}
                </option>
              ))}
            </select>
            <button
              type="button"
              onClick={report}
              disabled={isPending}
              className="storycot-btn storycot-btn-primary storycot-btn-compact mt-3"
            >
              Send report
            </button>
          </div>
        ) : null}
        {message ? (
          <p className="text-right text-xs font-bold text-night-500">
            {message}
          </p>
        ) : null}
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={vote}
          disabled={isPending}
          className="storycot-btn storycot-btn-secondary storycot-btn-compact"
        >
          <Icon name="sparkle" />
          Vote
          <span className="rounded-full bg-night-100 px-2 py-0.5 text-xs text-night-600">
            {votes}
          </span>
        </button>
        {shareToken ? (
          <>
            <button
              type="button"
              onClick={() => void shareStory()}
              className="storycot-btn storycot-btn-secondary storycot-btn-compact"
            >
              <Icon name="share" />
              Share
            </button>
            <button
              type="button"
              onClick={() => void copyShareLink()}
              className="storycot-btn storycot-btn-secondary storycot-btn-compact"
            >
              <Icon name="link" />
              {shareState === "copied" ? "Copied" : "Copy"}
            </button>
          </>
        ) : null}
        <button
          type="button"
          disabled
          className="storycot-btn storycot-btn-secondary storycot-btn-compact opacity-50"
          title={
            printReadiness?.ready
              ? "Print-ready; public checkout is not enabled yet"
              : (printReadiness?.detail ??
                "Public book purchase flow is not enabled yet")
          }
        >
          <Icon name="print" />
          {printReadiness?.ready ? "Print ready" : "Buy soon"}
        </button>
        <button
          type="button"
          onClick={() => setReportOpen((open) => !open)}
          disabled={isPending}
          className="storycot-btn storycot-btn-secondary storycot-btn-compact"
        >
          Report
        </button>
      </div>
      {reportOpen ? (
        <div className="rounded-xl border border-night-100 bg-night-50 p-3">
          <label className="block text-xs font-bold uppercase tracking-wide text-night-400">
            Reason
          </label>
          <select
            value={reason}
            onChange={(event) =>
              setReason(
                event.target.value as (typeof reportReasons)[number]["value"]
              )
            }
            className="mt-1 w-full rounded-lg border border-night-200 bg-white px-2 py-2 text-sm text-night-800"
          >
            {reportReasons.map((item) => (
              <option key={item.value} value={item.value}>
                {item.label}
              </option>
            ))}
          </select>
          <button
            type="button"
            onClick={report}
            disabled={isPending}
            className="storycot-btn storycot-btn-primary storycot-btn-compact mt-3"
          >
            Send report
          </button>
        </div>
      ) : null}
      {message ? (
        <p className="text-xs font-bold text-night-500">{message}</p>
      ) : null}
    </div>
  );
}
