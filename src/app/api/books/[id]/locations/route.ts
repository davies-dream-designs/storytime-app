import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { db } from "@/lib/db";
import { isAllowedMediaUrl } from "@/lib/safeMediaFetch";

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

  const rejectedImageLocationIds: string[] = [];
  const locations = project.locationBible.locations.map((location) => {
    const next = { ...location };
    let edited = false;
    if (location.id in notes) {
      const value = notes[location.id];
      const note = typeof value === "string" ? value.trim() : "";
      next.notes = note || undefined;
      edited = true;
    }
    if (location.id in establishingImageUrls) {
      const value = establishingImageUrls[location.id];
      const url = typeof value === "string" ? value.trim() : "";
      // Only accept URLs from our own asset store. An arbitrary URL here would
      // be fetched server-side during illustration (an SSRF sink).
      if (url && isAllowedMediaUrl(url)) {
        next.establishingImageUrl = url;
        edited = true;
      } else if (url) {
        rejectedImageLocationIds.push(location.id);
      }
    }
    // Mark parent corrections so a later fixture re-apply keeps them.
    if (edited) next.hasBookOverrides = true;
    return next;
  });

  if (rejectedImageLocationIds.length > 0) {
    return NextResponse.json(
      {
        error:
          "One or more location images were not from an allowed source and were rejected.",
        rejectedImageLocationIds,
      },
      { status: 400 }
    );
  }

  const updated = await db.bookProjects.update(id, {
    locationBible: { ...project.locationBible, locations },
  });
  return NextResponse.json({ locationBible: updated?.locationBible });
}
