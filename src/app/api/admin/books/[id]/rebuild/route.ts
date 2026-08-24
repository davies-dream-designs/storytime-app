import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getAdminIdentity } from "@/lib/adminAuth";
import { enqueueBookBuildJob } from "@/lib/print-books/jobs";
import { getBookProjectStageLabel } from "@/lib/print-books/status";
import { inngest, INNGEST_EVENTS } from "@/lib/inngest/client";

/**
 * Admin action: rebuild a book's character + location bibles (and spreads) from
 * scratch, then run a full build. A plain retry on a finished book resolves to
 * an exports-only pass and will NOT regenerate the bibles, so existing books
 * cannot otherwise pick up an improved bible (e.g. the Location Bible). This
 * resets the derived fields so `advanceFullBuild` re-enters the bible stage.
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  if (!(await getAdminIdentity())) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id } = await params;
  const project = await db.bookProjects.getById(id);
  if (!project) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const resetProject = await db.bookProjects.update(id, {
    status: "bible",
    currentStageLabel: getBookProjectStageLabel("bible"),
    errorCode: undefined,
    errorMessage: undefined,
    characterBible: undefined,
    locationBible: undefined,
    spreads: [],
    completedSpreads: 0,
    totalSpreads: project.spreadCount,
  });
  if (!resetProject) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  try {
    const { job, project: queuedProject } = await enqueueBookBuildJob({
      project: resetProject,
      mode: "full",
      baseUrl: req.nextUrl.origin,
    });
    await inngest.send({
      name: INNGEST_EVENTS.bookBuildRequested,
      data: { jobId: job.id, userId: resetProject.userId },
    });
    return NextResponse.json({ project: queuedProject, mode: "full" });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unknown build error";
    const status = /already running|complete draft/i.test(message) ? 409 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
