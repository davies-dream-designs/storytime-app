import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { db } from "@/lib/db";
import {
  storyIdeaSafetyErrorResponse,
  validatePublicStorySafety,
} from "@/lib/storySafety";

const MAX_AUTHOR_NAME_LENGTH = 80;

function generateToken(): string {
  const chars =
    "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
  return Array.from(
    { length: 10 },
    () => chars[Math.floor(Math.random() * chars.length)]
  ).join("");
}

type PublicSubmissionBody = {
  authorName?: unknown;
  confirmations?: {
    rights?: unknown;
    privacy?: unknown;
    terms?: unknown;
  };
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
  if (!story || story.userId !== userId) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  if (story.status && story.status !== "ready") {
    return NextResponse.json(
      { error: "Only finished stories can be submitted for public review." },
      { status: 400 }
    );
  }

  const thumbnails = await db.bookProjects.getPublicThumbnailsByStoryIds([id]);
  if (!thumbnails[id]) {
    return NextResponse.json(
      {
        error:
          "Public gallery sharing is for illustrated stories. Create an illustrated book before submitting this story.",
      },
      { status: 400 }
    );
  }

  const body = (await req.json().catch(() => ({}))) as PublicSubmissionBody;
  const confirmations = body.confirmations ?? {};
  if (
    confirmations.rights !== true ||
    confirmations.privacy !== true ||
    confirmations.terms !== true
  ) {
    return NextResponse.json(
      { error: "Please confirm the public publishing checklist first." },
      { status: 400 }
    );
  }

  const authorName =
    typeof body.authorName === "string" ? body.authorName.trim() : "";
  if (!authorName || authorName.length > MAX_AUTHOR_NAME_LENGTH) {
    return NextResponse.json(
      { error: "Please add an author display name under 80 characters." },
      { status: 400 }
    );
  }

  const safety = validatePublicStorySafety(story);
  if (!safety.ok) {
    await db.publicStoryModerationEvents.create({
      storyId: id,
      actorUserId: userId,
      actorLabel: "owner",
      action: "pre_screen_blocked",
      note: safety.reason,
      metadata: { category: safety.category },
    });
    return NextResponse.json(storyIdeaSafetyErrorResponse(safety), {
      status: 400,
    });
  }

  const now = new Date().toISOString();
  const shareToken = story.shareToken ?? generateToken();
  const updated = await db.stories.update(id, {
    visibility: "public",
    publicReviewStatus: "pending_review",
    publicSubmittedAt: now,
    publicReviewedAt: undefined,
    publicReviewedBy: undefined,
    publicRejectionReason: undefined,
    publicAuthorName: authorName,
    publicTermsAcceptedAt: now,
    shareToken,
  });
  await db.publicStoryModerationEvents.create({
    storyId: id,
    actorUserId: userId,
    actorLabel: "owner",
    action: "submitted",
    note: "Submitted for public gallery review.",
    metadata: { authorName },
  });

  return NextResponse.json({ story: updated });
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const story = await db.stories.getById(id);
  if (!story || story.userId !== userId) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const updated = await db.stories.update(id, {
    visibility: story.shareToken ? "share_link" : "private",
    publicReviewStatus: "not_submitted",
    publicSubmittedAt: undefined,
    publicReviewedAt: undefined,
    publicReviewedBy: undefined,
    publicRejectionReason: undefined,
    publicAuthorName: undefined,
    publicTermsAcceptedAt: undefined,
  });
  await db.publicStoryModerationEvents.create({
    storyId: id,
    actorUserId: userId,
    actorLabel: "owner",
    action: "withdrawn",
    note: "Owner removed story from public review.",
  });

  return NextResponse.json({ story: updated });
}
