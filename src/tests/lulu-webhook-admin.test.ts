import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockAuth, mockGetUser, mockGetLuluAccessToken } = vi.hoisted(() => ({
  mockAuth: vi.fn(async () => ({ userId: "admin-1" })),
  mockGetUser: vi.fn(async () => ({ privateMetadata: { isAdmin: true } })),
  mockGetLuluAccessToken: vi.fn(async () => "lulu-token"),
}));

vi.mock("@clerk/nextjs/server", () => ({
  auth: mockAuth,
  clerkClient: vi.fn(async () => ({
    users: {
      getUser: mockGetUser,
    },
  })),
}));

vi.mock("@/lib/print-books/lulu", () => ({
  getLuluAccessToken: mockGetLuluAccessToken,
}));

describe("/api/admin/lulu/register-webhook", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    mockAuth.mockResolvedValue({ userId: "admin-1" });
    mockGetUser.mockResolvedValue({ privateMetadata: { isAdmin: true } });
    mockGetLuluAccessToken.mockResolvedValue("lulu-token");
    process.env.NEXT_PUBLIC_APP_URL = "https://storycot.com";
    process.env.LULU_API_BASE_URL = "https://api.lulu.test";
    vi.stubGlobal("fetch", vi.fn());
  });

  it("normalizes wrapped Lulu webhook list responses", async () => {
    vi.mocked(fetch).mockResolvedValue(
      new Response(
        JSON.stringify({
          results: [
            {
              id: "webhook-1",
              url: "https://storycot.com/api/lulu/webhook",
              is_active: true,
              topics: ["PRINT_JOB_STATUS_CHANGED"],
            },
          ],
        }),
        { status: 200 }
      )
    );

    const { GET } = await import("@/app/api/admin/lulu/register-webhook/route");
    const res = await GET();

    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({
      webhooks: [
        {
          id: "webhook-1",
          url: "https://storycot.com/api/lulu/webhook",
          is_active: true,
          topics: ["PRINT_JOB_STATUS_CHANGED"],
        },
      ],
    });
  });

  it("returns Lulu failure detail when registration is rejected", async () => {
    vi.mocked(fetch)
      .mockResolvedValueOnce(new Response(JSON.stringify([]), { status: 200 }))
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ detail: "URL is already taken" }), {
          status: 400,
        })
      );

    const { POST } =
      await import("@/app/api/admin/lulu/register-webhook/route");
    const res = await POST();

    expect(res.status).toBe(502);
    await expect(res.json()).resolves.toMatchObject({
      error: "Lulu registration failed",
      detail: "URL is already taken",
      status: 400,
    });
  });
});
