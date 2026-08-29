"use client";

import { useState, useTransition } from "react";
import { Link, useRouter } from "@/i18n/navigation";
import { PUBLIC_STORY_REWARD_TIERS } from "@/lib/publicStoryRewards";
import type { PublicStoryPrintReadiness } from "@/lib/publicStoryPrintReadiness";
import type { Story } from "@/types";

type LeaderboardEntry = { story: Story; votes: number };

const TIER_COLOURS = [
  "bg-yellow-50 border-yellow-200 text-yellow-800",
  "bg-slate-50 border-slate-200 text-slate-700",
  "bg-orange-50 border-orange-200 text-orange-700",
];

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
        awarded?: Array<{ place: number; title: string; credits: number }>;
        skipped?: Array<{ place: number; reason: string }>;
      } | null;
      if (!res.ok) {
        setMessage(body?.error ?? "Could not award monthly winners.");
        return;
      }
      const awardedCount = body?.awarded?.length ?? 0;
      if (awardedCount > 0) {
        const summary = body!.awarded!
          .map((a) => `#${a.place} "${a.title}" +${a.credits} credits`)
          .join(" · ");
        setMessage(`Awarded: ${summary}`);
      } else {
        setMessage("Already awarded this month — no changes made.");
      }
      router.refresh();
    });
  }

  const top3 = leaders.slice(0, 3);

  return (
    <section className="mb-8">
      <h2 className="mb-1 font-display text-xl font-bold text-night-800">
        Monthly winners
      </h2>
      <p className="mb-1 text-sm text-night-400">
        Top 3 by votes for {voteMonth}. Stories that have won a previous month
        are excluded from future runs. One run per month — safe to click twice.
      </p>
      <div className="mb-4 flex flex-wrap items-center gap-2">
        {PUBLIC_STORY_REWARD_TIERS.map((t) => (
          <span
            key={t.place}
            className="rounded-full bg-night-50 px-3 py-1 text-xs font-bold text-night-500"
          >
            {t.emoji} {t.label}: {t.credits} credits
          </span>
        ))}
      </div>
      <button
        type="button"
        disabled={isPending || leaders.length === 0}
        onClick={awardMonthlyWinners}
        className="storycot-btn storycot-btn-primary storycot-btn-compact mb-4"
      >
        {isPending ? "Awarding…" : "Award monthly winners"}
      </button>
      {message ? (
        <p className="mb-4 rounded-xl bg-moon-50 px-4 py-3 text-sm font-bold text-night-700">
          {message}
        </p>
      ) : null}
      {leaders.length === 0 ? (
        <div className="rounded-2xl border border-night-100 bg-white p-6 text-center text-night-400">
          No voted public stories this month.
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-3">
          {top3.map((entry, index) => {
            const tier = PUBLIC_STORY_REWARD_TIERS[index];
            const colours = TIER_COLOURS[index] ?? TIER_COLOURS[2];
            return (
              <div
                key={entry.story.id}
                className={`rounded-2xl border p-5 ${colours}`}
              >
                <div className="mb-3 flex items-center gap-2">
                  <span className="text-2xl">{tier?.emoji}</span>
                  <div>
                    <p className="text-xs font-bold uppercase tracking-wide opacity-70">
                      {tier?.label}
                    </p>
                    <p className="text-sm font-bold">
                      +{tier?.credits} credits
                    </p>
                  </div>
                </div>
                <p className="font-display text-base font-bold leading-tight">
                  {entry.story.title}
                </p>
                <p className="mt-1 text-xs opacity-70">
                  {entry.votes} vote{entry.votes === 1 ? "" : "s"} · {entry.story.theme}
                </p>
                <p className="mt-1 text-xs opacity-60">
                  by {entry.story.publicAuthorName ?? "Storycot creator"}
                </p>
                <p className="mt-1 font-mono text-[10px] opacity-50">
                  {entry.story.userId}
                </p>
                <p className="mt-2 text-xs font-semibold opacity-70">
                  {printReadiness[entry.story.id]?.label ?? "No print-ready book"}
                </p>
                {entry.story.shareToken ? (
                  <Link
                    href={`/s/${entry.story.shareToken}` as string}
                    target="_blank"
                    className="mt-3 inline-block rounded-lg border border-current/20 bg-white/40 px-3 py-1 text-xs font-bold transition hover:bg-white/60"
                  >
                    Read story →
                  </Link>
                ) : null}
              </div>
            );
          })}
        </div>
      )}
      {leaders.length > 3 && (
        <div className="mt-4 overflow-hidden rounded-2xl border border-night-100 bg-white shadow-sm">
          <p className="border-b border-night-100 px-4 py-2 text-xs font-bold uppercase tracking-wide text-night-400">
            Next up (ineligible for top-3 display only)
          </p>
          {leaders.slice(3, 10).map((entry, i) => (
            <div
              key={entry.story.id}
              className="flex items-center gap-3 border-b border-night-100 px-4 py-3 last:border-b-0"
            >
              <span className="w-5 text-center text-xs font-bold text-night-400">
                {i + 4}
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-bold text-night-800">
                  {entry.story.title}
                </p>
                <p className="text-xs text-night-400">
                  {entry.votes} votes · {entry.story.publicAuthorName ?? "creator"}
                </p>
              </div>
              {entry.story.shareToken ? (
                <Link
                  href={`/s/${entry.story.shareToken}` as string}
                  target="_blank"
                  className="storycot-btn storycot-btn-secondary storycot-btn-compact"
                >
                  Read
                </Link>
              ) : null}
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
