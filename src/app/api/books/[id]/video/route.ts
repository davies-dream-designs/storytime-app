import { NextRequest, NextResponse } from "next/server";
import { auth, clerkClient } from "@clerk/nextjs/server";
import { db } from "@/lib/db";
import { inngest, INNGEST_EVENTS } from "@/lib/inngest/client";
import { getIllustratedSpreads, isVideoConfigured } from "@/lib/print-books/video";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

// GET — return animated video status and per-spread clip URLs
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { userId } = await auth();
  if (!userId)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const project = await db.bookProjects.getById(id);
  if (!project || project.userId !== userId)
    return NextResponse.json({ error: "Not found" }, { status: 404 });

  const clips = getIllustratedSpreads(project.spreads)
    .filter((s) => s.leftPageVideoUrl)
    .map((s) => ({
      spreadId: s.id,
      sequence: s.sequence,
      videoUrl: s.leftPageVideoUrl,
      imageUrl: s.leftPageImageUrl,
      sceneBrief: s.sceneBrief,
    }));

  return NextResponse.json({
    unlocked: Boolean(project.assets.animatedVideoUnlockedAt),
    status: project.assets.animatedVideoStatus ?? null,
    startedAt: project.assets.animatedVideoStartedAt ?? null,
    readyAt: project.assets.animatedVideoReadyAt ?? null,
    error: project.assets.animatedVideoError ?? null,
    clips,
    totalSpreads: getIllustratedSpreads(project.spreads).length,
  });
}

// POST — admin-only: re-trigger video generation
export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { userId } = await auth();
  if (!userId)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const client = await clerkClient();
  const user = await client.users.getUser(userId);
  if (user.privateMetadata.isAdmin !== true)
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  if (!isVideoConfigured())
    return NextResponse.json(
      { error: "FAL_KEY not configured" },
      { status: 503 }
    );

  const { id } = await params;
  const project = await db.bookProjects.getById(id);
  if (!project || project.status !== "ready")
    return NextResponse.json({ error: "Not found or not ready" }, { status: 404 });

  await db.bookProjects.update(project.id, {
    assets: {
      ...project.assets,
      animatedVideoUnlockedAt:
        project.assets.animatedVideoUnlockedAt ?? new Date().toISOString(),
      animatedVideoStatus: "generating",
      animatedVideoStartedAt: new Date().toISOString(),
      animatedVideoError: undefined,
    },
  });

  await inngest.send({
    name: INNGEST_EVENTS.bookVideoRequested,
    data: { projectId: project.id },
  });

  return NextResponse.json({ triggered: true });
}
