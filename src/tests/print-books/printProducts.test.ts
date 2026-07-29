import { describe, expect, it } from "vitest";
import {
  getAdjustedPageCountForProduct,
  getPrintProductQuotes,
  getStorycotIllustrationCountForAgeBand,
  getStorycotPageCountForAgeBand,
  getStorycotStorySpreadCountForAgeBand,
  quotePrintProduct,
} from "@/lib/print-books/printProducts";

describe("print product policy", () => {
  it("chooses age-based logical book lengths", () => {
    expect(getStorycotPageCountForAgeBand("0-2")).toBe(20);
    expect(getStorycotPageCountForAgeBand("3-5")).toBe(28);
    expect(getStorycotPageCountForAgeBand("6-8")).toBe(32);
  });

  it("chooses age-based story spread and illustration counts", () => {
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

  it("prices print separately from already-paid illustrations", () => {
    const hardcoverQuote = quotePrintProduct({ pageCount: 24 }, "hardcover");
    expect(hardcoverQuote.priceAud).toBe(39.95);
    expect(hardcoverQuote.provider).toBe("Lulu");
    expect(hardcoverQuote.format).toBe('8.5" square hardcover casewrap');
    expect(getPrintProductQuotes({ pageCount: 32 })).toHaveLength(1);
    expect(getPrintProductQuotes({ pageCount: 32 })[0]?.key).toBe("hardcover");
  });

  it("marks formats unavailable when the finished PDF is below the product minimum", () => {
    const hardcoverQuote = quotePrintProduct({ pageCount: 18 }, "hardcover");
    expect(hardcoverQuote.pageCount).toBe(18);
    expect(hardcoverQuote.needsPadding).toBe(false);
    expect(hardcoverQuote.isWithinSpecs).toBe(false);
    expect(hardcoverQuote.unsupportedReason).toContain(
      "requires at least 20 print pages"
    );
  });

  it("allows 20-page hardcover books while fulfillment pads Lulu exports", () => {
    const hardcoverQuote = quotePrintProduct({ pageCount: 20 }, "hardcover");
    expect(hardcoverQuote.pageCount).toBe(20);
    expect(hardcoverQuote.needsPadding).toBe(false);
    expect(hardcoverQuote.isWithinSpecs).toBe(true);
  });

  it("auto-pads odd page counts to even rather than blocking checkout", () => {
    const hardcoverQuote = quotePrintProduct({ pageCount: 21 }, "hardcover");
    expect(hardcoverQuote.pageCount).toBe(22);
    expect(hardcoverQuote.needsPadding).toBe(true);
    expect(hardcoverQuote.paddingPages).toBe(1);
    expect(hardcoverQuote.isWithinSpecs).toBe(true);
  });
});
