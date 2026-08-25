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

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const existing = await db.locationFixtures.getById(id);
  if (!existing || existing.userId !== userId) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const body = (await req.json()) as Partial<LocationFixture>;
  const updates: Partial<LocationFixture> = {};
  if (body.place !== undefined) {
    const place = sanitizeText(body.place, 120);
    if (!place) {
      return NextResponse.json({ error: "Place is required" }, { status: 400 });
    }
    updates.place = place;
  }
  if (body.area !== undefined) updates.area = sanitizeText(body.area, 120) || undefined;
  if (body.summary !== undefined)
    updates.summary = sanitizeText(body.summary) || undefined;
  if (body.notes !== undefined)
    updates.notes = sanitizeText(body.notes, 1200) || undefined;
  if (body.fixedElements !== undefined)
    updates.fixedElements = sanitizeStringArray(body.fixedElements);
  if (body.doNotChange !== undefined)
    updates.doNotChange = sanitizeStringArray(body.doNotChange);
  if (body.lighting !== undefined)
    updates.lighting = sanitizeText(body.lighting, 200) || undefined;
  if (body.palette !== undefined)
    updates.palette = sanitizeText(body.palette, 200) || undefined;

  const updated = await db.locationFixtures.update(id, updates);
  return NextResponse.json(updated);
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const existing = await db.locationFixtures.getById(id);
  if (!existing || existing.userId !== userId) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  await db.locationFixtures.delete(id);
  return NextResponse.json({ ok: true });
}
