import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getAdminIdentity } from "@/lib/adminAuth";
import { notifyPublicStoryOwner } from "@/lib/publicStoryNotifications";

type DelistBody = {
  reason?: unknown;
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
  const story = await db.stories.getById(id);
  if (!story) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const body = (await req.json().catch(() => ({}))) as DelistBody;
  const reason = typeof body.reason === "string" ? body.reason.trim() : "";
  if (!reason) {
    return NextResponse.json(
      { error: "Please add a delist reason." },
      { status: 400 }
    );
  }

  const updated = await db.stories.update(id, {
    visibility: "private",
    publicReviewStatus: "rejected",
    publicReviewedAt: new Date().toISOString(),
    publicReviewedBy: admin.label,
    publicRejectionReason: reason,
  });
  await db.publicStoryReports.closeForStory({
    storyId: id,
    status: "reviewed",
    reviewedBy: admin.label,
  });

  if (updated) {
    await db.publicStoryModerationEvents.create({
      storyId: id,
      actorUserId: admin.userId,
      actorLabel: admin.label,
      action: "delisted",
      note: reason,
    });
    await notifyPublicStoryOwner({
      story: updated,
      origin: req.nextUrl.origin,
      subject: `Your Storycot story was removed from the gallery - ${updated.title}`,
      headline: "Your story was removed from the gallery",
      body: `your public story has been removed from the gallery. Review note: ${reason}`,
      actionPath: `/stories/${updated.id}`,
      actionLabel: "Review story",
    });
  }

  return NextResponse.json({ story: updated });
}
