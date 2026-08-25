import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { db } from "@/lib/db";

/**
 * Save parent-supplied ground-truth notes and selected saved-location
 * establishing illustrations onto the book's location bible.
 * Body: { notes?: Record<locationId, string>, establishingImageUrls?: Record<locationId, string> }.
 * Only known location ids are updated; blank notes clear the field.
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
    establishingImageUrls?: Record<string, unknown>;
  } | null;
  const notes = body?.notes ?? {};
  const establishingImageUrls = body?.establishingImageUrls ?? {};

  const locations = project.locationBible.locations.map((location) => {
    const next = { ...location };
    if (location.id in notes) {
      const value = notes[location.id];
      const note = typeof value === "string" ? value.trim() : "";
      next.notes = note || undefined;
    }
    if (location.id in establishingImageUrls) {
      const value = establishingImageUrls[location.id];
      const url = typeof value === "string" ? value.trim() : "";
      if (url) next.establishingImageUrl = url;
    }
    return next;
  });

  const updated = await db.bookProjects.update(id, {
    locationBible: { ...project.locationBible, locations },
  });
  return NextResponse.json({ locationBible: updated?.locationBible });
}
