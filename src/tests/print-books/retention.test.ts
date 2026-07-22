import { describe, expect, it } from "vitest";
import {
  BOOK_FILE_RETENTION_DAYS,
  getBookFileRetentionAnchor,
  getBookFileRetentionState,
} from "@/lib/print-books/retention";
import type { BookProject } from "@/types/printBook";

function createBookProject(overrides: Partial<BookProject> = {}): BookProject {
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
    readyAt: "2026-01-10T00:00:00.000Z",
    ...overrides,
  };
}

describe("book file retention", () => {
  it("keeps files for 180 days from ready date by default", () => {
    const state = getBookFileRetentionState(
      createBookProject(),
      new Date("2026-01-20T00:00:00.000Z")
    );

    expect(state.retentionDays).toBe(BOOK_FILE_RETENTION_DAYS);
    expect(state.availableUntil).toBe("2026-07-09T00:00:00.000Z");
    expect(state.daysRemaining).toBe(170);
    expect(state.isExpired).toBe(false);
  });

  it("extends retention from the latest print order date", () => {
    const project = createBookProject({
      printOrder: {
        productKey: "hardcover",
        productLabel: "Hardcover",
        provider: "Lulu",
        format: "8.5 square hardcover",
        status: "paid",
        amountAud: 39.95,
        pageCount: 24,
        paidAt: "2026-03-01T00:00:00.000Z",
      },
    });

    expect(getBookFileRetentionAnchor(project)).toBe(
      "2026-03-01T00:00:00.000Z"
    );
    expect(getBookFileRetentionState(project).availableUntil).toBe(
      "2026-08-28T00:00:00.000Z"
    );
  });

  it("reports archived files independently of the calculated date", () => {
    const state = getBookFileRetentionState(
      createBookProject({
        assets: {
          proofVersion: 1,
          downloadableFilesArchivedAt: "2026-07-10T00:00:00.000Z",
          downloadableFilesArchiveReason: "retention",
        },
      }),
      new Date("2026-07-20T00:00:00.000Z")
    );

    expect(state.isArchived).toBe(true);
    expect(state.archivedAt).toBe("2026-07-10T00:00:00.000Z");
  });
});
