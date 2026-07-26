import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockAuth } = vi.hoisted(() => ({
  mockAuth: vi.fn(async () => ({ userId: "user-1" })),
}));

const { mockClaimRedeemed, mockGetGiftByToken, mockUpdateGift } = vi.hoisted(
  () => ({
    mockClaimRedeemed: vi.fn(),
    mockGetGiftByToken: vi.fn(),
    mockUpdateGift: vi.fn(),
  })
);

const { mockAdjustUserCredits } = vi.hoisted(() => ({
  mockAdjustUserCredits: vi.fn(),
}));

vi.mock("@clerk/nextjs/server", () => ({
  auth: mockAuth,
}));

vi.mock("@/lib/credits", () => ({
  adjustUserCredits: mockAdjustUserCredits,
}));

vi.mock("@/lib/db", () => ({
  db: {
    giftOrders: {
      claimRedeemed: mockClaimRedeemed,
      getByToken: mockGetGiftByToken,
      update: mockUpdateGift,
    },
  },
}));

describe("gift redemption", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    mockAuth.mockResolvedValue({ userId: "user-1" });
    mockAdjustUserCredits.mockResolvedValue(13);
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
    expect(mockAdjustUserCredits).toHaveBeenCalledWith("user-1", 10);
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
    expect(mockAdjustUserCredits).not.toHaveBeenCalled();
  });
});
