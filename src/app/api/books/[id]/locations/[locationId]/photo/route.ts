import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { db } from "@/lib/db";
import { enqueueLocationEstablishingJob } from "@/lib/print-books/locationEstablishingJobs";
import { validateStoryPersonPhoto } from "@/lib/storyPeopleAvatars";

const MAX_PHOTOS = 5;

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string; locationId: string }> }
) {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id, locationId } = await params;
  const project = await db.bookProjects.getById(id);
  if (!project || project.userId !== userId) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  const location = project.locationBible?.locations.find(
    (loc) => loc.id === locationId
  );
  if (!location) {
    return NextResponse.json({ error: "Location not found" }, { status: 404 });
  }

  return NextResponse.json({
    location,
    locationBible: project.locationBible,
    status:
      location.establishingImageStatus ??
      (location.establishingImageUrl ? "ready" : undefined),
    establishingImageUrl: location.establishingImageUrl,
    error: location.establishingImageError,
    jobId: location.establishingImageJobId,
  });
}

/**
 * Generate an establishing illustration for one location in the book's location
 * bible from one or more parent photos. Multipart body: `photos` (Files) +
 * `photoConsent` = "yes". The photos are used to draw the illustration, then
 * discarded — only the generated illustration is stored, and its URL is written
 * to the location's `establishingImageUrl` so it anchors every spread there.
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; locationId: string }> }
) {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id, locationId } = await params;
  const project = await db.bookProjects.getById(id);
  if (!project || project.userId !== userId) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  const bible = project.locationBible;
  const location = bible?.locations.find((loc) => loc.id === locationId);
  if (!bible || !location) {
    return NextResponse.json({ error: "Location not found" }, { status: 404 });
  }

  const form = await req.formData();
  if (form.get("photoConsent") !== "yes") {
    return NextResponse.json(
      { error: "Photo consent is required." },
      { status: 400 }
    );
  }

  const photos = form
    .getAll("photos")
    .filter((entry): entry is File => entry instanceof File);
  if (photos.length === 0) {
    return NextResponse.json(
      { error: "At least one photo is required" },
      { status: 400 }
    );
  }
  if (photos.length > MAX_PHOTOS) {
    return NextResponse.json(
      { error: `Please upload at most ${MAX_PHOTOS} photos.` },
      { status: 400 }
    );
  }
  for (const photo of photos) {
    const validationError = validateStoryPersonPhoto(photo);
    if (validationError) {
      return NextResponse.json({ error: validationError }, { status: 400 });
    }
  }

  try {
    const { jobId } = await enqueueLocationEstablishingJob({
      userId,
      target: { kind: "book_location", projectId: project.id, locationId },
      files: photos,
      targetLabel: "book-location",
    });
    const queuedProject = await db.bookProjects.getById(id);
    const queuedLocation = queuedProject?.locationBible?.locations.find(
      (loc) => loc.id === locationId
    );
    return NextResponse.json(
      {
        jobId,
        status: queuedLocation?.establishingImageStatus ?? "queued",
        location: queuedLocation,
        locationBible: queuedProject?.locationBible,
      },
      { status: 202 }
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : "Generation failed";
    const status = /insufficient credits/i.test(message) ? 402 : 502;
    return NextResponse.json({ error: message }, { status });
  }
}

/** Remove a location's reference photo. */
export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string; locationId: string }> }
) {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id, locationId } = await params;
  const project = await db.bookProjects.getById(id);
  if (!project || project.userId !== userId) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  const bible = project.locationBible;
  if (!bible?.locations.some((loc) => loc.id === locationId)) {
    return NextResponse.json({ error: "Location not found" }, { status: 404 });
  }

  const locations = bible.locations.map((loc) =>
    loc.id === locationId
      ? {
          ...loc,
          establishingImageUrl: undefined,
          referenceImageUrl: undefined,
          establishingImageStatus: undefined,
          establishingImageError: undefined,
          establishingImageJobId: undefined,
        }
      : loc
  );
  const updated = await db.bookProjects.update(id, {
    locationBible: { ...bible, locations },
  });
  return NextResponse.json({ locationBible: updated?.locationBible });
}
