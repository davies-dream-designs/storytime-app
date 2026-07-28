import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { db } from "@/lib/db";
import type { ChildProfile } from "@/types";
import { sanitizeChildAppearance } from "@/types";
import {
  hasProfileIpConfirmation,
  PROFILE_IP_CONFIRMATION_ERROR,
} from "@/lib/profileIpConfirmation";

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
  const profileUpdates = { ...body };
  delete profileUpdates.ipConfirmationAccepted;
  const updated = await db.profiles.update(id, {
    ...profileUpdates,
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

  await db.profiles.delete(id);
  return NextResponse.json({ success: true });
}
