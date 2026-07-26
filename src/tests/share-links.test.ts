import { describe, expect, it } from "vitest";
import {
  buildFacebookShareUrl,
  buildReferralUrl,
  buildSharedStoryUrl,
} from "@/lib/shareLinks";

describe("share links", () => {
  it("builds locale-aware public story URLs", () => {
    expect(
      buildSharedStoryUrl({
        origin: "https://storycot.com/",
        locale: "en",
        token: "abc123",
      })
    ).toBe("https://storycot.com/en/s/abc123");
  });

  it("builds canonical referral URLs", () => {
    expect(buildReferralUrl("user_123")).toBe(
      "https://storycot.com/?ref=user_123"
    );
  });

  it("wraps Storycot links with Facebook's sharer URL", () => {
    const shareUrl = buildFacebookShareUrl("https://storycot.com/en/s/abc123");

    expect(shareUrl).toBe(
      "https://www.facebook.com/sharer/sharer.php?u=https%3A%2F%2Fstorycot.com%2Fen%2Fs%2Fabc123"
    );
  });
});
