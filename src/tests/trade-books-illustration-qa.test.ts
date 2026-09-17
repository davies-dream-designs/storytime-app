import { beforeEach, describe, expect, it, vi } from "vitest";
import type { BookProject } from "@/types/printBook";

vi.mock("@/lib/db", async () => {
  const { createMemoryDb } = await vi.importActual<
    typeof import("@/tests/helpers/memoryDb")
  >("@/tests/helpers/memoryDb");
  return { db: createMemoryDb() };
});
import { db as mockedDb } from "@/lib/db";
const memoryDb = mockedDb as typeof mockedDb & { _reset(): void };

const mockRegenerateBookSpreadPageImage = vi.fn();
vi.mock("@/lib/print-books/jobs", () => ({
  regenerateBookSpreadPageImage: mockRegenerateBookSpreadPageImage,
}));

function configureTradeModels() {
  process.env.TRADE_BOOKS_OPENAI_BASE_URL = "https://cliproxy.test/v1";
  process.env.TRADE_BOOKS_OPENAI_API_KEY = "test-key";
  process.env.TRADE_BOOKS_TEXT_MODEL = "trade-text-model";
  process.env.TRADE_BOOKS_REVIEW_MODEL = "trade-review-model";
  process.env.TRADE_BOOKS_TRENDS_MODEL = "trade-trends-model";
  process.env.TRADE_BOOKS_IMAGE_MODEL = "trade-image-model";
  process.env.TRADE_BOOKS_IMAGE_FALLBACK_MODEL = "trade-image-fallback-model";
}

function makeProject(overrides: Partial<BookProject> = {}): BookProject {
  return {
    id: "project-1",
    userId: "trade-system",
    sourceStoryId: "story-1",
    profileId: "profile-1",
    ageBand: "preschool-story",
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
        id: "spread-good",
        bookProjectId: "project-1",
        sequence: 3,
        pageStart: 3,
        pageEnd: 3,
        layoutType: "hero",
        leftPageText: "",
        rightPageText: "",
        sceneBrief: "",
        illustrationPrompt: "",
        leftPageImageUrl: "https://blob.test/spread-good.png",
      },
      {
        id: "spread-bad",
        bookProjectId: "project-1",
        sequence: 5,
        pageStart: 5,
        pageEnd: 5,
        layoutType: "hero",
        leftPageText: "",
        rightPageText: "",
        sceneBrief: "",
        illustrationPrompt: "",
        leftPageImageUrl: "https://blob.test/spread-bad.png",
      },
    ],
    assets: { proofVersion: 0, imageProvider: "trade_cliproxy" },
    retryCount: 0,
    createdAt: "2026-09-17T00:00:00.000Z",
    updatedAt: "2026-09-17T00:00:00.000Z",
    ...overrides,
  };
}

function chatCompletionResponse(content: string) {
  return new Response(
    JSON.stringify({ choices: [{ message: { content } }] }),
    { status: 200 }
  );
}

beforeEach(() => {
  vi.resetModules();
  memoryDb._reset();
  configureTradeModels();
  mockRegenerateBookSpreadPageImage.mockReset();
});

describe("checkIllustrationQa", () => {
  it("parses a clean verdict from the review model", async () => {
    const { checkIllustrationQa } = await import(
      "@/lib/trade-books/illustrationQa"
    );
    const fetchImpl = vi.fn().mockResolvedValue(
      chatCompletionResponse(
        JSON.stringify({ defect: false, category: "none", description: "" })
      )
    );

    const result = await checkIllustrationQa({
      imageUrl: "https://blob.test/spread-good.png",
      fetchImpl,
    });

    expect(result).toEqual({ defect: false, category: "none", description: "" });
    expect(fetchImpl).toHaveBeenCalledWith(
      "https://cliproxy.test/v1/chat/completions",
      expect.objectContaining({ method: "POST" })
    );
    const [, init] = fetchImpl.mock.calls[0];
    const body = JSON.parse(init.body);
    expect(body.model).toBe("trade-review-model");
    expect(body.messages[0].content[1]).toEqual({
      type: "image_url",
      image_url: { url: "https://blob.test/spread-good.png" },
    });
  });

  it("parses a defect verdict and strips markdown fences", async () => {
    const { checkIllustrationQa } = await import(
      "@/lib/trade-books/illustrationQa"
    );
    const fetchImpl = vi.fn().mockResolvedValue(
      chatCompletionResponse(
        "```json\n" +
          JSON.stringify({
            defect: true,
            category: "obscured_face",
            description: "Turn the adult's face toward the viewer.",
          }) +
          "\n```"
      )
    );

    const result = await checkIllustrationQa({
      imageUrl: "https://blob.test/spread-bad.png",
      fetchImpl,
    });

    expect(result).toEqual({
      defect: true,
      category: "obscured_face",
      description: "Turn the adult's face toward the viewer.",
    });
  });

  it("throws when the provider responds with a non-2xx status", async () => {
    const { checkIllustrationQa } = await import(
      "@/lib/trade-books/illustrationQa"
    );
    const fetchImpl = vi
      .fn()
      .mockResolvedValue(new Response("boom", { status: 500 }));

    await expect(
      checkIllustrationQa({
        imageUrl: "https://blob.test/spread-bad.png",
        fetchImpl,
      })
    ).rejects.toThrow("status 500");
  });

  it("throws when the response content is not valid JSON", async () => {
    const { checkIllustrationQa } = await import(
      "@/lib/trade-books/illustrationQa"
    );
    const fetchImpl = vi
      .fn()
      .mockResolvedValue(chatCompletionResponse("not json at all"));

    await expect(
      checkIllustrationQa({
        imageUrl: "https://blob.test/spread-bad.png",
        fetchImpl,
      })
    ).rejects.toThrow();
  });
});

describe("runIllustrationAutoQa", () => {
  it("leaves clean spreads alone and records a passing verdict", async () => {
    await memoryDb.bookProjects.create(
      makeProject({
        spreads: [
          {
            id: "spread-good",
            bookProjectId: "project-1",
            sequence: 3,
            pageStart: 3,
            pageEnd: 3,
            layoutType: "hero",
            leftPageText: "",
            rightPageText: "",
            sceneBrief: "",
            illustrationPrompt: "",
            leftPageImageUrl: "https://blob.test/spread-good.png",
          },
        ],
      })
    );
    const fetchImpl = vi.fn().mockResolvedValue(
      chatCompletionResponse(
        JSON.stringify({ defect: false, category: "none", description: "" })
      )
    );

    const { runIllustrationAutoQa } = await import(
      "@/lib/trade-books/illustrationAutoQa"
    );
    const { flaggedSpreadIds } = await runIllustrationAutoQa("project-1", {
      fetchImpl,
    });

    expect(flaggedSpreadIds).toEqual([]);
    expect(mockRegenerateBookSpreadPageImage).not.toHaveBeenCalled();

    const project = await memoryDb.bookProjects.getById("project-1");
    const spread = project?.spreads.find((s) => s.id === "spread-good");
    expect(spread?.leftPageQa?.qa).toMatchObject({
      defect: false,
      autoRerollAttempts: 0,
      needsManualReview: false,
    });
  });

  it("auto-rerolls a defective spread using the QA description as the correction note, then clears the flag once fixed", async () => {
    await memoryDb.bookProjects.create(
      makeProject({
        spreads: [
          {
            id: "spread-bad",
            bookProjectId: "project-1",
            sequence: 5,
            pageStart: 5,
            pageEnd: 5,
            layoutType: "hero",
            leftPageText: "",
            rightPageText: "",
            sceneBrief: "",
            illustrationPrompt: "",
            leftPageImageUrl: "https://blob.test/spread-bad-v1.png",
          },
        ],
      })
    );

    let call = 0;
    const fetchImpl = vi.fn().mockImplementation(() => {
      call += 1;
      if (call === 1) {
        return Promise.resolve(
          chatCompletionResponse(
            JSON.stringify({
              defect: true,
              category: "anatomy",
              description: "Remove the extra arm.",
            })
          )
        );
      }
      return Promise.resolve(
        chatCompletionResponse(
          JSON.stringify({ defect: false, category: "none", description: "" })
        )
      );
    });

    mockRegenerateBookSpreadPageImage.mockImplementation(
      async ({ projectId, spreadId, correctionNote }) => {
        expect(correctionNote).toBe("Remove the extra arm.");
        const project = await memoryDb.bookProjects.getById(projectId);
        const nextSpreads = project!.spreads.map((s) =>
          s.id === spreadId
            ? { ...s, leftPageImageUrl: "https://blob.test/spread-bad-v2.png" }
            : s
        );
        return memoryDb.bookProjects.update(projectId, {
          spreads: nextSpreads,
        });
      }
    );

    const { runIllustrationAutoQa } = await import(
      "@/lib/trade-books/illustrationAutoQa"
    );
    const { flaggedSpreadIds } = await runIllustrationAutoQa("project-1", {
      fetchImpl,
    });

    expect(flaggedSpreadIds).toEqual([]);
    expect(mockRegenerateBookSpreadPageImage).toHaveBeenCalledTimes(1);
    expect(mockRegenerateBookSpreadPageImage).toHaveBeenCalledWith(
      expect.objectContaining({
        projectId: "project-1",
        userId: "trade-system",
        spreadId: "spread-bad",
        side: "left",
        correctionNote: "Remove the extra arm.",
      })
    );

    const project = await memoryDb.bookProjects.getById("project-1");
    const spread = project?.spreads.find((s) => s.id === "spread-bad");
    expect(spread?.leftPageImageUrl).toBe("https://blob.test/spread-bad-v2.png");
    expect(spread?.leftPageQa?.qa).toMatchObject({
      defect: false,
      autoRerollAttempts: 1,
      needsManualReview: false,
    });
  });

  it("stops after the max auto-reroll attempts and flags the spread for manual review", async () => {
    await memoryDb.bookProjects.create(
      makeProject({
        spreads: [
          {
            id: "spread-bad",
            bookProjectId: "project-1",
            sequence: 5,
            pageStart: 5,
            pageEnd: 5,
            layoutType: "hero",
            leftPageText: "",
            rightPageText: "",
            sceneBrief: "",
            illustrationPrompt: "",
            leftPageImageUrl: "https://blob.test/spread-bad.png",
          },
        ],
      })
    );

    // Each call must return a fresh Response — vi.fn().mockResolvedValue()
    // would freeze a single Response instance whose body can only be read
    // once, causing every call after the first to fail with a spurious
    // "body already used" error.
    const fetchImpl = vi.fn().mockImplementation(() =>
      Promise.resolve(
        chatCompletionResponse(
          JSON.stringify({
            defect: true,
            category: "anatomy",
            description: "Still has an extra arm.",
          })
        )
      )
    );
    mockRegenerateBookSpreadPageImage.mockImplementation(
      async ({ projectId }) => memoryDb.bookProjects.getById(projectId)
    );

    const { runIllustrationAutoQa } = await import(
      "@/lib/trade-books/illustrationAutoQa"
    );
    const { flaggedSpreadIds } = await runIllustrationAutoQa("project-1", {
      fetchImpl,
    });

    expect(flaggedSpreadIds).toEqual(["spread-bad"]);
    // MAX_AUTO_REROLLS = 2: QA runs 3 times total (initial + after each of 2
    // rerolls), but only rerolls twice.
    expect(fetchImpl).toHaveBeenCalledTimes(3);
    expect(mockRegenerateBookSpreadPageImage).toHaveBeenCalledTimes(2);

    const project = await memoryDb.bookProjects.getById("project-1");
    const spread = project?.spreads.find((s) => s.id === "spread-bad");
    expect(spread?.leftPageQa?.qa).toMatchObject({
      defect: true,
      category: "anatomy",
      autoRerollAttempts: 2,
      needsManualReview: true,
    });
  });

  it("flags a spread for manual review when the QA call itself fails, without throwing", async () => {
    await memoryDb.bookProjects.create(
      makeProject({
        spreads: [
          {
            id: "spread-bad",
            bookProjectId: "project-1",
            sequence: 5,
            pageStart: 5,
            pageEnd: 5,
            layoutType: "hero",
            leftPageText: "",
            rightPageText: "",
            sceneBrief: "",
            illustrationPrompt: "",
            leftPageImageUrl: "https://blob.test/spread-bad.png",
          },
        ],
      })
    );
    const fetchImpl = vi
      .fn()
      .mockResolvedValue(new Response("boom", { status: 500 }));

    const { runIllustrationAutoQa } = await import(
      "@/lib/trade-books/illustrationAutoQa"
    );
    const { flaggedSpreadIds } = await runIllustrationAutoQa("project-1", {
      fetchImpl,
    });

    expect(flaggedSpreadIds).toEqual(["spread-bad"]);
    expect(mockRegenerateBookSpreadPageImage).not.toHaveBeenCalled();

    const project = await memoryDb.bookProjects.getById("project-1");
    const spread = project?.spreads.find((s) => s.id === "spread-bad");
    expect(spread?.leftPageQa?.qa).toMatchObject({
      needsManualReview: true,
    });
  });

  it("skips spreads without a generated image", async () => {
    await memoryDb.bookProjects.create(
      makeProject({
        spreads: [
          {
            id: "spread-none",
            bookProjectId: "project-1",
            sequence: 1,
            pageStart: 1,
            pageEnd: 1,
            layoutType: "text_art",
            leftPageText: "",
            rightPageText: "",
            sceneBrief: "",
            illustrationPrompt: "",
          },
        ],
      })
    );
    const fetchImpl = vi.fn();

    const { runIllustrationAutoQa } = await import(
      "@/lib/trade-books/illustrationAutoQa"
    );
    const { flaggedSpreadIds } = await runIllustrationAutoQa("project-1", {
      fetchImpl,
    });

    expect(flaggedSpreadIds).toEqual([]);
    expect(fetchImpl).not.toHaveBeenCalled();
  });
});
