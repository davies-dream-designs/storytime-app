import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const { mockAuth, mockClerkClient, mockDb } = vi.hoisted(() => ({
  mockAuth: vi.fn(async () => ({ userId: "user-1" })),
  mockClerkClient: vi.fn(),
  mockDb: {
    profiles: {
      getById: vi.fn(),
    },
    stories: {
      create: vi.fn(),
    },
  },
}));

vi.mock("@clerk/nextjs/server", () => ({
  auth: mockAuth,
  clerkClient: mockClerkClient,
}));

vi.mock("@/lib/db", () => ({
  db: mockDb,
}));

describe("POST /api/stories/start safety", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    mockAuth.mockResolvedValue({ userId: "user-1" });
  });

  it("rejects inappropriate custom ideas before credits or story creation", async () => {
    const { POST } = await import("@/app/api/stories/start/route");
    const res = await POST(
      new NextRequest("http://localhost/api/stories/start", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          profileId: "profile-1",
          premise: "A scary story where a child is kidnapped by monsters.",
        }),
      })
    );

    expect(res.status).toBe(400);
    await expect(res.json()).resolves.toMatchObject({
      code: "story_idea_not_allowed",
      category: "violence_or_peril",
    });
    expect(mockClerkClient).not.toHaveBeenCalled();
    expect(mockDb.profiles.getById).not.toHaveBeenCalled();
    expect(mockDb.stories.create).not.toHaveBeenCalled();
  });
});
