import { describe, expect, it } from "vitest";
import type { BookProject } from "@/types/printBook";
import {
  getBookReadinessState,
  getEffectiveBookProjectStatus,
} from "@/lib/print-books/readiness";

function createProject(overrides: Partial<BookProject> = {}): BookProject {
  return {
    id: "book-1",
    userId: "user-1",
    sourceStoryId: "story-1",
    profileId: "profile-1",
    ageBand: "3-5",
    status: "ready",
    trimSize: "storycot-dynamic-square",
    pageCount: 32,
    spreadCount: 16,
    completedSpreads: 16,
    totalSpreads: 16,
    currentStageLabel: "Your print-book draft is ready for review.",
    beats: [],
    spreads: [
      {
        id: "spread-1",
        bookProjectId: "book-1",
        sequence: 2,
        pageStart: 3,
        pageEnd: 4,
        layoutType: "text_art",
        title: "Page 1",
        leftPageText: "Once upon a time.",
        rightPageText: "",
        sceneBrief: "A sunny garden.",
        illustrationPrompt: "A sunny garden.",
        leftPageImageUrl: "https://example.com/spread.png",
      },
    ],
    assets: {
      proofVersion: 1,
      exportVersion: 1,
      orderabilityState: "export_ready",
      coverPdfUrl: "https://example.com/cover.pdf",
      printPdfUrl: "https://example.com/print.pdf",
      proofingPassed: true,
      proofingWarnings: [],
      proofingErrors: [],
    },
    retryCount: 0,
    createdAt: "2026-07-15T00:00:00.000Z",
    updatedAt: "2026-07-15T00:00:00.000Z",
    ...overrides,
  };
}

describe("getBookReadinessState", () => {
  it("returns export_ready when proofing still blocks ordering", () => {
    expect(
      getBookReadinessState(
        createProject({
          assets: {
            ...createProject().assets,
            orderabilityState: "export_ready",
            proofingErrors: ["Separate cover PDF is missing."],
          },
        })
      )
    ).toBe("export_ready");
  });

  it("returns draft_ready when exports are not downloadable", () => {
    expect(
      getBookReadinessState(
        createProject({
          assets: {
            ...createProject().assets,
            coverPdfUrl: "data:application/pdf;base64,cover",
            printPdfUrl: "data:application/pdf;base64,print",
          },
        })
      )
    ).toBe("draft_ready");
  });

  it("returns order_ready only when proofing is clear and exports are downloadable", () => {
    expect(
      getBookReadinessState(
        createProject({
          assets: {
            ...createProject().assets,
            orderabilityState: "order_ready",
          },
        })
      )
    ).toBe("order_ready");
  });

  it("returns export_ready for normal downloadable drafts", () => {
    expect(getBookReadinessState(createProject())).toBe("export_ready");
  });

  it("treats image-failed books as ready after all generated images exist", () => {
    const project = createProject({
      status: "failed",
      errorCode: "illustrating:image_failed",
      spreads: createProject().spreads.map((spread) => ({
        ...spread,
        leftPageImageError: "Previous transient image error",
      })),
    });

    expect(getEffectiveBookProjectStatus(project)).toBe("ready");
    expect(getBookReadinessState(project)).toBe("export_ready");
  });

  it("keeps image-failed books failed while generated images are missing", () => {
    const project = createProject({
      status: "failed",
      errorCode: "illustrating:image_failed",
      spreads: createProject().spreads.map((spread) => ({
        ...spread,
        leftPageImageUrl: undefined,
        leftPageImageError: "Image generation failed",
      })),
    });

    expect(getEffectiveBookProjectStatus(project)).toBe("failed");
    expect(getBookReadinessState(project)).toBe("failed");
  });
});
