import { describe, expect, it } from "vitest";
import { getPublicStoryPrintReadiness } from "@/lib/publicStoryPrintReadiness";
import type { BookProject } from "@/types/printBook";

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
    spreads: [],
    assets: {
      proofVersion: 1,
      proofingPassed: true,
      orderabilityState: "order_ready",
      luluCoverPdfUrl: "https://blob.test/cover.pdf",
      luluPrintPdfUrl: "https://blob.test/interior.pdf",
    },
    retryCount: 0,
    createdAt: "2026-07-28T00:00:00.000Z",
    updatedAt: "2026-07-28T00:00:00.000Z",
    ...overrides,
  };
}

describe("getPublicStoryPrintReadiness", () => {
  it("marks a story print-ready when Lulu files and proofing are ready", () => {
    expect(getPublicStoryPrintReadiness([createProject()])).toMatchObject({
      bookProjectId: "book-1",
      ready: true,
      label: "Print-ready",
    });
  });

  it("marks export-ready Lulu books purchasable for public readers", () => {
    expect(
      getPublicStoryPrintReadiness([
        createProject({
          assets: {
            proofVersion: 1,
            proofingPassed: false,
            orderabilityState: "export_ready",
            luluCoverPdfUrl: "https://blob.test/cover.pdf",
            luluPrintPdfUrl: "https://blob.test/interior.pdf",
          },
        }),
      ])
    ).toMatchObject({
      ready: true,
      label: "Print-ready",
    });
  });

  it("blocks draft-only Lulu exports", () => {
    expect(
      getPublicStoryPrintReadiness([
        createProject({
          assets: {
            proofVersion: 1,
            proofingPassed: false,
            orderabilityState: "draft_only",
            luluCoverPdfUrl: "https://blob.test/cover.pdf",
            luluPrintPdfUrl: "https://blob.test/interior.pdf",
          },
        }),
      ])
    ).toMatchObject({
      ready: false,
      label: "Needs print check",
    });
  });

  it("returns no status when a public story has no book projects", () => {
    expect(getPublicStoryPrintReadiness([])).toBeUndefined();
  });
});
