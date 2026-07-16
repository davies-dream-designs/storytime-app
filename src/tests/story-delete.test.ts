import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const { mockAuth } = vi.hoisted(() => ({
  mockAuth: vi.fn(async () => ({ userId: "user-1" })),
}));

const mockDb = {
  stories: {
    getById: vi.fn(),
    delete: vi.fn(),
  },
};

vi.mock("@clerk/nextjs/server", () => ({
  auth: mockAuth,
}));

vi.mock("@/lib/db", () => ({
  db: mockDb,
}));

describe("DELETE /api/stories/[id]", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    mockAuth.mockResolvedValue({ userId: "user-1" });
    mockDb.stories.getById.mockResolvedValue({
      id: "story-1",
      userId: "user-1",
    });
    mockDb.stories.delete.mockResolvedValue(true);
  });

  it("deletes a story through the data-layer cascade", async () => {
    const { DELETE } = await import("@/app/api/stories/[id]/route");
    const res = await DELETE(
      new NextRequest("http://localhost/api/stories/story-1"),
      {
        params: Promise.resolve({ id: "story-1" }),
      }
    );

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ success: true });
    expect(mockDb.stories.delete).toHaveBeenCalledWith("story-1");
  });
});
