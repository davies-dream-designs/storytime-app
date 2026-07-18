import { randomUUID } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { auth, clerkClient } from "@clerk/nextjs/server";
import { db } from "@/lib/db";
import { STORY_CREDIT_COST } from "@/lib/pricing";
import type { Story } from "@/types";

export async function POST(req: NextRequest) {
  const { userId } = await auth();
  if (!userId)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const client = await clerkClient();
  const user = await client.users.getUser(userId);
  const isAdmin = user.privateMetadata.isAdmin === true;
  const credits = (user.privateMetadata.credits as number | undefined) ?? 3;

  if (!isAdmin && credits < STORY_CREDIT_COST) {
    return NextResponse.json(
      { error: "No credits remaining. Visit /account to purchase more." },
      { status: 402 }
    );
  }

  const { profileId, theme, premise, notes, storyPreset, locale } = (await req.json()) as {
    profileId: string;
    theme?: string;
    premise?: string;
    notes?: string;
    storyPreset?: 'tiny-tales' | 'moonlit-adventures' | 'epic-sagas';
    locale?: string;
  };

  if (!profileId)
    return NextResponse.json(
      { error: "profileId is required" },
      { status: 400 }
    );

  const profile = await db.profiles.getById(profileId);
  if (!profile || profile.userId !== userId) {
    return NextResponse.json({ error: "Profile not found" }, { status: 404 });
  }

  if (!process.env.ANTHROPIC_API_KEY) {
    return NextResponse.json(
      { error: "ANTHROPIC_API_KEY not configured" },
      { status: 503 }
    );
  }

  const story: Story = {
    id: randomUUID(),
    userId,
    title: "Weaving your story...",
    profileId,
    profileName: profile.name,
    pages: [],
    wordCount: 0,
    theme: theme ?? "a gentle adventure",
    premise,
    notes: notes ?? "",
    storyPreset: storyPreset ?? "moonlit-adventures",
    createdAt: new Date().toISOString(),
    status: "generating",
  };

  await db.stories.create(story);

  return NextResponse.json(
    {
      id: story.id,
      locale,
    },
    { status: 201 }
  );
}
