import { randomUUID } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { getAdminIdentity } from "@/lib/adminAuth";
import { db } from "@/lib/db";
import { inferBookAgeBand } from "@/lib/print-books/ageBand";
import { createEmptyBookProject } from "@/lib/print-books/composer";
import { TRADE_SYSTEM_USER_ID } from "@/types/tradeBook";

type ActionBody = {
  decision?: unknown;
  note?: unknown;
};

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const admin = await getAdminIdentity();
  if (!admin) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id } = await params;
  const title = await db.tradeTitles.getById(id);
  if (!title) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  if (title.status !== "draft") {
    return NextResponse.json(
      { error: "Only generated drafts can be reviewed." },
      { status: 400 }
    );
  }

  const body = (await req.json().catch(() => ({}))) as ActionBody;
  if (body.decision !== "approved" && body.decision !== "rejected") {
    return NextResponse.json(
      { error: "Invalid review decision." },
      { status: 400 }
    );
  }
  if (body.note !== undefined && typeof body.note !== "string") {
    return NextResponse.json(
      { error: "Invalid review note." },
      { status: 400 }
    );
  }
  const reviewNote = typeof body.note === "string" ? body.note.trim() : "";
  if (reviewNote.length > 4000) {
    return NextResponse.json(
      { error: "Review notes must be 4,000 characters or fewer." },
      { status: 400 }
    );
  }

  let updated = await db.tradeTitles.update(id, {
    status: body.decision,
    reviewedAt: new Date().toISOString(),
    reviewedBy: admin.label,
    reviewNote,
  });

  if (body.decision === "approved" && title.storyId && title.profileId) {
    const story = await db.stories.getById(title.storyId);
    const profile = await db.profiles.getById(title.profileId);
    if (story && profile) {
      const ageBand = inferBookAgeBand({
        profile,
        storyPreset: story.storyPreset,
      });
      const project = createEmptyBookProject({
        id: randomUUID(),
        userId: TRADE_SYSTEM_USER_ID,
        sourceStoryId: title.storyId,
        profileId: title.profileId,
        ageBand,
      });
      project.assets = {
        ...project.assets,
        imageProvider: "trade_cliproxy",
      };
      await db.bookProjects.create(project);

      const now = new Date().toISOString();
      const jobId = randomUUID();
      await db.bookBuildJobs.create({
        id: jobId,
        projectId: project.id,
        userId: TRADE_SYSTEM_USER_ID,
        mode: "full",
        status: "queued",
        step: 0,
        totalSteps: project.spreadCount,
        token: randomUUID(),
        baseUrl: process.env.NEXT_PUBLIC_APP_URL ?? "",
        createdAt: now,
        updatedAt: now,
      });

      await db.tradeBookJobs.enqueue({
        kind: "build_trade_book",
        dedupeKey: `trade-build:${id}:v1`,
        payload: {
          tradeTitleId: id,
          bookProjectId: project.id,
          bookBuildJobId: jobId,
        },
      });

      updated = await db.tradeTitles.update(id, {
        bookProjectId: project.id,
      });
    }
  }

  return NextResponse.json({ title: updated });
}
