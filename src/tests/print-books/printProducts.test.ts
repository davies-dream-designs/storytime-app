import { describe, expect, it } from "vitest";
import {
  getAdjustedPageCountForProduct,
  getPrintProductQuotes,
  getStorycotPageCountForAgeBand,
  quotePrintProduct,
} from "@/lib/print-books/printProducts";

describe("print product policy", () => {
  it("chooses age-based logical book lengths", () => {
    expect(getStorycotPageCountForAgeBand("0-2")).toBe(20);
    expect(getStorycotPageCountForAgeBand("3-5")).toBe(24);
    expect(getStorycotPageCountForAgeBand("6-8")).toBe(32);
  });

  it("pads only odd page counts to the product page step", () => {
    expect(getAdjustedPageCountForProduct(20, "softcover")).toBe(20);
    expect(getAdjustedPageCountForProduct(21, "softcover")).toBe(22);
    expect(getAdjustedPageCountForProduct(20, "hardcover")).toBe(20);
  });

  it("prices print separately from already-paid illustrations", () => {
    expect(quotePrintProduct({ pageCount: 24 }, "softcover").priceAud).toBe(
      29.95
    );
    expect(quotePrintProduct({ pageCount: 24 }, "hardcover").priceAud).toBe(
      44.95
    );
    expect(getPrintProductQuotes({ pageCount: 32 })).toHaveLength(3);
  });

  it("marks formats unavailable when the finished PDF is below the product minimum", () => {
    const hardcoverQuote = quotePrintProduct({ pageCount: 20 }, "hardcover");
    expect(hardcoverQuote.pageCount).toBe(20);
    expect(hardcoverQuote.needsPadding).toBe(false);
    expect(hardcoverQuote.isWithinSpecs).toBe(false);
    expect(hardcoverQuote.unsupportedReason).toContain(
      "requires at least 24 print pages"
    );

    expect(quotePrintProduct({ pageCount: 18 }, "layflat").isWithinSpecs).toBe(
      true
    );
    expect(
      quotePrintProduct({ pageCount: 18 }, "softcover").isWithinSpecs
    ).toBe(false);
  });
});
