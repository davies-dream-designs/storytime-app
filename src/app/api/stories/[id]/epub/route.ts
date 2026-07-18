import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { db } from "@/lib/db";
import { buildStoryTextEpub } from "@/lib/print-books/epub";
import { toEpubFilename } from "@/lib/print-books/filename";

function isGeneratedCoverUrl(url?: string): url is string {
  if (!url) return false;
  const lower = url.toLowerCase();
  return !lower.includes(".svg") && !lower.startsWith("data:image/svg");
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
  const books = await db.bookProjects.getByStoryId(story.id);
  const coverImageUrl = books
    .filter((book) => book.userId === userId)
    .sort(
      (a, b) =>
        new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
    )
    .find((book) => isGeneratedCoverUrl(book.assets.coverImageUrl))
    ?.assets.coverImageUrl;
  const epub = await buildStoryTextEpub({
    story,
    profile: profile?.userId === userId ? profile : undefined,
    coverImageUrl,
  });

  return new NextResponse(new Uint8Array(epub), {
    headers: {
      "Content-Type": "application/epub+zip",
      "Content-Disposition": `attachment; filename="${toEpubFilename(story.title)}"`,
      "Cache-Control": "private, no-store",
    },
  });
}
