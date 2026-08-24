import { randomUUID } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { auth, clerkClient } from "@clerk/nextjs/server";
import { db } from "@/lib/db";
import { STORY_CREDIT_COST } from "@/lib/pricing";
import {
  storyIdeaSafetyErrorResponse,
  validateStoryIdeaSafety,
} from "@/lib/storySafety";
import {
  assessProfileIp,
  assessStoryIdeaIp,
  profileIpErrorResponse,
} from "@/lib/ipGuardrails";
import { getSelectedStoryPeople } from "@/lib/storyPeopleSelection";
import type { Story, StoryPreset } from "@/types";

export async function POST(req: NextRequest) {
  const { userId } = await auth();
  if (!userId)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const {
    profileId,
    theme,
    premise,
    notes,
    storyPreset,
    locale,
    storyPersonIds,
  } = (await req.json()) as {
    profileId: string;
    theme?: string;
    premise?: string;
    notes?: string;
    storyPreset?: StoryPreset;
    locale?: string;
    storyPersonIds?: string[];
  };

  const safety = validateStoryIdeaSafety({ theme, premise, notes });
  if (!safety.ok) {
    return NextResponse.json(storyIdeaSafetyErrorResponse(safety), {
      status: 400,
    });
  }

  if (!profileId)
    return NextResponse.json(
      { error: "profileId is required" },
      { status: 400 }
    );

  // These four lookups only depend on userId/profileId, not on each other, so
  // run them concurrently to keep the click→navigate round-trip snappy.
  const [user, profile, characters, selectedStoryPeople] = await Promise.all([
    clerkClient().then((client) => client.users.getUser(userId)),
    db.profiles.getById(profileId),
    db.characters.getByProfileId(profileId),
    getSelectedStoryPeople({ userId, profileId, storyPersonIds }),
  ]);

  const isAdmin = user.privateMetadata.isAdmin === true;
  const credits = (user.privateMetadata.credits as number | undefined) ?? 3;

  if (!isAdmin && credits < STORY_CREDIT_COST) {
    return NextResponse.json(
      { error: "You're out of credits. Visit your account to top up." },
      { status: 402 }
    );
  }

  if (!profile || profile.userId !== userId) {
    return NextResponse.json({ error: "Profile not found" }, { status: 404 });
  }
  const profileIpPolicy = assessProfileIp({
    ...profile,
    characters: characters.filter((c) => c.userId === userId),
    storyPeople: selectedStoryPeople,
  });
  if (profileIpPolicy.printAllowed === false) {
    return NextResponse.json(profileIpErrorResponse(profileIpPolicy), {
      status: 400,
    });
  }

  if (!process.env.ANTHROPIC_API_KEY) {
    return NextResponse.json(
      { error: "ANTHROPIC_API_KEY not configured" },
      { status: 503 }
    );
  }

  const ipPolicy = assessStoryIdeaIp({ theme, premise, notes });

  const story: Story = {
    id: randomUUID(),
    userId,
    title: "Weaving your story...",
    profileId,
    profileName: profile.name,
    pages: [],
    wordCount: 0,
    theme: theme ?? "a gentle adventure",
    premise: ipPolicy.originalizedPremise ?? premise,
    notes: ipPolicy.originalizedNotes ?? notes ?? "",
    storyPreset: storyPreset ?? "preschool-story",
    storyPersonIds: selectedStoryPeople.map((person) => person.id),
    ipPolicy,
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
