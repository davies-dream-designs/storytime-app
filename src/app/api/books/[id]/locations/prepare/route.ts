import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { db } from "@/lib/db";
import {
  applyPreferredFixtureToLocationBible,
  generateLocationBible,
} from "@/lib/print-books/locationBible";

/**
 * Generate (once) the location bible for a fresh book so the parent can review
 * the specific places in their story and optionally add ground-truth notes and
 * reference photos before any illustration credits are spent. Idempotent: if a
 * location bible already exists it is returned as-is, preserving parent edits.
 */
export async function POST(
  _req: NextRequest,
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

  const story = await db.stories.getById(project.sourceStoryId);
  if (!story || story.userId !== userId) {
    return NextResponse.json({ error: "Story not found" }, { status: 404 });
  }

  const selectedLocationFixture = story.locationFixtureId
    ? await db.locationFixtures.getById(story.locationFixtureId)
    : undefined;
  const preferredFixture =
    selectedLocationFixture?.userId === userId
      ? selectedLocationFixture
      : undefined;
  const reviewRequired = !preferredFixture;

  if (project.locationBible?.locations.length) {
    const locationBible = preferredFixture
      ? applyPreferredFixtureToLocationBible(
          project.locationBible,
          preferredFixture
        )
      : project.locationBible;
    if (locationBible !== project.locationBible) {
      await db.bookProjects.update(id, { locationBible });
    }
    return NextResponse.json({
      locationBible,
      reviewRequired,
    });
  }

  const locationBible = await generateLocationBible({
    story,
    preferredFixture,
  });
  const updated = await db.bookProjects.update(id, { locationBible });
  return NextResponse.json({
    locationBible: updated?.locationBible ?? locationBible,
    reviewRequired,
  });
}
