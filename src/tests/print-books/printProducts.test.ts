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
    expect(getStorycotPageCountForAgeBand("0-2")).toBe(24);
    expect(getStorycotPageCountForAgeBand("3-5")).toBe(28);
    expect(getStorycotPageCountForAgeBand("6-8")).toBe(32);
  });

  it("chooses age-based story spread and illustration counts", () => {
    expect(getStorycotStorySpreadCountForAgeBand("0-2")).toBe(8);
    expect(getStorycotStorySpreadCountForAgeBand("3-5")).toBe(10);
    expect(getStorycotStorySpreadCountForAgeBand("6-8")).toBe(12);
    expect(getStorycotIllustrationCountForAgeBand("0-2")).toBe(9);
    expect(getStorycotIllustrationCountForAgeBand("3-5")).toBe(11);
    expect(getStorycotIllustrationCountForAgeBand("6-8")).toBe(13);
  });

  it("quotes the finished PDF page count without product-specific padding", () => {
    expect(getAdjustedPageCountForProduct(20, "softcover")).toBe(20);
    expect(getAdjustedPageCountForProduct(21, "softcover")).toBe(21);
    expect(getAdjustedPageCountForProduct(20, "hardcover")).toBe(20);
  });

  it("prices print separately from already-paid illustrations", () => {
    const hardcoverQuote = quotePrintProduct({ pageCount: 24 }, "hardcover");
    expect(hardcoverQuote.priceAud).toBe(39.95);
    expect(hardcoverQuote.provider).toBe("Lulu");
    expect(hardcoverQuote.format).toBe('8.5" square hardcover casewrap');
    const softcoverQuote = quotePrintProduct({ pageCount: 24 }, "softcover");
    expect(softcoverQuote.priceAud).toBe(26.95);
    expect(softcoverQuote.provider).toBe("Lulu");
    expect(softcoverQuote.format).toBe('8.5" square premium colour paperback');
    expect(getPrintProductQuotes({ pageCount: 32 })).toHaveLength(3);
  });

  it("temporarily disables products without viable AU fulfillment", () => {
    const softcoverQuote = quotePrintProduct({ pageCount: 24 }, "softcover");
    expect(softcoverQuote.isWithinSpecs).toBe(true);

    const layflatQuote = quotePrintProduct({ pageCount: 24 }, "layflat");
    expect(layflatQuote.isWithinSpecs).toBe(false);
    expect(layflatQuote.unsupportedReason).toContain(
      "temporarily unavailable in Australia"
    );
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

    expect(quotePrintProduct({ pageCount: 18 }, "layflat").isWithinSpecs).toBe(
      false
    );
    expect(
      quotePrintProduct({ pageCount: 18 }, "softcover").isWithinSpecs
    ).toBe(false);
  });

  it("marks odd page counts unavailable because print books require even pages", () => {
    const softcoverQuote = quotePrintProduct({ pageCount: 19 }, "softcover");
    expect(softcoverQuote.pageCount).toBe(19);
    expect(softcoverQuote.isWithinSpecs).toBe(false);
    expect(softcoverQuote.unsupportedReason).toContain(
      "requires an even number of print pages"
    );
  });
});
