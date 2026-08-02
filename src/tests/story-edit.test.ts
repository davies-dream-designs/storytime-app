import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const { mockAuth, mockDb } = vi.hoisted(() => ({
  mockAuth: vi.fn(async () => ({ userId: "user-1" })),
  mockDb: {
    stories: {
      getById: vi.fn(),
      update: vi.fn(),
    },
    bookProjects: {
      getByStoryId: vi.fn(),
      update: vi.fn(),
    },
    publicStoryModerationEvents: {
      create: vi.fn(),
    },
  },
}));

vi.mock("@clerk/nextjs/server", () => ({
  auth: mockAuth,
}));

vi.mock("@/lib/db", () => ({
  db: mockDb,
}));

const readyPublicStory = {
  id: "story-1",
  userId: "user-1",
  title: "Bailey at Big School",
  profileId: "profile-1",
  profileName: "Bailey",
  pages: [
    {
      pageNumber: 1,
      text: "Bailey went to Big School.",
      illustrationPrompt: "Bailey at school.",
    },
  ],
  wordCount: 6,
  theme: "school adventure",
  notes: "",
  createdAt: "2026-07-20T00:00:00.000Z",
  status: "ready",
  visibility: "public",
  publicReviewStatus: "approved",
  publicAuthorName: "Jake D",
  shareToken: "share-token",
};

const readyBook = {
  id: "book-1",
  userId: "user-1",
  sourceStoryId: "story-1",
  profileId: "profile-1",
  ageBand: "3-5",
  status: "ready",
  trimSize: "storycot-dynamic-square",
  pageCount: 24,
  spreadCount: 12,
  completedSpreads: 12,
  totalSpreads: 12,
  currentStageLabel: "Ready",
  beats: [],
  spreads: [
    {
      id: "spread-1",
      bookProjectId: "book-1",
      sequence: 1,
      pageStart: 1,
      pageEnd: 2,
      layoutType: "text_art",
      leftPageText: "Bailey went to Big School.",
      rightPageText: "",
      sceneBrief: "School",
      illustrationPrompt: "Bailey at school.",
      leftPageWebImageUrl: "https://example.com/spread.jpg",
    },
  ],
  assets: {
    proofVersion: 1,
    coverWebImageUrl: "https://example.com/cover.jpg",
    printPdfUrl: "https://example.com/print.pdf",
    epubUrl: "https://example.com/book.epub",
    luluPrintPdfUrl: "https://example.com/lulu-print.pdf",
    orderabilityState: "order_ready",
    proofingPassed: true,
  },
  retryCount: 0,
  createdAt: "2026-07-20T00:00:00.000Z",
  updatedAt: "2026-07-20T00:01:00.000Z",
  readyAt: "2026-07-20T00:01:00.000Z",
};

describe("PATCH /api/stories/[id]", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    mockAuth.mockResolvedValue({ userId: "user-1" });
    mockDb.stories.getById.mockResolvedValue(readyPublicStory);
    mockDb.stories.update.mockImplementation(async (_id, updates) => ({
      ...readyPublicStory,
      ...updates,
    }));
    mockDb.bookProjects.getByStoryId.mockResolvedValue([readyBook]);
    mockDb.bookProjects.update.mockResolvedValue(undefined);
    mockDb.publicStoryModerationEvents.create.mockResolvedValue(undefined);
  });

  it("edits story text and resets public/share state", async () => {
    const { PATCH } = await import("@/app/api/stories/[id]/route");
    const res = await PATCH(
      new NextRequest("http://localhost/api/stories/story-1", {
        method: "PATCH",
        body: JSON.stringify({
          title: "Bailey's Gentle Adventure",
          theme: "gentle adventure",
          publicAuthorName: "Jake D",
          pages: [
            {
              pageNumber: 1,
              text: "Bailey went on a gentle adventure.",
              illustrationPrompt: "Bailey at school.",
            },
          ],
        }),
      }),
      { params: Promise.resolve({ id: "story-1" }) }
    );

    expect(res.status).toBe(200);
    expect(mockDb.stories.update).toHaveBeenCalledWith(
      "story-1",
      expect.objectContaining({
        title: "Bailey's Gentle Adventure",
        theme: "gentle adventure",
        wordCount: 6,
        visibility: "private",
        publicReviewStatus: "not_submitted",
        shareToken: undefined,
      })
    );
    expect(mockDb.bookProjects.update).toHaveBeenCalledWith(
      "book-1",
      expect.objectContaining({
        currentStageLabel: "Story text edited - exports need rebuilding",
        spreads: [
          expect.objectContaining({
            leftPageText: "Bailey went on a gentle adventure.",
          }),
        ],
        assets: expect.objectContaining({
          printPdfUrl: undefined,
          epubUrl: undefined,
          luluPrintPdfUrl: undefined,
          orderabilityState: "draft_only",
          proofingPassed: false,
        }),
      })
    );
    expect(mockDb.publicStoryModerationEvents.create).toHaveBeenCalledWith(
      expect.objectContaining({
        storyId: "story-1",
        actorUserId: "user-1",
        actorLabel: "owner",
        action: "edited",
      })
    );
  });

  it("rejects empty page text", async () => {
    const { PATCH } = await import("@/app/api/stories/[id]/route");
    const res = await PATCH(
      new NextRequest("http://localhost/api/stories/story-1", {
        method: "PATCH",
        body: JSON.stringify({
          title: "Bailey",
          theme: "gentle adventure",
          pages: [{ pageNumber: 1, text: "", illustrationPrompt: "" }],
        }),
      }),
      { params: Promise.resolve({ id: "story-1" }) }
    );

    expect(res.status).toBe(400);
    expect(mockDb.stories.update).not.toHaveBeenCalled();
    expect(mockDb.bookProjects.update).not.toHaveBeenCalled();
  });
});
