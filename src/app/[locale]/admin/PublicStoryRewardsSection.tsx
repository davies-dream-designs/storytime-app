"use client";

import { useState, useTransition } from "react";
import { Link, useRouter } from "@/i18n/navigation";
import { PUBLIC_STORY_REWARD_CATEGORIES } from "@/lib/publicStoryRewards";
import type { PublicStoryPrintReadiness } from "@/lib/publicStoryPrintReadiness";
import type { Story } from "@/types";

type LeaderboardEntry = {
  story: Story;
  votes: number;
};

const rewardOptions = [
  { credits: 1, label: "+1" },
  { credits: 3, label: "+3" },
  { credits: 8, label: "+8" },
] as const;

export default function PublicStoryRewardsSection({
  leaders,
  printReadiness,
  voteMonth,
}: {
  leaders: LeaderboardEntry[];
  printReadiness: Record<string, PublicStoryPrintReadiness>;
  voteMonth: string;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [message, setMessage] = useState<string | null>(null);

  function awardMonthlyWinners() {
    setMessage(null);
    startTransition(async () => {
      const res = await fetch("/api/admin/public-story-rewards/award", {
        method: "POST",
      });
      const body = (await res.json().catch(() => null)) as {
        error?: string;
        awarded?: Array<{ title: string; credits: number }>;
        skipped?: Array<{ reason: string }>;
      } | null;
      if (!res.ok) {
        setMessage(body?.error ?? "Could not award monthly winners.");
        return;
      }

      const awardedCount = body?.awarded?.length ?? 0;
      const skippedCount = body?.skipped?.length ?? 0;
      setMessage(
        awardedCount > 0
          ? `Awarded ${awardedCount} winner${awardedCount === 1 ? "" : "s"}. ${skippedCount} categor${skippedCount === 1 ? "y" : "ies"} skipped.`
          : `No new rewards granted. ${skippedCount} categor${skippedCount === 1 ? "y was" : "ies were"} skipped.`
      );
      router.refresh();
    });
  }

  function grantReward(entry: LeaderboardEntry, credits: number) {
    setMessage(null);
    startTransition(async () => {
      const res = await fetch(
        `/api/admin/users/${entry.story.userId}/credits`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            delta: credits,
            reason: `Public leaderboard reward: ${entry.story.title} (${voteMonth}, ${entry.votes} votes)`,
          }),
        }
      );
      const body = (await res.json().catch(() => null)) as {
        error?: string;
        credits?: number;
      } | null;
      if (!res.ok) {
        setMessage(body?.error ?? "Could not grant reward credits.");
        return;
      }

      setMessage(
        `${credits} credit${credits === 1 ? "" : "s"} granted to ${entry.story.publicAuthorName ?? entry.story.userId}. New balance: ${body?.credits ?? "-"}`
      );
      router.refresh();
    });
  }

  return (
    <section className="mb-8">
      <h2 className="mb-1 font-display text-xl font-bold text-night-800">
        Public story rewards
      </h2>
      <p className="mb-3 text-sm text-night-400">
        Award the current month once per category. Duplicate runs skip
        categories already awarded in the moderation audit.
      </p>
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <button
          type="button"
          disabled={isPending || leaders.length === 0}
          onClick={awardMonthlyWinners}
          className="storycot-btn storycot-btn-primary storycot-btn-compact"
        >
          Award monthly winners
        </button>
        {PUBLIC_STORY_REWARD_CATEGORIES.map((category) => (
          <span
            key={category.key}
            className="rounded-full bg-night-50 px-3 py-1 text-xs font-bold text-night-500"
          >
            {category.label}: {category.credits}
          </span>
        ))}
      </div>
      {message ? (
        <p className="mb-3 rounded-xl bg-moon-50 px-4 py-3 text-sm font-bold text-night-700">
          {message}
        </p>
      ) : null}
      {leaders.length === 0 ? (
        <div className="rounded-2xl border border-night-100 bg-white p-6 text-center text-night-400">
          No voted public stories this month.
        </div>
      ) : (
        <div className="overflow-hidden rounded-2xl border border-night-100 bg-white shadow-sm">
          {leaders.slice(0, 10).map((entry, index) => (
            <div
              key={entry.story.id}
              className="grid gap-3 border-b border-night-100 p-4 last:border-b-0 sm:grid-cols-[48px_1fr_auto]"
            >
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-star-100 font-display text-lg font-bold text-night-800">
                {index + 1}
              </div>
              <div className="min-w-0">
                <p className="font-display text-lg font-bold text-night-800">
                  {entry.story.title}
                </p>
                <p className="mt-1 text-sm text-night-500">
                  {entry.votes} vote{entry.votes === 1 ? "" : "s"} · by{" "}
                  {entry.story.publicAuthorName ?? "Storycot creator"} ·{" "}
                  {entry.story.theme}
                </p>
                <p className="mt-1 font-mono text-xs text-night-400">
                  user: {entry.story.userId}
                </p>
                <p className="mt-2 text-xs font-bold text-night-500">
                  {printReadiness[entry.story.id]?.label ??
                    "No print-ready book"}
                  <span className="ml-2 font-normal text-night-400">
                    {printReadiness[entry.story.id]?.detail ??
                      "Create and proof a book before public purchase."}
                  </span>
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2 sm:justify-end">
                {entry.story.shareToken ? (
                  <Link
                    href={`/s/${entry.story.shareToken}` as string}
                    target="_blank"
                    className="storycot-btn storycot-btn-secondary storycot-btn-compact"
                  >
                    Read
                  </Link>
                ) : null}
                {rewardOptions.map((option) => (
                  <button
                    key={option.credits}
                    type="button"
                    disabled={isPending}
                    onClick={() => grantReward(entry, option.credits)}
                    className="storycot-btn storycot-btn-secondary storycot-btn-compact"
                  >
                    {option.label} credits
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
