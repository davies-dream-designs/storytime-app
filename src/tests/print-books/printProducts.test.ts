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
  getAdjustedPageCountForProduct,
  getPrintProductQuotes,
  getStorycotIllustrationCountForAgeBand,
  getStorycotIllustratedStorySpreadCountForAgeBand,
  getStorycotPageCountForAgeBand,
  getStorycotStorySpreadCountForAgeBand,
  quotePrintProduct,
} from "@/lib/print-books/printProducts";

const memoryDb = mockedDb as typeof mockedDb & { _reset(): void };
const previousEnv = process.env;

// Pre-seed a fresh price cache for every product so quotePrintProduct
// resolves synchronously off the cache instead of hitting the network in
// every test. Values are illustrative, not tied to any live Lulu quote.
async function seedPriceCache() {
  await memoryDb.luluPriceCache.upsert({
    productKey: "hardcover",
    sampleLowPageCount: 24,
    sampleLowCostAudCents: 2464, // $24.64
    sampleHighPageCount: 40,
    sampleHighCostAudCents: 2726, // $27.26
  });
  await memoryDb.luluPriceCache.upsert({
    productKey: "paperback",
    sampleLowPageCount: 32,
    sampleLowCostAudCents: 733, // $7.33
    sampleHighPageCount: 48,
    sampleHighCostAudCents: 944, // $9.44
  });
  await memoryDb.luluPriceCache.upsert({
    productKey: "coil",
    sampleLowPageCount: 4,
    sampleLowCostAudCents: 1000,
    sampleHighPageCount: 20,
    sampleHighCostAudCents: 1100,
  });
}

beforeEach(async () => {
  memoryDb._reset();
  process.env = { ...previousEnv, PRINT_PRICE_MARGIN_MULTIPLIER: "1.2" };
  await seedPriceCache();
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  resetLuluTokenCacheForTests();
  process.env = { ...previousEnv };
});

describe("print product policy", () => {
  it("chooses age-based logical book lengths", () => {
    expect(getStorycotPageCountForAgeBand("baby-drift")).toBe(24);
    expect(getStorycotPageCountForAgeBand("little-listener")).toBe(24);
    expect(getStorycotPageCountForAgeBand("toddler-tale")).toBe(24);
    expect(getStorycotPageCountForAgeBand("first-adventure")).toBe(28);
    expect(getStorycotPageCountForAgeBand("preschool-story")).toBe(28);
    expect(getStorycotPageCountForAgeBand("big-kid-chapter")).toBe(32);
    expect(getStorycotPageCountForAgeBand("young-reader-short")).toBe(40);
    expect(getStorycotPageCountForAgeBand("young-reader-classic")).toBe(56);
    expect(getStorycotPageCountForAgeBand("young-reader-long")).toBe(72);
    expect(getStorycotPageCountForAgeBand("0-2")).toBe(20);
    expect(getStorycotPageCountForAgeBand("3-5")).toBe(28);
    expect(getStorycotPageCountForAgeBand("6-8")).toBe(32);
  });

  it("chooses age-based story spread and illustration counts", () => {
    expect(getStorycotStorySpreadCountForAgeBand("baby-drift")).toBe(8);
    expect(getStorycotStorySpreadCountForAgeBand("young-reader-classic")).toBe(
      24
    );
    expect(
      getStorycotIllustratedStorySpreadCountForAgeBand("young-reader-classic")
    ).toBe(10);
    expect(getStorycotIllustrationCountForAgeBand("baby-drift")).toBe(9);
    expect(getStorycotIllustrationCountForAgeBand("big-kid-chapter")).toBe(10);
    expect(getStorycotIllustrationCountForAgeBand("young-reader-short")).toBe(
      9
    );
    expect(getStorycotIllustrationCountForAgeBand("young-reader-classic")).toBe(
      11
    );
    expect(getStorycotIllustrationCountForAgeBand("young-reader-long")).toBe(
      13
    );
    expect(getStorycotStorySpreadCountForAgeBand("0-2")).toBe(6);
    expect(getStorycotStorySpreadCountForAgeBand("3-5")).toBe(10);
    expect(getStorycotStorySpreadCountForAgeBand("6-8")).toBe(12);
    expect(getStorycotIllustrationCountForAgeBand("0-2")).toBe(7);
    expect(getStorycotIllustrationCountForAgeBand("3-5")).toBe(11);
    expect(getStorycotIllustrationCountForAgeBand("6-8")).toBe(13);
  });

  it("pads odd page counts to even for print products", () => {
    expect(getAdjustedPageCountForProduct(20, "hardcover")).toBe(20);
    expect(getAdjustedPageCountForProduct(21, "hardcover")).toBe(22);
  });

  it("prices books from a live (cached) Lulu manufacturing cost, not a hardcoded formula", async () => {
    const hardcoverQuote = await quotePrintProduct({ pageCount: 24 }, "hardcover");
    // manufacturingCostAud comes straight from the seeded cache's low sample.
    expect(hardcoverQuote.manufacturingCostAud).toBe(24.64);
    // priceAud = manufacturingCostAud * 1.2 margin, rounded to nearest 5c.
    expect(hardcoverQuote.priceAud).toBeCloseTo(24.64 * 1.2, 1);
    expect(hardcoverQuote.provider).toBe("Lulu");
    expect(hardcoverQuote.format).toBe('8.5" square hardcover casewrap');
    expect(hardcoverQuote.pricingUnavailable).toBe(false);

    const quotes = await getPrintProductQuotes({ pageCount: 32 });
    expect(quotes.map((q) => q.key).sort()).toEqual(
      ["coil", "hardcover", "paperback"].sort()
    );
  });

  it("interpolates price between the two cached sample points for other page counts", async () => {
    // Cached hardcover samples: 24pp -> $24.64, 40pp -> $27.26.
    const quote = await quotePrintProduct({ pageCount: 32 }, "hardcover");
    const expectedCost = (24.64 + 27.26) / 2;
    expect(quote.manufacturingCostAud).toBeCloseTo(expectedCost, 2);
  });

  it("applies the configured margin multiplier on top of manufacturing cost", async () => {
    process.env.PRINT_PRICE_MARGIN_MULTIPLIER = "1.5";
    const quote = await quotePrintProduct({ pageCount: 24 }, "hardcover");
    expect(quote.priceAud).toBeCloseTo(24.64 * 1.5, 1);
  });

  it("marks formats unavailable when the finished PDF is below the product minimum", async () => {
    const hardcoverQuote = await quotePrintProduct({ pageCount: 18 }, "hardcover");
    expect(hardcoverQuote.pageCount).toBe(18);
    expect(hardcoverQuote.needsPadding).toBe(false);
    expect(hardcoverQuote.isWithinSpecs).toBe(false);
    expect(hardcoverQuote.unsupportedReason).toContain(
      "requires at least 20 print pages"
    );
    // No pricing call should even be attempted for an unsupported format.
    expect(hardcoverQuote.priceAud).toBeUndefined();
  });

  it("allows 20-page hardcover books while fulfillment pads Lulu exports", async () => {
    const hardcoverQuote = await quotePrintProduct({ pageCount: 20 }, "hardcover");
    expect(hardcoverQuote.pageCount).toBe(20);
    expect(hardcoverQuote.needsPadding).toBe(false);
    expect(hardcoverQuote.isWithinSpecs).toBe(true);
  });

  it("auto-pads odd page counts to even rather than blocking checkout", async () => {
    const hardcoverQuote = await quotePrintProduct({ pageCount: 21 }, "hardcover");
    expect(hardcoverQuote.pageCount).toBe(22);
    expect(hardcoverQuote.needsPadding).toBe(true);
    expect(hardcoverQuote.paddingPages).toBe(1);
    expect(hardcoverQuote.isWithinSpecs).toBe(true);
  });

  it("gates paperback (Perfect Bound) to Lulu's real 32-page minimum", async () => {
    const tooShort = await quotePrintProduct({ pageCount: 24 }, "paperback");
    expect(tooShort.isWithinSpecs).toBe(false);
    expect(tooShort.unsupportedReason).toContain("requires at least 32");

    const ok = await quotePrintProduct({ pageCount: 32 }, "paperback");
    expect(ok.isWithinSpecs).toBe(true);
    expect(ok.manufacturingCostAud).toBe(7.33);
  });

  it("allows coil binding from very low page counts", async () => {
    const quote = await quotePrintProduct({ pageCount: 8 }, "coil");
    expect(quote.isWithinSpecs).toBe(true);
    expect(quote.manufacturingCostAud).toBeDefined();
  });

  it("blocks pricing (does not fall back to a static number) when both cache and live quote fail", async () => {
    memoryDb._reset(); // no cached price at all
    const fetchMock = vi
      .fn()
      .mockResolvedValue(new Response(JSON.stringify({ error: "down" }), { status: 500 }));
    vi.stubGlobal("fetch", fetchMock);

    const quote = await quotePrintProduct({ pageCount: 24 }, "hardcover");
    expect(quote.isWithinSpecs).toBe(true);
    expect(quote.pricingUnavailable).toBe(true);
    expect(quote.priceAud).toBeUndefined();
  });
});
