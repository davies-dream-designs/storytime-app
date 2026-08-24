import { randomUUID } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { db } from "@/lib/db";
import type { LocationFixture } from "@/types/printBook";

function sanitizeText(value: unknown, maxLength = 600): string {
  return typeof value === "string" ? value.trim().slice(0, maxLength) : "";
}

function sanitizeStringArray(value: unknown, maxItems = 12): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((v): v is string => typeof v === "string")
    .map((v) => v.trim())
    .filter(Boolean)
    .slice(0, maxItems);
}

export async function GET() {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const fixtures = await db.locationFixtures.getByUserId(userId);
  return NextResponse.json(fixtures);
}

export async function POST(req: NextRequest) {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = (await req.json()) as Partial<LocationFixture>;
  const place = sanitizeText(body.place, 120);
  if (!place) {
    return NextResponse.json({ error: "Place is required" }, { status: 400 });
  }

  const now = new Date().toISOString();
  const fixture: LocationFixture = {
    id: randomUUID(),
    userId,
    place,
    area: sanitizeText(body.area, 120) || undefined,
    summary: sanitizeText(body.summary) || undefined,
    notes: sanitizeText(body.notes, 1200) || undefined,
    referenceImageUrl: sanitizeText(body.referenceImageUrl, 600) || undefined,
    fixedElements: sanitizeStringArray(body.fixedElements),
    doNotChange: sanitizeStringArray(body.doNotChange),
    lighting: sanitizeText(body.lighting, 200) || undefined,
    palette: sanitizeText(body.palette, 200) || undefined,
    createdAt: now,
    updatedAt: now,
  };

  await db.locationFixtures.create(fixture);
  return NextResponse.json(fixture, { status: 201 });
}
