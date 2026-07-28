import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { getAdminIdentity } from "@/lib/adminAuth";

type ReportsBody = {
  action?: unknown;
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

  const body = (await req.json().catch(() => ({}))) as ReportsBody;
  const action = body.action === "dismiss" ? "dismiss" : "reviewed";
  const closed = await db.publicStoryReports.closeForStory({
    storyId: id,
    status: action === "dismiss" ? "dismissed" : "reviewed",
    reviewedBy: admin.label,
  });
  await db.publicStoryModerationEvents.create({
    storyId: id,
    actorUserId: admin.userId,
    actorLabel: admin.label,
    action: action === "dismiss" ? "reports_dismissed" : "reports_reviewed",
    note:
      action === "dismiss"
        ? "Open reports dismissed."
        : "Open reports marked reviewed.",
    metadata: { closed },
  });

  return NextResponse.json({ closed });
}
