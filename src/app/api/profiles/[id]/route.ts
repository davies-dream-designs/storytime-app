import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { db } from "@/lib/db";
import type { ChildProfile } from "@/types";
import { sanitizeChildAppearance, sanitizeChildGender } from "@/types";
import {
  hasProfileIpConfirmation,
  PROFILE_IP_CONFIRMATION_ERROR,
} from "@/lib/profileIpConfirmation";
import { isAllowedMediaUrl } from "@/lib/safeMediaFetch";

// Fields a parent may edit directly. Identity (id/userId/createdAt) and all
// avatar-generation bookkeeping stay server-controlled so a request body can't
// reassign ownership or forge generation state.
const EDITABLE_PROFILE_FIELDS = [
  "name",
  "age",
  "dateOfBirth",
  "gender",
  "appearance",
  "appearanceSummary",
  "favouriteCharacters",
  "favouriteActivities",
  "favouriteAnimals",
  "favouritePlaces",
  "lessons",
] as const;

function pickEditableProfileFields(
  body: Partial<ChildProfile>
): Partial<ChildProfile> {
  const updates: Partial<ChildProfile> = {};
  for (const key of EDITABLE_PROFILE_FIELDS) {
    if (key in body && body[key] !== undefined) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (updates as any)[key] = body[key];
    }
  }
  // avatarImageUrl is accepted only when it is one of our own stored assets.
  if (body.avatarImageUrl && isAllowedMediaUrl(body.avatarImageUrl)) {
    updates.avatarImageUrl = body.avatarImageUrl;
  }
  return updates;
}

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { userId } = await auth();
  if (!userId)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const profile = await db.profiles.getById(id);
  if (!profile || profile.userId !== userId) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  return NextResponse.json(profile);
}

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { userId } = await auth();
  if (!userId)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const profile = await db.profiles.getById(id);
  if (!profile || profile.userId !== userId) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const body = (await req.json()) as Partial<ChildProfile> & {
    ipConfirmationAccepted?: boolean;
  };
  if (!hasProfileIpConfirmation(body)) {
    return NextResponse.json(
      { error: PROFILE_IP_CONFIRMATION_ERROR },
      { status: 400 }
    );
  }
  const profileUpdates = pickEditableProfileFields(body);
  const updated = await db.profiles.update(id, {
    ...profileUpdates,
    ...(profileUpdates.gender !== undefined
      ? { gender: sanitizeChildGender(profileUpdates.gender) }
      : {}),
    ...(profileUpdates.appearance !== undefined
      ? { appearance: sanitizeChildAppearance(profileUpdates.appearance) }
      : {}),
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
  const profile = await db.profiles.getById(id);
  if (!profile || profile.userId !== userId) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  // Cascade: deleting a child must not leave their stories/books (and the
  // sharing state + generated art those carry) behind. `stories.delete` already
  // cascades to book projects and their blob assets.
  const stories = await db.stories.getByProfileId(id);
  await Promise.all(
    stories
      .filter((story) => story.userId === userId)
      .map((story) => db.stories.delete(story.id))
  );

  await db.profiles.delete(id);
  return NextResponse.json({ success: true });
}
