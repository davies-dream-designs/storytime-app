import { describe, expect, it } from "vitest";
import {
  getArtworkPreviews,
  getArtworkRiskFlags,
  getFailedImageTargets,
  getRepairImageTargets,
  getSpreadPreviews,
} from "@/lib/print-books/review";
import type { BookProject } from "@/types/printBook";

function createProject(): BookProject {
  return {
    id: "book-1",
    userId: "user-1",
    sourceStoryId: "story-1",
    profileId: "profile-1",
    ageBand: "3-5",
    status: "ready",
    trimSize: "storycot-dynamic-square",
    pageCount: 24,
    spreadCount: 2,
    completedSpreads: 2,
    totalSpreads: 2,
    currentStageLabel: "Ready",
    beats: [],
    spreads: [
      {
        id: "spread-1",
        bookProjectId: "book-1",
        sequence: 3,
        pageStart: 3,
        pageEnd: 4,
        layoutType: "text_art",
        title: "Garden",
        leftPageText: "Mila tiptoed into the garden.",
        rightPageText: "Glenpa waved from the lantern bench.",
        sceneBrief: "Garden reunion",
        illustrationPrompt: "Mila and Glenpa in the garden",
        leftPageImageUrl: "https://assets.example.com/left.png",
        leftPageWebImageUrl: "https://assets.example.com/left-web.jpg",
        rightPageImageUrl: "https://assets.example.com/right.png",
        rightPageImageError: "right-side drift",
        rightPageQa: {
          provider: "openai",
          generatedAt: "2026-08-17T00:00:00.000Z",
          referenceSnapshotKey: "profile|profile-1|snapshot",
          characterReferenceIds: ["profile:profile-1"],
          characterReferenceNames: ["Mila"],
          continuityReferenceIds: [],
          continuityReferenceLabels: [],
          staleCharacterReferenceNames: ["Mila"],
          correctionNote: "Keep Glenpa on the right page.",
          pageTextOmitted: true,
        },
      },
      {
        id: "spread-2",
        bookProjectId: "book-1",
        sequence: 4,
        pageStart: 5,
        pageEnd: 6,
        layoutType: "hero",
        title: "Placeholder",
        leftPageText: "Mila paused.",
        rightPageText: "",
        sceneBrief: "Placeholder scene",
        illustrationPrompt: "Placeholder scene",
        leftPageImageUrl: "data:image/svg+xml;base64,placeholder",
      },
    ],
    assets: { proofVersion: 1 },
    retryCount: 0,
    createdAt: "2026-08-17T00:00:00.000Z",
    updatedAt: "2026-08-17T00:00:00.000Z",
  };
}

describe("print-book review helpers", () => {
  it("preserves right-page review fields and surfaces right-side previews", () => {
    const previews = getSpreadPreviews(createProject());

    expect(previews[0]).toMatchObject({
      leftPageImageUrl: "https://assets.example.com/left.png",
      rightPageImageUrl: "https://assets.example.com/right.png",
      rightPageImageError: "right-side drift",
      rightPageQa: {
        correctionNote: "Keep Glenpa on the right page.",
      },
    });

    const artwork = getArtworkPreviews(previews);
    expect(artwork.map((entry) => `${entry.preview.id}:${entry.side}`)).toEqual([
      "spread-1:left",
      "spread-1:right",
      "spread-2:left",
    ]);
  });

  it("includes right-side failures and placeholder art in retry targets", () => {
    const previews = getSpreadPreviews(createProject());

    expect(getFailedImageTargets(previews)).toEqual([
      {
        spreadId: "spread-1",
        sequence: 3,
        title: "Garden",
        side: "right",
        url: "https://assets.example.com/right.png",
      },
    ]);

    expect(getRepairImageTargets(previews)).toEqual([
      {
        spreadId: "spread-1",
        sequence: 3,
        title: "Garden",
        side: "right",
        url: "https://assets.example.com/right.png",
      },
      {
        spreadId: "spread-2",
        sequence: 4,
        title: "Placeholder",
        side: "left",
        url: "data:image/svg+xml;base64,placeholder",
      },
    ]);
  });

  it("reports continuity risk badges from QA metadata", () => {
    const preview = getSpreadPreviews(createProject())[0]!;

    expect(getArtworkRiskFlags(preview, "right")).toEqual([
      "Generation failed",
      "No continuity references used",
      "Stale refs: Mila",
      "Fallback used",
      "Manual correction redo",
    ]);
  });
});
