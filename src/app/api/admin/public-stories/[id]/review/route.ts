import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getAdminIdentity } from "@/lib/adminAuth";
import { notifyPublicStoryOwner } from "@/lib/publicStoryNotifications";

type ReviewBody = {
  decision?: unknown;
  rejectionReason?: unknown;
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
  if (story.publicReviewStatus !== "pending_review") {
    return NextResponse.json(
      { error: "This story is not waiting for review." },
      { status: 400 }
    );
  }

  const body = (await req.json().catch(() => ({}))) as ReviewBody;
  const now = new Date().toISOString();

  if (body.decision === "approved") {
    const updated = await db.stories.update(id, {
      visibility: "public",
      publicReviewStatus: "approved",
      publicReviewedAt: now,
      publicReviewedBy: admin.label,
      publicRejectionReason: undefined,
    });
    if (updated) {
      await db.publicStoryModerationEvents.create({
        storyId: id,
        actorUserId: admin.userId,
        actorLabel: admin.label,
        action: "approved",
        note: "Approved for public gallery.",
      });
      await notifyPublicStoryOwner({
        story: updated,
        origin: req.nextUrl.origin,
        subject: `Your Storycot story is now public - ${updated.title}`,
        headline: "Your story is public",
        body: "your story has been approved and can now appear in the public gallery.",
        actionPath: updated.shareToken ? `/s/${updated.shareToken}` : "/public",
        actionLabel: "View public story",
      });
    }
    return NextResponse.json({ story: updated });
  }

  if (body.decision === "rejected") {
    const rejectionReason =
      typeof body.rejectionReason === "string"
        ? body.rejectionReason.trim()
        : "";
    if (!rejectionReason) {
      return NextResponse.json(
        { error: "Please add a rejection reason." },
        { status: 400 }
      );
    }
    const updated = await db.stories.update(id, {
      visibility: "private",
      publicReviewStatus: "rejected",
      publicReviewedAt: now,
      publicReviewedBy: admin.label,
      publicRejectionReason: rejectionReason,
    });
    if (updated) {
      await db.publicStoryModerationEvents.create({
        storyId: id,
        actorUserId: admin.userId,
        actorLabel: admin.label,
        action: "rejected",
        note: rejectionReason,
      });
      await notifyPublicStoryOwner({
        story: updated,
        origin: req.nextUrl.origin,
        subject: `Storycot public review update - ${updated.title}`,
        headline: "Your story needs changes",
        body: `your story was not approved for the public gallery yet. Review note: ${rejectionReason}`,
        actionPath: `/stories/${updated.id}`,
        actionLabel: "Review story",
      });
    }
    return NextResponse.json({ story: updated });
  }

  return NextResponse.json(
    { error: "Invalid review decision." },
    { status: 400 }
  );
}
