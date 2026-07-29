import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { db } from "@/lib/db";
import type { StoryPage } from "@/types";
import type { BookProject, BookSpread } from "@/types/printBook";

const MAX_TITLE_LENGTH = 140;
const MAX_THEME_LENGTH = 100;
const MAX_PAGE_TEXT_LENGTH = 2200;
const MAX_AUTHOR_NAME_LENGTH = 80;

type StoryUpdateBody = {
  title?: unknown;
  theme?: unknown;
  publicAuthorName?: unknown;
  pages?: unknown;
};

function countWords(pages: StoryPage[]): number {
  return pages.flatMap((page) => page.text.trim().split(/\s+/).filter(Boolean))
    .length;
}

function parseStoryUpdate(body: StoryUpdateBody):
  | {
      ok: true;
      title: string;
      theme: string;
      publicAuthorName?: string;
      pages: StoryPage[];
    }
  | { ok: false; error: string } {
  const title = typeof body.title === "string" ? body.title.trim() : "";
  if (!title || title.length > MAX_TITLE_LENGTH) {
    return { ok: false, error: "Please add a title under 140 characters." };
  }

  const theme = typeof body.theme === "string" ? body.theme.trim() : "";
  if (!theme || theme.length > MAX_THEME_LENGTH) {
    return { ok: false, error: "Please add a theme under 100 characters." };
  }

  const publicAuthorName =
    typeof body.publicAuthorName === "string"
      ? body.publicAuthorName.trim()
      : "";
  if (publicAuthorName.length > MAX_AUTHOR_NAME_LENGTH) {
    return {
      ok: false,
      error: "Please keep the author display name under 80 characters.",
    };
  }

  if (!Array.isArray(body.pages) || body.pages.length === 0) {
    return { ok: false, error: "A story needs at least one page." };
  }

  const pages = body.pages.map((page, index) => {
    const existing = page as Partial<StoryPage>;
    const text = typeof existing.text === "string" ? existing.text.trim() : "";
    return {
      pageNumber:
        typeof existing.pageNumber === "number"
          ? existing.pageNumber
          : index + 1,
      text,
      illustrationPrompt:
        typeof existing.illustrationPrompt === "string"
          ? existing.illustrationPrompt
          : "",
    };
  });

  if (pages.some((page) => !page.text)) {
    return { ok: false, error: "Every story page needs text." };
  }

  if (pages.some((page) => page.text.length > MAX_PAGE_TEXT_LENGTH)) {
    return {
      ok: false,
      error: "Please keep each story page under 2,200 characters.",
    };
  }

  return {
    ok: true,
    title,
    theme,
    publicAuthorName: publicAuthorName || undefined,
    pages: pages.map((page, index) => ({ ...page, pageNumber: index + 1 })),
  };
}

function editableBookSpreads(spreads: BookSpread[]) {
  return spreads
    .filter((spread) =>
      ["text_art", "hero", "quiet"].includes(spread.layoutType)
    )
    .sort((a, b) => a.sequence - b.sequence);
}

function updateBookTextFromStory(project: BookProject, pages: StoryPage[]) {
  const storySpreads = editableBookSpreads(project.spreads);
  if (storySpreads.length === 0) return project.spreads;

  const pagesBySpread = new Map<string, StoryPage[]>();
  pages.forEach((page, index) => {
    const spread = storySpreads[Math.min(index, storySpreads.length - 1)];
    pagesBySpread.set(spread.id, [
      ...(pagesBySpread.get(spread.id) ?? []),
      page,
    ]);
  });

  return project.spreads.map((spread) => {
    const mappedPages = pagesBySpread.get(spread.id);
    if (!mappedPages) return spread;
    const midpoint = Math.ceil(mappedPages.length / 2);
    return {
      ...spread,
      leftPageText: mappedPages
        .slice(0, midpoint)
        .map((page) => page.text)
        .join("\n\n"),
      rightPageText: mappedPages
        .slice(midpoint)
        .map((page) => page.text)
        .join("\n\n"),
    };
  });
}

function invalidateBookExports(project: BookProject, pages: StoryPage[]) {
  return {
    spreads: updateBookTextFromStory(project, pages),
    currentStageLabel: "Story text edited - exports need rebuilding",
    updatedAt: new Date().toISOString(),
    assets: {
      ...project.assets,
      previewPdfUrl: undefined,
      printPdfUrl: undefined,
      epubUrl: undefined,
      luluCoverPdfUrl: undefined,
      luluPrintPdfUrl: undefined,
      orderabilityState: "draft_only" as const,
      proofingPassed: false,
      proofingWarnings: [
        ...(project.assets.proofingWarnings ?? []),
        "Story text was edited after book export. Rebuild exports before print or public purchase.",
      ],
      finalizedAt: undefined,
      digitalDownloadUnlockedAt: undefined,
    },
  };
}

export async function GET(
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
  return NextResponse.json(story);
}

export async function PATCH(
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
      { error: "Only finished stories can be edited." },
      { status: 400 }
    );
  }

  const parsed = parseStoryUpdate(
    (await req.json().catch(() => ({}))) as StoryUpdateBody
  );
  if (!parsed.ok) {
    return NextResponse.json({ error: parsed.error }, { status: 400 });
  }

  const wasInPublicFlow =
    story.visibility === "public" ||
    story.visibility === "share_link" ||
    story.publicReviewStatus !== "not_submitted" ||
    Boolean(story.shareToken);
  const updated = await db.stories.update(id, {
    title: parsed.title,
    theme: parsed.theme,
    pages: parsed.pages,
    wordCount: countWords(parsed.pages),
    publicAuthorName: parsed.publicAuthorName,
    visibility: "private",
    publicReviewStatus: "not_submitted",
    publicSubmittedAt: undefined,
    publicReviewedAt: undefined,
    publicReviewedBy: undefined,
    publicRejectionReason: undefined,
    publicTermsAcceptedAt: undefined,
    shareToken: undefined,
  });

  const bookProjects = await db.bookProjects.getByStoryId(id);
  await Promise.all(
    bookProjects.map((project) =>
      db.bookProjects.update(
        project.id,
        invalidateBookExports(project, parsed.pages)
      )
    )
  );

  if (wasInPublicFlow) {
    await db.publicStoryModerationEvents.create({
      storyId: id,
      actorUserId: userId,
      actorLabel: "owner",
      action: "edited",
      note: "Owner edited story text; public/share state reset for review.",
    });
  }

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

  await db.stories.delete(id);
  return NextResponse.json({ success: true });
}
