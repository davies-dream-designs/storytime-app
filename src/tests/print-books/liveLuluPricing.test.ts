import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/db", async () => {
  const { createMemoryDb } = await vi.importActual<
    typeof import("@/tests/helpers/memoryDb")
  >("@/tests/helpers/memoryDb");
  return { db: createMemoryDb() };
});
import { db as mockedDb } from "@/lib/db";
import { resetLuluTokenCacheForTests } from "@/lib/print-books/lulu";
import {
  getLiveManufacturingCostAud,
  LuluPricingUnavailableError,
  refreshLuluPriceCache,
} from "@/lib/print-books/liveLuluPricing";

const memoryDb = mockedDb as typeof mockedDb & { _reset(): void };
const previousEnv = process.env;

function luluCostResponse(costExclTax: string) {
  return {
    currency: "AUD",
    line_item_costs: [
      {
        total_cost_excl_tax: costExclTax,
        total_cost_incl_tax: (Number(costExclTax) * 1.1).toFixed(2),
      },
    ],
    shipping_cost: { total_cost_excl_tax: "11.89", total_cost_incl_tax: "13.08" },
  };
}

function mockLuluAuthAndFetch(responses: unknown[]) {
  const fetchMock = vi.fn();
  // First call is always the OAuth token exchange.
  fetchMock.mockResolvedValueOnce(
    new Response(
      JSON.stringify({ access_token: "test-token", expires_in: 300 }),
      { status: 200 }
    )
  );
  for (const body of responses) {
    fetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify(body), { status: 201 })
    );
  }
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

beforeEach(() => {
  memoryDb._reset();
  process.env = {
    ...previousEnv,
    LULU_CLIENT_KEY: "client",
    LULU_CLIENT_SECRET: "secret",
  };
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  resetLuluTokenCacheForTests();
  process.env = { ...previousEnv };
});

describe("refreshLuluPriceCache", () => {
  it("samples two page counts from Lulu's real floor and writes the cache", async () => {
    mockLuluAuthAndFetch([
      luluCostResponse("24.64"), // hardcover @ 24pp (Lulu's own floor)
      luluCostResponse("27.26"), // hardcover @ 40pp
    ]);

    const model = await refreshLuluPriceCache("hardcover");

    expect(model.sampleLowPageCount).toBe(24);
    expect(model.sampleHighPageCount).toBe(40);
    expect(model.sampleLowCostAudCents).toBe(2464);
    expect(model.sampleHighCostAudCents).toBe(2726);

    const cached = await memoryDb.luluPriceCache.getByProductKey("hardcover");
    expect(cached?.sampleLowCostAudCents).toBe(2464);
  });

  it("rejects a non-AUD quote rather than silently caching it", async () => {
    mockLuluAuthAndFetch([
      { ...luluCostResponse("24.64"), currency: "USD" },
      luluCostResponse("27.26"),
    ]);

    await expect(refreshLuluPriceCache("hardcover")).rejects.toThrow(/AUD/);
  });
});

describe("getLiveManufacturingCostAud", () => {
  it("reads from a fresh cache without calling Lulu again", async () => {
    await memoryDb.luluPriceCache.upsert({
      productKey: "hardcover",
      sampleLowPageCount: 24,
      sampleLowCostAudCents: 2464,
      sampleHighPageCount: 40,
      sampleHighCostAudCents: 2726,
    });
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const cost = await getLiveManufacturingCostAud("hardcover", 24);

    expect(cost).toBe(24.64);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("linearly interpolates between the two cached sample points", async () => {
    await memoryDb.luluPriceCache.upsert({
      productKey: "hardcover",
      sampleLowPageCount: 24,
      sampleLowCostAudCents: 2464,
      sampleHighPageCount: 40,
      sampleHighCostAudCents: 2726,
    });
    vi.stubGlobal("fetch", vi.fn());

    // Midpoint page count -> midpoint cost.
    const cost = await getLiveManufacturingCostAud("hardcover", 32);
    expect(cost).toBeCloseTo((24.64 + 27.26) / 2, 2);
  });

  it("falls back to a live quote when the cache is stale", async () => {
    await memoryDb.luluPriceCache.upsert({
      productKey: "hardcover",
      sampleLowPageCount: 24,
      sampleLowCostAudCents: 1000, // deliberately stale/wrong value
      sampleHighPageCount: 40,
      sampleHighCostAudCents: 1500,
    });
    // Force staleness by rewriting quotedAt directly into the fake row.
    const staleRow = await memoryDb.luluPriceCache.getByProductKey(
      "hardcover"
    );
    if (staleRow) {
      staleRow.quotedAt = new Date(
        Date.now() - 13 * 60 * 60 * 1000
      ).toISOString();
    }

    mockLuluAuthAndFetch([
      luluCostResponse("24.64"),
      luluCostResponse("27.26"),
    ]);

    const cost = await getLiveManufacturingCostAud("hardcover", 24);
    expect(cost).toBe(24.64);
  });

  it("throws LuluPricingUnavailableError when there is no cache and the live call fails", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ error: "boom" }), { status: 500 })
    );
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      getLiveManufacturingCostAud("hardcover", 24)
    ).rejects.toThrow(LuluPricingUnavailableError);
  });

  it("uses a moderately stale cache as a last resort if the live retry also fails", async () => {
    await memoryDb.luluPriceCache.upsert({
      productKey: "hardcover",
      sampleLowPageCount: 24,
      sampleLowCostAudCents: 2464,
      sampleHighPageCount: 40,
      sampleHighCostAudCents: 2726,
    });
    const staleRow = await memoryDb.luluPriceCache.getByProductKey(
      "hardcover"
    );
    if (staleRow) {
      staleRow.quotedAt = new Date(
        Date.now() - 13 * 60 * 60 * 1000
      ).toISOString();
    }

    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ error: "boom" }), { status: 500 })
    );
    vi.stubGlobal("fetch", fetchMock);

    const cost = await getLiveManufacturingCostAud("hardcover", 24);
    expect(cost).toBe(24.64);
  });

  it("refuses a last-resort fallback once the cache is older than 7 days", async () => {
    await memoryDb.luluPriceCache.upsert({
      productKey: "hardcover",
      sampleLowPageCount: 24,
      sampleLowCostAudCents: 2464,
      sampleHighPageCount: 40,
      sampleHighCostAudCents: 2726,
    });
    const staleRow = await memoryDb.luluPriceCache.getByProductKey(
      "hardcover"
    );
    if (staleRow) {
      staleRow.quotedAt = new Date(
        Date.now() - 8 * 24 * 60 * 60 * 1000
      ).toISOString();
    }

    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ error: "boom" }), { status: 500 })
    );
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      getLiveManufacturingCostAud("hardcover", 24)
    ).rejects.toThrow(LuluPricingUnavailableError);
  });
});
