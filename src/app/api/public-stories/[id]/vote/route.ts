import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { db } from "@/lib/db";
import { notifyPublicStoryOwner } from "@/lib/publicStoryNotifications";

export async function POST(
  req: Request,
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
    story.publicReviewStatus !== "approved" ||
    (story.status && story.status !== "ready")
  ) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  if (story.userId === userId) {
    return NextResponse.json(
      { error: "Votes from the story creator are not counted." },
      { status: 400 }
    );
  }

  const created = await db.publicStoryVotes.create(id, userId);
  const counts = await db.publicStoryVotes.countByStoryIds([id]);
  const votes = counts[id] ?? 0;

  if (created && (votes === 1 || votes % 10 === 0)) {
    const origin = new URL(req.url).origin;
    await notifyPublicStoryOwner({
      story,
      origin,
      subject: `${votes} vote${votes === 1 ? "" : "s"} for your Storycot story`,
      headline:
        votes === 1
          ? "Your story has its first vote"
          : `${votes} votes this month`,
      body:
        votes === 1
          ? "your public story just received its first monthly vote."
          : `your public story has reached ${votes} votes this month.`,
      actionPath: story.shareToken ? `/s/${story.shareToken}` : "/public",
      actionLabel: "View public story",
    });
  }

  return NextResponse.json({
    voted: created,
    alreadyVoted: !created,
    votes,
  });
}
