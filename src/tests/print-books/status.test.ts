import { describe, expect, it } from "vitest";
import {
  getBookProjectDisplayStageLabel,
  getBookProjectProgress,
  getBookProjectStageLabel,
} from "@/lib/print-books/status";
import type { BookProject } from "@/types/printBook";

function project(overrides: Partial<BookProject>): BookProject {
  return {
    id: "book_1",
    userId: "user_1",
    sourceStoryId: "story_1",
    profileId: "profile_1",
    ageBand: "3-5",
    status: "queued",
    trimSize: "8.5x8.5",
    pageCount: 32,
    spreadCount: 14,
    completedSpreads: 0,
    totalSpreads: 0,
    currentStageLabel: "Dreaming up the adventure...",
    beats: [],
    spreads: [],
    assets: {
      proofVersion: 1,
    },
    retryCount: 0,
    createdAt: "2026-07-17T00:00:00.000Z",
    updatedAt: "2026-07-17T00:00:00.000Z",
    ...overrides,
  };
}

describe("getBookProjectStageLabel", () => {
  it("returns magical labels for planning states", () => {
    expect(getBookProjectStageLabel("queued")).toBe(
      "Dreaming up the adventure..."
    );
    expect(getBookProjectStageLabel("illustrating")).toBe(
      "Painting moonlit pages..."
    );
    expect(getBookProjectStageLabel("ready")).toBe(
      "Your illustrated book is ready to order."
    );
  });
});

describe("getBookProjectProgress", () => {
  it("shows staged progress before spread art has completed", () => {
    expect(
      getBookProjectProgress(
        project({
          status: "illustrating",
          currentStageLabel: "Waiting for final art batch (in_progress)...",
          totalSpreads: 14,
          assets: {
            proofVersion: 1,
            artGenerationCursor: 0,
            artGenerationTotal: 14,
            openAIImageBatch: {
              batchId: "batch_1",
              inputFileId: "file_1",
              status: "in_progress",
              model: "gpt-image-1",
              requestCount: 14,
              submittedAt: "2026-07-17T00:00:00.000Z",
            },
          },
        })
      )
    ).toBe(58);
  });

  it("keeps final art batch progress stable when polling omits provider details", () => {
    expect(
      getBookProjectProgress(
        project({
          status: "illustrating",
          currentStageLabel: "Waiting for final art batch...",
          totalSpreads: 14,
          assets: {
            proofVersion: 1,
            artGenerationCursor: 0,
            artGenerationTotal: 14,
          },
        })
      )
    ).toBe(58);
  });

  it("reports ready projects as complete", () => {
    expect(getBookProjectProgress(project({ status: "ready" }))).toBe(100);
  });
});

describe("getBookProjectDisplayStageLabel", () => {
  it("hides raw provider batch states from the user-facing label", () => {
    expect(
      getBookProjectDisplayStageLabel(
        project({
          status: "illustrating",
          currentStageLabel: "Waiting for final art batch (in_progress)...",
        })
      )
    ).toBe("Waiting for final art batch...");
  });
});
