import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { db } from "@/lib/db";
import { enqueueLocationEstablishingJob } from "@/lib/print-books/locationEstablishingJobs";
import { validateStoryPersonPhoto } from "@/lib/storyPeopleAvatars";

const MAX_PHOTOS = 5;

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const fixture = await db.locationFixtures.getById(id);
  if (!fixture || fixture.userId !== userId) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  return NextResponse.json({
    fixture,
    status:
      fixture.establishingImageStatus ??
      (fixture.establishingImageUrl ? "ready" : undefined),
    establishingImageUrl: fixture.establishingImageUrl,
    error: fixture.establishingImageError,
    jobId: fixture.establishingImageJobId,
  });
}

/**
 * Generate a reusable establishing illustration for a location fixture from one
 * or more uploaded photos. The photos are used to draw the illustration, then
 * discarded — only the generated illustration is persisted (same model as
 * story-people avatars). Locations accept multiple angles.
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const fixture = await db.locationFixtures.getById(id);
  if (!fixture || fixture.userId !== userId) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
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
      target: { kind: "location_fixture", fixtureId: id },
      files: photos,
      targetLabel: "fixture",
    });
    const queued = await db.locationFixtures.getById(id);
    return NextResponse.json(
      {
        jobId,
        status: queued?.establishingImageStatus ?? "queued",
        fixture: queued,
      },
      { status: 202 }
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : "Generation failed";
    const status = /insufficient credits/i.test(message) ? 402 : 502;
    return NextResponse.json({ error: message }, { status });
  }
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
  const fixture = await db.locationFixtures.getById(id);
  if (!fixture || fixture.userId !== userId) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const updated = await db.locationFixtures.update(id, {
    establishingImageUrl: undefined,
    referenceImageUrl: undefined,
    establishingImageStatus: undefined,
    establishingImageError: undefined,
    establishingImageJobId: undefined,
  });
  return NextResponse.json({ fixture: updated });
}
