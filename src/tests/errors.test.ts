import { describe, it, expect } from "vitest";
import {
  AppError,
  appError,
  toAppError,
  getErrorCodeMeta,
  rawErrorString,
  ERROR_REGISTRY,
  SEVERITY_RANK,
} from "@/lib/errors";

describe("error taxonomy", () => {
  it("every registered code carries a domain the meta lookup agrees with", () => {
    for (const [code, meta] of Object.entries(ERROR_REGISTRY)) {
      const resolved = getErrorCodeMeta(code);
      expect(resolved.known).toBe(true);
      expect(resolved.domain).toBe(meta.domain);
      expect(resolved.severity).toBe(meta.severity);
    }
  });

  it("AppError inherits metadata from its code", () => {
    const err = new AppError("book.image_moderation_blocked", {
      context: { model: "gpt-image-2" },
    });
    expect(err).toBeInstanceOf(Error);
    expect(err.code).toBe("book.image_moderation_blocked");
    expect(err.domain).toBe("book");
    expect(err.severity).toBe("warning");
    expect(err.retryable).toBe(true);
    expect(err.context).toEqual({ model: "gpt-image-2" });
  });

  it("appError() factory matches the constructor", () => {
    expect(appError("system.unknown")).toBeInstanceOf(AppError);
  });

  it("toAppError passes through existing AppErrors unchanged", () => {
    const original = new AppError("print.fulfillment_failed");
    expect(toAppError(original)).toBe(original);
  });

  it("toAppError wraps bare errors under the fallback code, preserving message", () => {
    const wrapped = toAppError(new Error("boom"), "external.openai_error");
    expect(wrapped.code).toBe("external.openai_error");
    expect(wrapped.message).toBe("boom");
    expect(wrapped.cause).toBeInstanceOf(Error);
  });

  it("getErrorCodeMeta infers a domain for legacy/unknown codes", () => {
    const legacy = getErrorCodeMeta("illustrating:image_failed");
    expect(legacy.known).toBe(false);
    expect(legacy.domain).toBe("book");

    const stripey = getErrorCodeMeta("stripe_weirdness");
    expect(stripey.domain).toBe("payment");

    const nullish = getErrorCodeMeta(null);
    expect(nullish.domain).toBe("system");
    expect(nullish.code).toBe("unknown");
  });

  it("severity ranks are strictly ordered", () => {
    expect(SEVERITY_RANK.info).toBeLessThan(SEVERITY_RANK.warning);
    expect(SEVERITY_RANK.warning).toBeLessThan(SEVERITY_RANK.error);
    expect(SEVERITY_RANK.error).toBeLessThan(SEVERITY_RANK.critical);
  });

  it("rawErrorString captures message + stack for Errors and stringifies others", () => {
    expect(rawErrorString(new Error("nope"))).toContain("nope");
    expect(rawErrorString("plain string")).toBe("plain string");
    expect(rawErrorString({ a: 1 })).toBe('{"a":1}');
  });
});
