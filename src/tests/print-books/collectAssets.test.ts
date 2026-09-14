import { describe, expect, it } from "vitest";
import { collectBookAssetUrls } from "@/lib/print-books/storage";
import type { BookProject } from "@/types/printBook";

const BLOB = "https://acct.blob.vercel-storage.com";

function project(overrides: Partial<BookProject> = {}): BookProject {
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
    spreads: [],
    assets: { proofVersion: 1 },
    retryCount: 0,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}

describe("collectBookAssetUrls — includes web image variants for cleanup", () => {
  it("collects coverWebImageUrl and leftPageWebImageUrl", () => {
    const urls = collectBookAssetUrls(
      project({
        assets: {
          proofVersion: 1,
          coverImageUrl: `${BLOB}/cover.png`,
          coverWebImageUrl: `${BLOB}/cover-web.jpg`,
        },
        spreads: [
          {
            id: "s1",
            bookProjectId: "book-1",
            sequence: 1,
            pageStart: 1,
            pageEnd: 2,
            layoutType: "text_art",
            leftPageText: "",
            rightPageText: "",
            sceneBrief: "",
            illustrationPrompt: "",
            leftPageImageUrl: `${BLOB}/left.png`,
            leftPageWebImageUrl: `${BLOB}/left-web.jpg`,
          },
        ],
      })
    );

    expect(urls).toContain(`${BLOB}/cover-web.jpg`);
    expect(urls).toContain(`${BLOB}/left-web.jpg`);
    expect(urls).toContain(`${BLOB}/cover.png`);
    expect(urls).toContain(`${BLOB}/left.png`);
  });
});
