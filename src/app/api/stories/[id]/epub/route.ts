import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { db } from "@/lib/db";
import { buildStoryTextEpub } from "@/lib/print-books/epub";

function filenameFromTitle(title: string): string {
  const slug = title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);

  return `${slug || "storycot-story"}.epub`;
}

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

  const profile = await db.profiles.getById(story.profileId);
  const epub = await buildStoryTextEpub({
    story,
    profile: profile?.userId === userId ? profile : undefined,
  });

  return new NextResponse(new Uint8Array(epub), {
    headers: {
      "Content-Type": "application/epub+zip",
      "Content-Disposition": `attachment; filename="${filenameFromTitle(story.title)}"`,
      "Cache-Control": "private, no-store",
    },
  });
}
