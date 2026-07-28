import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const { mockAdminIdentity, mockAdjustUserCredits, mockLogEvent } = vi.hoisted(
  () => ({
    mockAdminIdentity: vi.fn(async () => ({
      userId: "admin-1",
      label: "admin@storycot.test",
    })),
    mockAdjustUserCredits: vi.fn(),
    mockLogEvent: vi.fn(),
  })
);

vi.mock("@/lib/adminAuth", () => ({
  getAdminIdentity: mockAdminIdentity,
}));

vi.mock("@/lib/credits", () => ({
  adjustUserCredits: mockAdjustUserCredits,
}));

vi.mock("@/lib/logEvent", () => ({
  logEvent: mockLogEvent,
}));

describe("admin credit adjustment", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    mockAdminIdentity.mockResolvedValue({
      userId: "admin-1",
      label: "admin@storycot.test",
    });
    mockAdjustUserCredits.mockResolvedValue(11);
  });

  it("grants credits and logs the admin reason", async () => {
    const { POST } =
      await import("@/app/api/admin/users/[userId]/credits/route");
    const res = await POST(
      new NextRequest("http://localhost/api/admin/users/user-1/credits", {
        method: "POST",
        body: JSON.stringify({
          delta: 3,
          reason: "Public leaderboard reward",
        }),
      }),
      { params: Promise.resolve({ userId: "user-1" }) }
    );

    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({
      userId: "user-1",
      credits: 11,
      delta: 3,
    });
    expect(mockAdjustUserCredits).toHaveBeenCalledWith("user-1", 3);
    expect(mockLogEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        code: "admin.credits_adjusted",
        severity: "info",
        domain: "credits",
        userId: "user-1",
        context: expect.objectContaining({
          delta: 3,
          by: "admin@storycot.test",
          reason: "Public leaderboard reward",
        }),
      })
    );
  });

  it("rejects zero-value adjustments", async () => {
    const { POST } =
      await import("@/app/api/admin/users/[userId]/credits/route");
    const res = await POST(
      new NextRequest("http://localhost/api/admin/users/user-1/credits", {
        method: "POST",
        body: JSON.stringify({ delta: 0 }),
      }),
      { params: Promise.resolve({ userId: "user-1" }) }
    );

    expect(res.status).toBe(400);
    expect(mockAdjustUserCredits).not.toHaveBeenCalled();
    expect(mockLogEvent).not.toHaveBeenCalled();
  });
});
