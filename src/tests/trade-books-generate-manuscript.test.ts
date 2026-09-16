import { beforeEach, describe, expect, it, vi } from "vitest";
import type { TradeTitle } from "@/types/tradeBook";
import { TRADE_SYSTEM_USER_ID } from "@/types/tradeBook";

vi.mock("@/lib/db", async () => {
  const { createMemoryDb } = await vi.importActual<
    typeof import("@/tests/helpers/memoryDb")
  >("@/tests/helpers/memoryDb");
  return { db: createMemoryDb() };
});

import { db as mockedDb } from "@/lib/db";
const memoryDb = mockedDb as typeof mockedDb & { _reset(): void };
import { generateTradeTitleManuscript } from "@/lib/trade-books/generateManuscript";
import { TradeBookJobPermanentError } from "@/lib/trade-books/worker";

const now = new Date("2026-09-16T01:00:00.000Z");

function configureTradeModels() {
  process.env.TRADE_BOOKS_OPENAI_BASE_URL = "https://cliproxy.test/v1";
  process.env.TRADE_BOOKS_OPENAI_API_KEY = "test-key";
  process.env.TRADE_BOOKS_TEXT_MODEL = "trade-text-model";
  process.env.TRADE_BOOKS_REVIEW_MODEL = "trade-review-model";
  process.env.TRADE_BOOKS_TRENDS_MODEL = "trade-trends-model";
  process.env.TRADE_BOOKS_IMAGE_MODEL = "trade-image-model";
  process.env.TRADE_BOOKS_IMAGE_FALLBACK_MODEL = "trade-image-fallback-model";
}

function makeTitle(overrides: Partial<TradeTitle> = {}): TradeTitle {
  return {
    id: "trade-title-1",
    status: "queued",
    seedBrief: {
      theme: "Helping neighbours",
      premise: "A child helps restore a community garden.",
      notes: "Warm and gentle.",
      storyPreset: "preschool-story",
      locale: "en",
      protagonist: { name: "Mia", age: 5, gender: "girl" },
    },
    createdAt: "2026-09-16T00:00:00.000Z",
    updatedAt: "2026-09-16T00:00:00.000Z",
    ...overrides,
  };
}

function modelResponse(story: unknown): Response {
  return new Response(
    JSON.stringify({
      choices: [{ message: { content: JSON.stringify(story) } }],
    }),
    { status: 200, headers: { "Content-Type": "application/json" } }
  );
}

beforeEach(() => {
  memoryDb._reset();
  configureTradeModels();
});

describe("trade manuscript generation", () => {
  it("persists an original private draft with a hidden synthetic profile and scrubs prose", async () => {
    const title = makeTitle({
      seedBrief: {
        ...makeTitle().seedBrief,
        premise: "A Toy Story feeling becomes a garden adventure.",
      },
    });
    await memoryDb.tradeTitles.create(title);
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(
      modelResponse({
        title: "Sonic's Garden Surprise",
        pages: [
          {
            pageNumber: 9,
            text: "Mia found Sonic seeds beneath a sunny stone.",
            illustrationPrompt:
              "A fully clothed child tending original Sonic garden creatures safely.",
          },
        ],
      })
    );

    const result = await generateTradeTitleManuscript(title.id, {
      fetchImpl,
      now,
    });
    const profile = await memoryDb.profiles.getById(result.profileId!);
    const story = await memoryDb.stories.getById(result.storyId!);

    expect(fetchImpl).toHaveBeenCalledWith(
      "https://cliproxy.test/v1/chat/completions",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({ Authorization: "Bearer test-key" }),
      })
    );
    expect(result).toMatchObject({
      status: "draft",
      profileId: "trade-profile:trade-title-1",
      storyId: "trade-story:trade-title-1",
      generationError: undefined,
      modelMetadata: {
        provider: "cliproxy-openai-compatible",
        textModel: "trade-text-model",
      },
    });
    expect(profile).toMatchObject({
      userId: TRADE_SYSTEM_USER_ID,
      name: "Mia",
      favouriteCharacters: [],
      favouriteActivities: [],
      favouriteAnimals: [],
      favouritePlaces: [],
      lessons: [],
    });
    expect(story).toMatchObject({
      userId: TRADE_SYSTEM_USER_ID,
      profileId: result.profileId,
      status: "ready",
      visibility: "private",
      publicReviewStatus: "not_submitted",
      storyPersonIds: [],
    });
    expect(story?.title).not.toContain("Sonic");
    expect(story?.pages[0]).toMatchObject({
      pageNumber: 1,
      text: expect.not.stringContaining("Sonic"),
      illustrationPrompt: expect.not.stringContaining("Sonic"),
    });
    expect(story?.premise).toContain("Safely reinterpreted broad idea");
  });

  it("rejects a blocked seed as a permanent error", async () => {
    const title = makeTitle({
      seedBrief: { ...makeTitle().seedBrief, notes: "Include a gun fight." },
    });
    await memoryDb.tradeTitles.create(title);
    const fetchImpl = vi.fn<typeof fetch>();

    await expect(
      generateTradeTitleManuscript(title.id, { fetchImpl, now })
    ).rejects.toBeInstanceOf(TradeBookJobPermanentError);

    expect(fetchImpl).not.toHaveBeenCalled();
    await expect(memoryDb.tradeTitles.getById(title.id)).resolves.toMatchObject(
      {
        status: "rejected",
        generationError: expect.stringContaining("weapons"),
        gateResults: {
          inputSafety: { ok: false, category: "violence_or_peril" },
        },
      }
    );
  });

  it("rejects protected generated IP as a permanent error", async () => {
    const title = makeTitle();
    await memoryDb.tradeTitles.create(title);
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(
      modelResponse({
        title: "Bluey's Garden Day",
        pages: [
          {
            pageNumber: 1,
            text: "Bluey helped Mia water the flowers.",
            illustrationPrompt: "Bluey and Mia in a safe garden.",
          },
        ],
      })
    );

    await expect(
      generateTradeTitleManuscript(title.id, { fetchImpl, now })
    ).rejects.toBeInstanceOf(TradeBookJobPermanentError);

    await expect(memoryDb.tradeTitles.getById(title.id)).resolves.toMatchObject(
      {
        status: "rejected",
        generationError:
          "Generated trade manuscript is restricted by IP policy",
        gateResults: {
          outputIp: { riskLevel: "restricted", printAllowed: false },
        },
      }
    );
    await expect(
      memoryDb.profiles.getById("trade-profile:trade-title-1")
    ).resolves.toBeUndefined();
    await expect(
      memoryDb.stories.getById("trade-story:trade-title-1")
    ).resolves.toBeUndefined();
  });

  it("leaves rate-limited requests generating so the queue can retry", async () => {
    const title = makeTitle();
    await memoryDb.tradeTitles.create(title);
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockResolvedValue(new Response("rate limited", { status: 429 }));

    await expect(
      generateTradeTitleManuscript(title.id, { fetchImpl, now })
    ).rejects.toThrow("status 429");
    const persisted = await memoryDb.tradeTitles.getById(title.id);
    expect(persisted).toMatchObject({ status: "generating" });
    expect(persisted?.generationError).toBeUndefined();
  });
});
