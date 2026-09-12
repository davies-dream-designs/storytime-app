import { randomUUID } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { auth, clerkClient } from "@clerk/nextjs/server";
import { kv } from "@vercel/kv";
import { db } from "@/lib/db";
import {
  assessGeneratedStoryIp,
  assessProfileIp,
  assessStoryIdeaIp,
  profileIpErrorResponse,
} from "@/lib/ipGuardrails";
import { STORY_CREDIT_COST } from "@/lib/pricing";
import { chargeStoryGenerationCredit } from "@/lib/credits";
import { logEvent } from "@/lib/logEvent";
import {
  storyIdeaSafetyErrorResponse,
  validateStoryIdeaSafety,
} from "@/lib/storySafety";
import { generateStory, StoryGenerationError } from "@/lib/storyGenerator";
import { getSelectedStoryPeople } from "@/lib/storyPeopleSelection";
import type { Story } from "@/types";

export async function POST(req: NextRequest) {
  const { userId } = await auth();
  if (!userId)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const {
    profileId,
    theme,
    premise,
    notes,
    locale,
    storyPersonIds,
  } = (await req.json()) as {
    profileId: string;
    theme?: string;
    premise?: string;
    notes?: string;
    locale?: string;
    storyPersonIds?: string[];
  };

  const safety = validateStoryIdeaSafety({ theme, premise, notes });
  if (!safety.ok) {
    return NextResponse.json(storyIdeaSafetyErrorResponse(safety), {
      status: 400,
    });
  }

  const client = await clerkClient();
  const user = await client.users.getUser(userId);
  const isAdmin = user.privateMetadata.isAdmin === true;
  const credits = (user.privateMetadata.credits as number | undefined) ?? 3;

  if (!isAdmin && credits < STORY_CREDIT_COST) {
    return NextResponse.json(
      { error: "You're out of credits. Visit your account to top up." },
      { status: 402 }
    );
  }

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
  const safeCharacters = characters.filter((c) => c.userId === userId);
  const selectedStoryPeople = await getSelectedStoryPeople({
    userId,
    profileId,
    storyPersonIds,
  });
  const profileIpPolicy = assessProfileIp({
    ...profile,
    characters: safeCharacters,
    storyPeople: selectedStoryPeople,
  });
  if (profileIpPolicy.printAllowed === false) {
    return NextResponse.json(profileIpErrorResponse(profileIpPolicy), {
      status: 400,
    });
  }

  const ipPolicy = assessStoryIdeaIp({ theme, premise, notes });

  const recentTitles = recentStories
    .filter((s) => s.userId === userId)
    .sort((a, b) => (a.createdAt > b.createdAt ? -1 : 1))
    .slice(0, 5)
    .map((s) => s.title);

  let generated;
  try {
    generated = await generateStory({
      profile,
      characters: safeCharacters,
      storyPeople: selectedStoryPeople,
      theme: theme ?? "a gentle adventure",
      premise: ipPolicy.originalizedPremise ?? premise,
      notes: ipPolicy.originalizedNotes ?? notes ?? "",
      recentTitles,
      locale,
    });
  } catch (error) {
    if (error instanceof StoryGenerationError) {
      return NextResponse.json({ error: error.message }, { status: 502 });
    }
    throw error;
  }

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
    premise: ipPolicy.originalizedPremise ?? premise,
    notes: ipPolicy.originalizedNotes ?? notes ?? "",
    storyPersonIds: selectedStoryPeople.map((person) => person.id),
    ipPolicy,
    createdAt: new Date().toISOString(),
    status: "ready",
  };
  const generatedIpPolicy = assessGeneratedStoryIp(story);
  story.ipPolicy =
    generatedIpPolicy.riskLevel === "restricted" ? generatedIpPolicy : ipPolicy;

  // Stamp the charge marker in the same write that persists the story so the
  // debit is idempotent if this request is ever retried.
  const shouldCharge = !isAdmin;
  if (shouldCharge) story.creditChargedAt = new Date().toISOString();

  await Promise.all([
    db.stories.create(story),
    kv.del(`suggestions:${profileId}`),
  ]);

  let creditsRemaining = isAdmin ? Infinity : credits - STORY_CREDIT_COST;
  if (shouldCharge) {
    // Debit against a fresh read, not the balance captured at request start, so
    // concurrent operations on the same account can't lose an update.
    const next = await chargeStoryGenerationCredit(
      userId,
      `story:${story.id}`
    ).catch(
      async (err) => {
        await logEvent({
          error: err,
          fallbackCode: "story.generation_failed",
          userId,
          entityType: "story",
          entityId: story.id,
          source: "story/generation",
          context: { phase: "credit_charge" },
        });
        return null;
      }
    );
    if (typeof next === "number") creditsRemaining = next;
  }

  return NextResponse.json(
    {
      ...story,
      creditsRemaining,
    },
    { status: 201 }
  );
}
