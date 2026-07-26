import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getAdminIdentity } from "@/lib/adminAuth";
import { enqueueBookBuildJob } from "@/lib/print-books/jobs";
import { hasUnresolvedGeneratedBookPageImages } from "@/lib/print-books/readiness";
import { inngest, INNGEST_EVENTS } from "@/lib/inngest/client";
import type { BookBuildMode } from "@/types/printBook";

function parseExplicitBuildMode(mode?: BookBuildMode): BookBuildMode | null {
  if (mode === "exports" || mode === "finalize" || mode === "art" || mode === "full") {
    return mode;
  }
  return null;
}

function getDefaultBuildMode(
  project: Awaited<ReturnType<typeof db.bookProjects.getById>>
): BookBuildMode {
  if (!project) return "full";
  if (
    project.status === "ready" ||
    project.status === "proofing" ||
    (project.errorCode === "illustrating:image_failed" &&
      !hasUnresolvedGeneratedBookPageImages(project.spreads))
  ) {
    return "exports";
  }
  return "full";
}

/** Admin action: re-trigger a book build for ANY user's book (support flow). */
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

  const payload = (await req.json().catch(() => null)) as {
    mode?: BookBuildMode;
  } | null;
  const buildMode = parseExplicitBuildMode(payload?.mode) ?? getDefaultBuildMode(project);

  try {
    const { job, project: queuedProject } = await enqueueBookBuildJob({
      project,
      mode: buildMode,
      baseUrl: req.nextUrl.origin,
    });
    await inngest.send({
      name: INNGEST_EVENTS.bookBuildRequested,
      data: { jobId: job.id },
    });
    return NextResponse.json({ project: queuedProject, mode: buildMode });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown build error";
    const status = /already running|complete draft/i.test(message) ? 409 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
