import { NextResponse } from "next/server";
import { getAdminIdentity } from "@/lib/adminAuth";
import { adjustUserCredits } from "@/lib/credits";
import { db } from "@/lib/db";
import { PUBLIC_STORY_REWARD_CATEGORIES } from "@/lib/publicStoryRewards";
import type { StoryPreset } from "@/types";

type AwardedReward = {
  category: string;
  storyId: string;
  title: string;
  userId: string;
  credits: number;
  votes: number;
  newBalance: number;
};

type SkippedReward = {
  category: string;
  reason: "already_awarded" | "no_votes";
};

function getAwardedCategoryKeys(
  events: Awaited<
    ReturnType<typeof db.publicStoryModerationEvents.listRewardEventsForMonth>
  >
) {
  return new Set(
    events
      .map((event) => event.metadata?.category)
      .filter((value): value is string => typeof value === "string")
  );
}

export async function POST() {
  const admin = await getAdminIdentity();
  if (!admin) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const voteMonth = db.publicStoryVotes.getVoteMonth();
  const existingRewards =
    await db.publicStoryModerationEvents.listRewardEventsForMonth(voteMonth);
  const awardedCategoryKeys = getAwardedCategoryKeys(existingRewards);
  const awarded: AwardedReward[] = [];
  const skipped: SkippedReward[] = [];

  for (const category of PUBLIC_STORY_REWARD_CATEGORIES) {
    if (awardedCategoryKeys.has(category.key)) {
      skipped.push({ category: category.key, reason: "already_awarded" });
      continue;
    }

    const storyPreset =
      category.key === "all" ? undefined : (category.key as StoryPreset);
    const [leader] = await db.publicStoryVotes.leaderboard(1, { storyPreset });
    if (!leader || leader.votes <= 0) {
      skipped.push({ category: category.key, reason: "no_votes" });
      continue;
    }

    const newBalance = await adjustUserCredits(
      leader.story.userId,
      category.credits
    );
    await db.publicStoryModerationEvents.create({
      storyId: leader.story.id,
      actorUserId: admin.userId,
      actorLabel: admin.label,
      action: "reward_granted",
      note: `${category.label}: ${category.credits} credit reward for ${voteMonth}.`,
      metadata: {
        voteMonth,
        category: category.key,
        categoryLabel: category.label,
        credits: category.credits,
        votes: leader.votes,
        userId: leader.story.userId,
        newBalance,
      },
    });

    awarded.push({
      category: category.key,
      storyId: leader.story.id,
      title: leader.story.title,
      userId: leader.story.userId,
      credits: category.credits,
      votes: leader.votes,
      newBalance,
    });
  }

  return NextResponse.json({ voteMonth, awarded, skipped });
}
