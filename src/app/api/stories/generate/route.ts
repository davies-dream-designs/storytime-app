import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { auth, clerkClient } from "@clerk/nextjs/server";
import { kv } from "@vercel/kv";
import { db } from "@/lib/db";
import { STORY_CREDIT_COST } from "@/lib/pricing";
import { generateStory } from "@/lib/storyGenerator";
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

  const { profileId, theme, premise, notes, locale } = (await req.json()) as {
    profileId: string;
    theme?: string;
    premise?: string;
    notes?: string;
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

  const [characters, recentStories] = await Promise.all([
    db.characters.getByProfileId(profileId),
    db.stories.getByProfileId(profileId),
  ]);

  const recentTitles = recentStories
    .filter((s) => s.userId === userId)
    .sort((a, b) => (a.createdAt > b.createdAt ? -1 : 1))
    .slice(0, 5)
    .map((s) => s.title);

  const generated = await generateStory({
    profile,
    characters: characters.filter((c) => c.userId === userId),
    theme: theme ?? "a gentle adventure",
    premise,
    notes: notes ?? "",
    recentTitles,
    locale,
  });

  const wordCount = generated.pages.reduce(
    (acc, p) => acc + p.text.split(/\s+/).length,
    0
  );

  const story: Story = {
    id: randomUUID(),
    userId,
    title: generated.title,
    profileId,
    profileName: profile.name,
    pages: generated.pages,
    wordCount,
    theme: theme ?? "a gentle adventure",
    premise,
    notes: notes ?? "",
    createdAt: new Date().toISOString(),
  };

  await Promise.all([
    db.stories.create(story),
    kv.del(`suggestions:${profileId}`),
  ]);

  if (!isAdmin) {
    await client.users.updateUserMetadata(userId, {
      privateMetadata: { credits: credits - STORY_CREDIT_COST },
    });
  }

  return NextResponse.json(
    {
      ...story,
      creditsRemaining: isAdmin ? Infinity : credits - STORY_CREDIT_COST,
    },
    { status: 201 }
  );
}
