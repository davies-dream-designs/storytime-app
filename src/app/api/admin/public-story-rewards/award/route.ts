import { NextResponse } from "next/server";
import { getAdminIdentity } from "@/lib/adminAuth";
import { adjustUserCredits } from "@/lib/credits";
import { db } from "@/lib/db";
import { PUBLIC_STORY_REWARD_TIERS } from "@/lib/publicStoryRewards";

type AwardedReward = {
  place: number;
  storyId: string;
  title: string;
  userId: string;
  credits: number;
  votes: number;
  newBalance: number;
};

type SkippedReward = {
  place: number;
  reason: "already_awarded_this_month" | "no_eligible_story";
};

export async function POST() {
  const admin = await getAdminIdentity();
  if (!admin) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const voteMonth = db.publicStoryVotes.getVoteMonth();

  // Idempotency: if this month has already been run, bail out entirely.
  const existingThisMonth =
    await db.publicStoryModerationEvents.listRewardEventsForMonth(voteMonth);
  if (existingThisMonth.length > 0) {
    return NextResponse.json({
      voteMonth,
      awarded: [],
      skipped: PUBLIC_STORY_REWARD_TIERS.map((t) => ({
        place: t.place,
        reason: "already_awarded_this_month" as const,
      })),
    });
  }

  // Exclude stories that have won in any previous month.
  const previouslyRewardedIds =
    await db.publicStoryModerationEvents.listAllRewardedStoryIds();

  // Fetch enough of the leaderboard to fill 3 places even after exclusions.
  const leaderboard = await db.publicStoryVotes.leaderboard(50);
  const eligible = leaderboard.filter(
    (entry) =>
      entry.votes > 0 && !previouslyRewardedIds.has(entry.story.id)
  );

  const awarded: AwardedReward[] = [];
  const skipped: SkippedReward[] = [];
  const usedUserIds = new Set<string>(); // one win per user per month

  for (const tier of PUBLIC_STORY_REWARD_TIERS) {
    // Find the next eligible entry (skip users already placed this run).
    const winner = eligible.find((e) => !usedUserIds.has(e.story.userId));
    if (!winner) {
      skipped.push({ place: tier.place, reason: "no_eligible_story" });
      continue;
    }
    // Remove from pool so it can't fill a lower place too.
    eligible.splice(eligible.indexOf(winner), 1);
    usedUserIds.add(winner.story.userId);

    const newBalance = await adjustUserCredits(
      winner.story.userId,
      tier.credits
    );
    await db.publicStoryModerationEvents.create({
      storyId: winner.story.id,
      actorUserId: admin.userId,
      actorLabel: admin.label,
      action: "reward_granted",
      note: `${tier.label}: ${tier.credits} credit reward for ${voteMonth}.`,
      metadata: {
        voteMonth,
        place: tier.place,
        placeLabel: tier.label,
        credits: tier.credits,
        votes: winner.votes,
        userId: winner.story.userId,
        newBalance,
      },
    });

    awarded.push({
      place: tier.place,
      storyId: winner.story.id,
      title: winner.story.title,
      userId: winner.story.userId,
      credits: tier.credits,
      votes: winner.votes,
      newBalance,
    });
  }

  return NextResponse.json({ voteMonth, awarded, skipped });
}
