import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { db } from "@/lib/db";
import { buildPremiumStoryGameJson } from "@/lib/story-game/generator";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { userId } = await auth();
  if (!userId)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const story = await db.stories.getById(id);
  if (!story || story.userId !== userId) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  if (story.status !== "ready" || story.pages.length === 0) {
    return NextResponse.json(
      { error: "Story is not ready for game generation" },
      { status: 409 }
    );
  }

  return NextResponse.json(await buildPremiumStoryGameJson(story), {
    headers: {
      "Cache-Control": "private, no-store",
    },
  });
}
