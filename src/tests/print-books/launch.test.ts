import { describe, expect, it } from "vitest";
import { canStartPrintCheckout } from "@/lib/print-books/launch";

describe("print book launch gate", () => {
  it("always allows checkout for all users", () => {
    expect(canStartPrintCheckout(false)).toBe(true);
    expect(canStartPrintCheckout(true)).toBe(true);
  });
});
