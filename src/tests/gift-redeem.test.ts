import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockAuth } = vi.hoisted(() => ({
  mockAuth: vi.fn(async () => ({ userId: "user-1" })),
}));

const {
  mockClaimRedeemed,
  mockFinalizeRedeemed,
  mockGetGiftByToken,
  mockRedeemGiftCredits,
  mockReleaseRedeemClaim,
} = vi.hoisted(() => ({
  mockClaimRedeemed: vi.fn(),
  mockFinalizeRedeemed: vi.fn(),
  mockGetGiftByToken: vi.fn(),
  mockRedeemGiftCredits: vi.fn(),
  mockReleaseRedeemClaim: vi.fn(),
}));

vi.mock("@clerk/nextjs/server", () => ({
  auth: mockAuth,
}));

vi.mock("@/lib/credits", () => ({
  redeemGiftCredits: mockRedeemGiftCredits,
}));

vi.mock("@/lib/db", () => ({
  db: {
    giftOrders: {
      claimRedeemed: mockClaimRedeemed,
      finalizeRedeemed: mockFinalizeRedeemed,
      getByToken: mockGetGiftByToken,
      releaseRedeemClaim: mockReleaseRedeemClaim,
    },
  },
}));

describe("gift redemption", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    mockAuth.mockResolvedValue({ userId: "user-1" });
    mockFinalizeRedeemed.mockResolvedValue({ id: "gift-1" });
    mockRedeemGiftCredits.mockResolvedValue(13);
  });

  it("claims a paid gift and adds its credits to the signed-in user", async () => {
    mockClaimRedeemed.mockResolvedValue({
      id: "gift-1",
      token: "gift_token_123456",
      credits: 10,
    });

    const { POST } = await import("@/app/api/gifts/[token]/redeem/route");
    const res = await POST(new Request("http://localhost"), {
      params: Promise.resolve({ token: "gift_token_123456" }),
    });

    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({
      success: true,
      credits: 13,
      added: 10,
    });
    expect(mockClaimRedeemed).toHaveBeenCalledWith(
      "gift_token_123456",
      "user-1",
      expect.any(String)
    );
    expect(mockRedeemGiftCredits).toHaveBeenCalledWith("user-1", "gift-1", 10);
    expect(mockFinalizeRedeemed).toHaveBeenCalledWith(
      "gift-1",
      "user-1",
      expect.any(String)
    );
  });

  it("does not grant credits when the gift is already redeemed", async () => {
    mockClaimRedeemed.mockResolvedValue(undefined);
    mockGetGiftByToken.mockResolvedValue({
      id: "gift-1",
      token: "gift_token_123456",
      status: "redeemed",
    });

    const { POST } = await import("@/app/api/gifts/[token]/redeem/route");
    const res = await POST(new Request("http://localhost"), {
      params: Promise.resolve({ token: "gift_token_123456" }),
    });

    expect(res.status).toBe(409);
    expect(mockRedeemGiftCredits).not.toHaveBeenCalled();
  });

  it("releases the redeem claim when the credit grant fails", async () => {
    mockClaimRedeemed.mockResolvedValue({
      id: "gift-1",
      token: "gift_token_123456",
      credits: 10,
    });
    mockRedeemGiftCredits.mockRejectedValue(new Error("Clerk unavailable"));

    const { POST } = await import("@/app/api/gifts/[token]/redeem/route");
    const res = await POST(new Request("http://localhost"), {
      params: Promise.resolve({ token: "gift_token_123456" }),
    });

    expect(res.status).toBe(500);
    expect(mockReleaseRedeemClaim).toHaveBeenCalledWith("gift-1", "user-1");
  });
});
