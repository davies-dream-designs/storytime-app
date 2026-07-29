import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { db } from "@/lib/db";
import { notifyPublicStoryOwner } from "@/lib/publicStoryNotifications";

const VALID_REASONS = new Set([
  "privacy",
  "copyright",
  "unsafe",
  "spam",
  "other",
]);
const AUTO_HIDE_REPORT_THRESHOLD = 3;

type ReportBody = {
  reason?: unknown;
  note?: unknown;
};

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const story = await db.stories.getById(id);
  if (
    !story ||
    story.visibility !== "public" ||
    story.publicReviewStatus !== "approved"
  ) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  if (story.userId === userId) {
    return NextResponse.json(
      { error: "You cannot report your own story." },
      { status: 400 }
    );
  }

  const body = (await req.json().catch(() => ({}))) as ReportBody;
  const reason = typeof body.reason === "string" ? body.reason : "";
  if (!VALID_REASONS.has(reason)) {
    return NextResponse.json(
      { error: "Please choose a report reason." },
      { status: 400 }
    );
  }

  const note = typeof body.note === "string" ? body.note.trim() : "";
  const created = await db.publicStoryReports.create({
    storyId: id,
    userId,
    reason,
    note: note ? note.slice(0, 500) : undefined,
  });
  if (created) {
    await db.publicStoryModerationEvents.create({
      storyId: id,
      actorUserId: userId,
      actorLabel: "reader",
      action: "reported",
      note: reason,
      metadata: { note: note || undefined },
    });
  }
  const openReportCount = await db.publicStoryReports.countOpenByStoryId(id);

  if (openReportCount >= AUTO_HIDE_REPORT_THRESHOLD) {
    const updated = await db.stories.update(id, {
      visibility: "private",
      publicReviewStatus: "pending_review",
      publicRejectionReason:
        "Auto-hidden after multiple public reports. Review before relisting.",
    });
    if (updated) {
      await db.publicStoryModerationEvents.create({
        storyId: id,
        actorLabel: "system",
        action: "auto_hidden",
        note: "Auto-hidden after multiple public reports.",
        metadata: { openReportCount },
      });
      await notifyPublicStoryOwner({
        story: updated,
        origin: req.nextUrl.origin,
        subject: `Your Storycot story is back in review - ${updated.title}`,
        headline: "Your story is back in review",
        body: "your public story has been hidden after multiple reader reports. Storycot will review it before it can be listed again.",
        actionPath: `/stories/${updated.id}`,
        actionLabel: "View story",
      });
    }
  }

  return NextResponse.json({
    reported: created,
    alreadyReported: !created,
    hiddenForReview: openReportCount >= AUTO_HIDE_REPORT_THRESHOLD,
  });
}
