import { afterEach, describe, expect, it } from "vitest";
import {
  canStartPrintCheckout,
  isPrintOrderingGloballyEnabled,
  isPublicPrintOrderingEnabled,
} from "@/lib/print-books/launch";

describe("print book launch gate", () => {
  const previousEnv = process.env;

  afterEach(() => {
    process.env = { ...previousEnv };
  });

  it("allows checkout outside production for testing", () => {
    process.env = { ...previousEnv, VERCEL_ENV: "preview" };

    expect(canStartPrintCheckout(false)).toBe(true);
  });

  it("blocks non-admin checkout in production by default", () => {
    process.env = { ...previousEnv, VERCEL_ENV: "production" };

    expect(canStartPrintCheckout(false)).toBe(false);
    expect(canStartPrintCheckout(true)).toBe(true);
  });

  it("can be opened globally by environment flag", () => {
    process.env = {
      ...previousEnv,
      VERCEL_ENV: "production",
      PRINT_BOOK_ORDERING_ENABLED: "true",
      NEXT_PUBLIC_PRINT_BOOK_ORDERING_ENABLED: "true",
    };

    expect(isPrintOrderingGloballyEnabled()).toBe(true);
    expect(isPublicPrintOrderingEnabled()).toBe(true);
    expect(canStartPrintCheckout(false)).toBe(true);
  });
});
