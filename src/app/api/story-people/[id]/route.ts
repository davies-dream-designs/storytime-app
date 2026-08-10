import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { db } from "@/lib/db";
import type { StoryPerson } from "@/types";
import { sanitizeBodyBuild, sanitizeStoryPersonRelationship } from "@/types";

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

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { userId } = await auth();
  if (!userId)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const existing = await db.storyPeople.getById(id);
  if (!existing || existing.userId !== userId) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const body = (await req.json()) as Partial<StoryPerson>;
  const name =
    body.name === undefined ? existing.name : sanitizeText(body.name, 80);
  if (!name) {
    return NextResponse.json({ error: "Name is required" }, { status: 400 });
  }

  const profiles = await db.profiles.getByUserId(userId);
  const allowedProfileIds = new Set(profiles.map((profile) => profile.id));
  const requestedProfileIds =
    body.profileIds === undefined
      ? existing.profileIds
      : sanitizeProfileIds(body.profileIds);
  const profileIds = requestedProfileIds.filter((profileId) =>
    allowedProfileIds.has(profileId)
  );
  const availableToAllProfiles =
    body.availableToAllProfiles ?? existing.availableToAllProfiles;
  if (!availableToAllProfiles && profileIds.length === 0) {
    return NextResponse.json(
      {
        error:
          "Choose at least one child profile or make this person reusable for all children.",
      },
      { status: 400 }
    );
  }

  const updated = await db.storyPeople.update(id, {
    name,
    relationship:
      body.relationship === undefined
        ? existing.relationship
        : sanitizeStoryPersonRelationship(body.relationship),
    customRelationship:
      body.relationship === undefined && body.customRelationship === undefined
        ? existing.customRelationship
        : sanitizeStoryPersonRelationship(
              body.relationship ?? existing.relationship
            ) === "other"
          ? sanitizeText(body.customRelationship, 80) || undefined
          : undefined,
    bodyBuild:
      body.bodyBuild === undefined
        ? existing.bodyBuild
        : sanitizeBodyBuild(body.bodyBuild),
    description:
      body.description === undefined
        ? existing.description
        : sanitizeText(body.description),
    personality:
      body.personality === undefined
        ? existing.personality
        : sanitizeText(body.personality),
    appearance:
      body.appearance === undefined
        ? existing.appearance
        : sanitizeText(body.appearance),
    pronouns:
      body.pronouns === undefined
        ? existing.pronouns
        : sanitizeText(body.pronouns, 80) || undefined,
    avatarImageUrl:
      body.avatarImageUrl === undefined
        ? existing.avatarImageUrl
        : sanitizeText(body.avatarImageUrl, 600) || undefined,
    appearanceSummary:
      body.appearanceSummary === undefined
        ? existing.appearanceSummary
        : sanitizeText(body.appearanceSummary) || undefined,
    availableToAllProfiles,
    profileIds,
  });

  return NextResponse.json(updated);
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { userId } = await auth();
  if (!userId)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const existing = await db.storyPeople.getById(id);
  if (!existing || existing.userId !== userId) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  await db.storyPeople.delete(id);
  return NextResponse.json({ success: true });
}
