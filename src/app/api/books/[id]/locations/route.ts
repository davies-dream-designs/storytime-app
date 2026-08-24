import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { db } from "@/lib/db";

/**
 * Save parent-supplied ground-truth notes onto the book's location bible.
 * Body: { notes: Record<locationId, string> }. Only known location ids are
 * updated; blank notes clear the field.
 */
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const project = await db.bookProjects.getById(id);
  if (!project || project.userId !== userId) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  if (!project.locationBible?.locations.length) {
    return NextResponse.json(
      { error: "No location bible to update" },
      { status: 409 }
    );
  }

  const body = (await req.json().catch(() => null)) as {
    notes?: Record<string, unknown>;
  } | null;
  const notes = body?.notes ?? {};

  const locations = project.locationBible.locations.map((location) => {
    if (!(location.id in notes)) return location;
    const value = notes[location.id];
    const note = typeof value === "string" ? value.trim() : "";
    return { ...location, notes: note || undefined };
  });

  const updated = await db.bookProjects.update(id, {
    locationBible: { ...project.locationBible, locations },
  });
  return NextResponse.json({ locationBible: updated?.locationBible });
}
