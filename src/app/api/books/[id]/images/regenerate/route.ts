import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { db } from "@/lib/db";
import { imageRatelimit, checkRatelimit } from "@/lib/ratelimit";
import { enqueueBookImageRegeneration } from "@/lib/bookImageRegenerationJobs";

type RegenerateImagePayload = {
  spreadId?: string;
  side?: "left" | "right";
  correctionNote?: string;
  attemptKey?: string;
};

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { userId } = await auth();
  if (!userId) {
    const { id } = await params;
    console.warn("Book image regenerate unauthorized", { projectId: id });
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const payload = (await req
    .json()
    .catch(() => ({}))) as RegenerateImagePayload;
  const side =
    payload.side === "left" || payload.side === "right" ? payload.side : null;
  if (!payload.spreadId || !side) {
    return NextResponse.json(
      { error: "Choose a spread image to regenerate." },
      { status: 400 }
    );
  }
  const correctionNote =
    typeof payload.correctionNote === "string"
      ? payload.correctionNote.trim().slice(0, 500)
      : undefined;

  const rateLimitRes = await checkRatelimit(imageRatelimit, userId);
  if (rateLimitRes) return rateLimitRes;

  try {
    const { id } = await params;
    const currentProject = await db.bookProjects.getById(id);
    if (!currentProject || currentProject.userId !== userId) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    const result = await enqueueBookImageRegeneration({
      project: currentProject,
      spreadId: payload.spreadId,
      side,
      correctionNote,
      attemptKey: payload.attemptKey ?? req.headers.get("Idempotency-Key"),
    });

    return NextResponse.json(result, { status: result.existing ? 200 : 202 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    const status = /insufficient credits/i.test(message)
      ? 402
      : /not found/i.test(message)
        ? 404
        : /already running|complete draft|provider credentials|blob storage/i.test(
              message
            )
          ? 409
          : 500;

    return NextResponse.json({ error: message }, { status });
  }
}
