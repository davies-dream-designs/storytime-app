import { beforeEach, describe, expect, it } from "vitest";
import type { TradeTitle } from "@/types/tradeBook";
import { createMemoryDb } from "@/tests/helpers/memoryDb";

const memoryDb = createMemoryDb();

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

beforeEach(() => memoryDb._reset());

describe("trade titles repository", () => {
  it("creates, retrieves, and updates without changing immutable fields", async () => {
    const title = makeTitle();
    await memoryDb.tradeTitles.create(title);

    expect(await memoryDb.tradeTitles.getById(title.id)).toEqual(title);

    const updates = {
      id: "replacement-id",
      createdAt: "2026-01-01T00:00:00.000Z",
      status: "draft" as const,
      generationError: "Retry complete",
    };
    const updated = await memoryDb.tradeTitles.update(title.id, updates);

    expect(updated).toMatchObject({
      id: title.id,
      createdAt: title.createdAt,
      status: "draft",
      generationError: "Retry complete",
    });
    expect(updated?.updatedAt).not.toBe(title.updatedAt);
  });

  it("filters statuses and returns titles newest first", async () => {
    await memoryDb.tradeTitles.create(
      makeTitle({ id: "queued", updatedAt: "2026-09-16T00:00:00.000Z" })
    );
    await memoryDb.tradeTitles.create(
      makeTitle({
        id: "newest-draft",
        status: "draft",
        updatedAt: "2026-09-16T00:02:00.000Z",
      })
    );
    await memoryDb.tradeTitles.create(
      makeTitle({
        id: "older-draft",
        status: "draft",
        updatedAt: "2026-09-16T00:01:00.000Z",
      })
    );

    const titles = await memoryDb.tradeTitles.listByStatuses(["draft"]);

    expect(titles.map((title) => title.id)).toEqual([
      "newest-draft",
      "older-draft",
    ]);
  });

  it("returns no titles when no statuses are requested", async () => {
    await expect(memoryDb.tradeTitles.listByStatuses([])).resolves.toEqual([]);
  });
});
