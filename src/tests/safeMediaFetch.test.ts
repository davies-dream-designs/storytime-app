import { describe, expect, it } from "vitest";
import { isAllowedMediaUrl } from "@/lib/safeMediaFetch";

describe("isAllowedMediaUrl (SSRF allowlist)", () => {
  it("allows our own blob store over https", () => {
    expect(
      isAllowedMediaUrl("https://acct.blob.vercel-storage.com/a/b.png")
    ).toBe(true);
  });

  it("allows inline data URLs", () => {
    expect(isAllowedMediaUrl("data:image/png;base64,AAAA")).toBe(true);
  });

  it("rejects link-local / metadata endpoints", () => {
    expect(isAllowedMediaUrl("http://169.254.169.254/latest/meta-data/")).toBe(
      false
    );
  });

  it("rejects arbitrary external hosts", () => {
    expect(isAllowedMediaUrl("https://evil.example.com/x.png")).toBe(false);
    expect(isAllowedMediaUrl("https://cdn.example/grandma-lounge.png")).toBe(
      false
    );
  });

  it("rejects non-https and credentialed URLs", () => {
    expect(
      isAllowedMediaUrl("http://acct.blob.vercel-storage.com/a.png")
    ).toBe(false);
    expect(
      isAllowedMediaUrl("https://u:p@acct.blob.vercel-storage.com/a.png")
    ).toBe(false);
  });

  it("rejects a lookalike host that merely contains the suffix", () => {
    expect(
      isAllowedMediaUrl("https://blob.vercel-storage.com.evil.com/a.png")
    ).toBe(false);
  });

  it("rejects garbage input", () => {
    expect(isAllowedMediaUrl("not a url")).toBe(false);
    expect(isAllowedMediaUrl("")).toBe(false);
  });
});
