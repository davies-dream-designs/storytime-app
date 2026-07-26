import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Story } from "@/types";
import type { BookProject } from "@/types/printBook";
import { createMemoryDb } from "@/tests/helpers/memoryDb";

const memoryDb = createMemoryDb();

vi.mock("@/lib/db", () => ({ db: memoryDb }));

function createStory(): Story {
  return {
    id: "story-1",
    userId: "user-1",
    title: "The Silver Moon",
    profileId: "profile-1",
    profileName: "Mila",
    pages: [
      {
        pageNumber: 1,
        text: "Mila found a silver moon.",
        illustrationPrompt: "Mila in moonlight.",
      },
    ],
    wordCount: 6,
    theme: "bedtime",
    notes: "",
    createdAt: "2026-07-20T00:00:00.000Z",
    status: "ready",
    shareToken: "share-token",
  };
}

function createProject(overrides: Partial<BookProject> = {}): BookProject {
  return {
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
        id: "cover",
        bookProjectId: "book-1",
        sequence: 1,
        pageStart: 1,
        pageEnd: 2,
        layoutType: "front_matter",
        leftPageText: "",
        rightPageText: "",
        sceneBrief: "Cover",
        illustrationPrompt: "Cover",
      },
      {
        id: "spread-1",
        bookProjectId: "book-1",
        sequence: 2,
        pageStart: 3,
        pageEnd: 4,
        layoutType: "text_art",
        title: "A Moonlit Find",
        leftPageText: "Mila found a silver moon.",
        rightPageText: "It hummed softly.",
        sceneBrief: "Moonlit garden",
        illustrationPrompt: "Mila in moonlight.",
        leftPageWebImageUrl: "https://assets.example.com/spread.jpg",
      },
    ],
    assets: {
      proofVersion: 1,
      coverWebImageUrl: "https://assets.example.com/cover.jpg",
    },
    retryCount: 0,
    createdAt: "2026-07-20T00:00:00.000Z",
    updatedAt: "2026-07-20T00:01:00.000Z",
    readyAt: "2026-07-20T00:01:00.000Z",
    ...overrides,
  };
}

describe("shared story resolver", () => {
  beforeEach(() => {
    memoryDb._reset();
  });

  it("falls back to plain story pages when no ready book exists", async () => {
    await memoryDb.stories.create(createStory());

    const { getSharedStoryByToken } = await import("@/lib/sharedStory");
    const shared = await getSharedStoryByToken("share-token");

    expect(shared?.project).toBeUndefined();
    expect(shared?.coverImageUrl).toBeUndefined();
    expect(shared?.spreads).toEqual([
      {
        id: "story-page-1",
        sequence: 1,
        text: "Mila found a silver moon.",
      },
    ]);
    expect(shared?.narrationEnabled).toBe(false);
  });

  it("uses ready illustrated book art and gates narration on digital unlock", async () => {
    await memoryDb.stories.create(createStory());
    await memoryDb.bookProjects.create(
      createProject({
        assets: {
          proofVersion: 1,
          coverWebImageUrl: "https://assets.example.com/cover.jpg",
          digitalDownloadUnlockedAt: "2026-07-20T00:02:00.000Z",
        },
      })
    );

    const { getSharedStoryByToken } = await import("@/lib/sharedStory");
    const shared = await getSharedStoryByToken("share-token");

    expect(shared?.project?.id).toBe("book-1");
    expect(shared?.coverImageUrl).toBe("https://assets.example.com/cover.jpg");
    expect(shared?.spreads).toEqual([
      {
        id: "spread-1",
        sequence: 2,
        title: "A Moonlit Find",
        text: "Mila found a silver moon. It hummed softly.",
        imageUrl: "https://assets.example.com/spread.jpg",
      },
    ]);
    expect(shared?.narrationEnabled).toBe(true);
  });
});
