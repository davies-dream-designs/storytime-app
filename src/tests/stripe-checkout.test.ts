import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const { mockAuth, mockCreateSession } = vi.hoisted(() => ({
  mockAuth: vi.fn(async () => ({ userId: "user-1" })),
  mockCreateSession: vi.fn(async () => ({
    url: "https://checkout.stripe.test/session",
  })),
}));

vi.mock("@clerk/nextjs/server", () => ({
  auth: mockAuth,
}));

vi.mock("stripe", () => ({
  default: vi.fn().mockImplementation(() => ({
    checkout: {
      sessions: {
        create: mockCreateSession,
      },
    },
  })),
}));

describe("stripe checkout", () => {
  const previousEnv = process.env;

  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
    process.env = { ...previousEnv };
    process.env.STRIPE_SECRET_KEY = "sk_test_123";
    process.env.NEXT_PUBLIC_APP_URL = "https://storycot.com";
  });

  it("returns users to the current request origin and locale instead of configured production URL", async () => {
    const { POST } = await import("@/app/api/stripe/checkout/route");

    const res = await POST(
      new NextRequest("https://dev.storycot.com/api/stripe/checkout", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          origin: "https://dev.storycot.com",
          referer: "https://dev.storycot.com/en/account",
        },
        body: JSON.stringify({ pack: "starter" }),
      })
    );

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      url: "https://checkout.stripe.test/session",
    });
    expect(mockCreateSession).toHaveBeenCalledWith(
      expect.objectContaining({
        success_url: "https://dev.storycot.com/en/account?success=1",
        cancel_url: "https://dev.storycot.com/en/account?canceled=1",
      })
    );
  });
});
