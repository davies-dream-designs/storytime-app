import { randomUUID } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { db } from "@/lib/db";
import type { StoryPerson } from "@/types";
import { sanitizeStoryPersonRelationship } from "@/types";

function sanitizeText(value: unknown, maxLength = 400): string {
  return typeof value === "string" ? value.trim().slice(0, maxLength) : "";
}

function sanitizeProfileIds(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return Array.from(
    new Set(
      value
        .filter((id): id is string => typeof id === "string")
        .map((id) => id.trim())
        .filter(Boolean)
    )
  );
}

export async function GET(req: NextRequest) {
  const { userId } = await auth();
  if (!userId)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const profileId = req.nextUrl.searchParams.get("profileId");
  const people = profileId
    ? await db.storyPeople.getByProfileId(profileId, userId)
    : await db.storyPeople.getByUserId(userId);

  return NextResponse.json(people);
}

export async function POST(req: NextRequest) {
  const { userId } = await auth();
  if (!userId)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = (await req.json()) as Partial<StoryPerson>;
  const name = sanitizeText(body.name, 80);
  if (!name) {
    return NextResponse.json({ error: "Name is required" }, { status: 400 });
  }

  const requestedProfileIds = sanitizeProfileIds(body.profileIds);
  const profiles = await db.profiles.getByUserId(userId);
  const allowedProfileIds = new Set(profiles.map((profile) => profile.id));
  const profileIds = requestedProfileIds.filter((id) =>
    allowedProfileIds.has(id)
  );
  const availableToAllProfiles = body.availableToAllProfiles === true;
  if (!availableToAllProfiles && profileIds.length === 0) {
    return NextResponse.json(
      {
        error:
          "Choose at least one child profile or make this person reusable for all children.",
      },
      { status: 400 }
    );
  }

  const now = new Date().toISOString();
  const person: StoryPerson = {
    id: randomUUID(),
    userId,
    name,
    relationship: sanitizeStoryPersonRelationship(body.relationship),
    description: sanitizeText(body.description),
    personality: sanitizeText(body.personality),
    appearance: sanitizeText(body.appearance),
    pronouns: sanitizeText(body.pronouns, 80) || undefined,
    avatarImageUrl: sanitizeText(body.avatarImageUrl, 600) || undefined,
    appearanceSummary: sanitizeText(body.appearanceSummary) || undefined,
    availableToAllProfiles,
    profileIds,
    createdAt: now,
    updatedAt: now,
  };

  await db.storyPeople.create(person);
  return NextResponse.json(person, { status: 201 });
}
