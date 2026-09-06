import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { db } from "@/lib/db";
import {
  generateLocationBible,
  resolvePreferredFixtures,
} from "@/lib/print-books/locationBible";
import { getStoryLocationFixtures } from "@/lib/storyLocationFixtures";
import type { LocationBible } from "@/types/printBook";

/**
 * Generate (once) the location bible for a fresh book so the parent can review
 * the specific places in their story and optionally add ground-truth notes and
 * reference photos before any illustration credits are spent. Idempotent: if a
 * location bible already exists it is returned as-is, preserving parent edits.
 *
 * Review is required whenever no fixtures were selected OR any selected fixture
 * could not be confidently bound to a story location — never merely because
 * fixtures were loaded. This stops a saved place being silently applied to the
 * wrong room and stops an unmatched selection from skipping review.
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

  const preferredFixtures = await getStoryLocationFixtures({ story, userId });

  const existing = project.locationBible;
  const baseBible: LocationBible = existing?.locations.length
    ? existing
    : await generateLocationBible({ story, preferredFixtures });

  const { bible, unresolvedFixtureIds } = resolvePreferredFixtures(
    baseBible,
    preferredFixtures
  );

  if (bible !== project.locationBible) {
    await db.bookProjects.update(id, { locationBible: bible });
  }

  const reviewRequired =
    preferredFixtures.length === 0 || unresolvedFixtureIds.length > 0;

  return NextResponse.json({
    locationBible: bible,
    reviewRequired,
    unresolvedFixtureIds,
  });
}
