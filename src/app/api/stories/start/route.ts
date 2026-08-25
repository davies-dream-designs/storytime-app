import { randomUUID } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { auth, clerkClient } from "@clerk/nextjs/server";
import { db } from "@/lib/db";
import {
  assessProfileIp,
  assessStoryIdeaIp,
  profileIpErrorResponse,
} from "@/lib/ipGuardrails";
import { locationFixtureName } from "@/lib/print-books/locationFixtures";
import { STORY_CREDIT_COST } from "@/lib/pricing";
import {
  storyIdeaSafetyErrorResponse,
  validateStoryIdeaSafety,
} from "@/lib/storySafety";
import { getSelectedStoryPeople } from "@/lib/storyPeopleSelection";
import type { Story, StoryPreset } from "@/types";

function sanitizeText(value: unknown, maxLength = 200): string {
  return typeof value === "string" ? value.trim().slice(0, maxLength) : "";
}

export async function POST(req: NextRequest) {
  const { userId } = await auth();
  if (!userId)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const {
    profileId,
    theme,
    premise,
    notes,
    locationHint: rawLocationHint,
    locationFixtureId: rawLocationFixtureId,
    storyPreset,
    locale,
    storyPersonIds,
  } = (await req.json()) as {
    profileId: string;
    theme?: string;
    premise?: string;
    notes?: string;
    locationHint?: string;
    locationFixtureId?: string;
    storyPreset?: StoryPreset;
    locale?: string;
    storyPersonIds?: string[];
  };

  const locationHint = sanitizeText(rawLocationHint, 160);
  const locationFixtureId = sanitizeText(rawLocationFixtureId, 120);

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

  const [
    user,
    profile,
    characters,
    selectedStoryPeople,
    selectedLocationFixture,
  ] = await Promise.all([
    clerkClient().then((client) => client.users.getUser(userId)),
    db.profiles.getById(profileId),
    db.characters.getByProfileId(profileId),
    getSelectedStoryPeople({ userId, profileId, storyPersonIds }),
    locationFixtureId
      ? db.locationFixtures.getById(locationFixtureId)
      : Promise.resolve(undefined),
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

  if (selectedLocationFixture && selectedLocationFixture.userId !== userId) {
    return NextResponse.json({ error: "Location not found" }, { status: 404 });
  }

  const resolvedLocationHint = selectedLocationFixture
    ? locationFixtureName(selectedLocationFixture)
    : locationHint || undefined;

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
    locationHint: resolvedLocationHint,
    locationFixtureId: selectedLocationFixture?.id,
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
