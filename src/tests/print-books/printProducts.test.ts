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

  it("pads only the physical product that needs more pages", () => {
    expect(getAdjustedPageCountForProduct(20, "softcover")).toBe(20);
    expect(getAdjustedPageCountForProduct(20, "hardcover")).toBe(24);
    expect(getAdjustedPageCountForProduct(20, "layflat")).toBe(20);
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
});
