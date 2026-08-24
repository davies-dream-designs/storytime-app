import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { db } from "@/lib/db";
import { generateLocationBible } from "@/lib/print-books/locationBible";

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

  if (project.locationBible?.locations.length) {
    return NextResponse.json({ locationBible: project.locationBible });
  }

  const story = await db.stories.getById(project.sourceStoryId);
  if (!story || story.userId !== userId) {
    return NextResponse.json({ error: "Story not found" }, { status: 404 });
  }

  const locationBible = await generateLocationBible({ story });
  const updated = await db.bookProjects.update(id, { locationBible });
  return NextResponse.json({ locationBible: updated?.locationBible ?? locationBible });
}
