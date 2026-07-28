import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const { mockAuth, mockAdminIdentity, mockDb, mockNotifyPublicStoryOwner } =
  vi.hoisted(() => ({
    mockAuth: vi.fn(async () => ({ userId: "user-1" })),
    mockAdminIdentity: vi.fn(async () => ({
      userId: "admin-1",
      label: "admin@storycot.test",
    })),
    mockNotifyPublicStoryOwner: vi.fn(),
    mockDb: {
      stories: {
        getById: vi.fn(),
        update: vi.fn(),
      },
      publicStoryModerationEvents: {
        create: vi.fn(),
      },
    },
  }));

vi.mock("@clerk/nextjs/server", () => ({
  auth: mockAuth,
}));

vi.mock("@/lib/adminAuth", () => ({
  getAdminIdentity: mockAdminIdentity,
}));

vi.mock("@/lib/db", () => ({
  db: mockDb,
}));

vi.mock("@/lib/publicStoryNotifications", () => ({
  notifyPublicStoryOwner: mockNotifyPublicStoryOwner,
}));

const readyStory = {
  id: "story-1",
  userId: "user-1",
  title: "Moon Garden",
  status: "ready",
  profileName: "Bailey",
  shareToken: undefined,
};

describe("public story review flow", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    mockAuth.mockResolvedValue({ userId: "user-1" });
    mockAdminIdentity.mockResolvedValue({
      userId: "admin-1",
      label: "admin@storycot.test",
    });
    mockDb.stories.getById.mockResolvedValue(readyStory);
    mockDb.stories.update.mockImplementation(async (_id, updates) => ({
      ...readyStory,
      ...updates,
    }));
  });

  it("requires every public publishing checklist confirmation", async () => {
    const { POST } =
      await import("@/app/api/stories/[id]/public-submission/route");
    const res = await POST(
      new NextRequest(
        "http://localhost/api/stories/story-1/public-submission",
        {
          method: "POST",
          body: JSON.stringify({
            authorName: "Bailey and family",
            confirmations: { rights: true, privacy: true, terms: false },
          }),
        }
      ),
      { params: Promise.resolve({ id: "story-1" }) }
    );

    expect(res.status).toBe(400);
    expect(mockDb.stories.update).not.toHaveBeenCalled();
  });

  it("submits an owned ready story for moderation and creates a share token", async () => {
    const { POST } =
      await import("@/app/api/stories/[id]/public-submission/route");
    const res = await POST(
      new NextRequest(
        "http://localhost/api/stories/story-1/public-submission",
        {
          method: "POST",
          body: JSON.stringify({
            authorName: "Bailey and family",
            confirmations: { rights: true, privacy: true, terms: true },
          }),
        }
      ),
      { params: Promise.resolve({ id: "story-1" }) }
    );

    expect(res.status).toBe(200);
    expect(mockDb.stories.update).toHaveBeenCalledWith(
      "story-1",
      expect.objectContaining({
        visibility: "public",
        publicReviewStatus: "pending_review",
        publicAuthorName: "Bailey and family",
        shareToken: expect.any(String),
      })
    );
    expect(mockDb.publicStoryModerationEvents.create).toHaveBeenCalledWith(
      expect.objectContaining({
        storyId: "story-1",
        actorUserId: "user-1",
        actorLabel: "owner",
        action: "submitted",
        metadata: { authorName: "Bailey and family" },
      })
    );
  });

  it("blocks unsafe public submissions before the moderation queue", async () => {
    mockDb.stories.getById.mockResolvedValue({
      ...readyStory,
      pages: [
        {
          pageNumber: 1,
          text: "Bailey found a magic key.",
          illustrationPrompt: "A child holding a gun in a moonlit garden.",
        },
      ],
    });

    const { POST } =
      await import("@/app/api/stories/[id]/public-submission/route");
    const res = await POST(
      new NextRequest(
        "http://localhost/api/stories/story-1/public-submission",
        {
          method: "POST",
          body: JSON.stringify({
            authorName: "Bailey and family",
            confirmations: { rights: true, privacy: true, terms: true },
          }),
        }
      ),
      { params: Promise.resolve({ id: "story-1" }) }
    );

    expect(res.status).toBe(400);
    await expect(res.json()).resolves.toMatchObject({
      code: "story_idea_not_allowed",
      category: "violence_or_peril",
    });
    expect(mockDb.stories.update).not.toHaveBeenCalled();
    expect(mockDb.publicStoryModerationEvents.create).toHaveBeenCalledWith(
      expect.objectContaining({
        storyId: "story-1",
        actorUserId: "user-1",
        actorLabel: "owner",
        action: "pre_screen_blocked",
        metadata: { category: "violence_or_peril" },
      })
    );
  });

  it("lets an admin approve a pending public story", async () => {
    mockDb.stories.getById.mockResolvedValue({
      ...readyStory,
      publicReviewStatus: "pending_review",
      visibility: "public",
      shareToken: "share-token",
    });

    const { POST } =
      await import("@/app/api/admin/public-stories/[id]/review/route");
    const res = await POST(
      new NextRequest(
        "http://localhost/api/admin/public-stories/story-1/review",
        {
          method: "POST",
          body: JSON.stringify({ decision: "approved" }),
        }
      ),
      { params: Promise.resolve({ id: "story-1" }) }
    );

    expect(res.status).toBe(200);
    expect(mockDb.stories.update).toHaveBeenCalledWith(
      "story-1",
      expect.objectContaining({
        visibility: "public",
        publicReviewStatus: "approved",
        publicReviewedBy: "admin@storycot.test",
      })
    );
    expect(mockNotifyPublicStoryOwner).toHaveBeenCalledWith(
      expect.objectContaining({
        subject: "Your Storycot story is now public - Moon Garden",
        headline: "Your story is public",
      })
    );
    expect(mockDb.publicStoryModerationEvents.create).toHaveBeenCalledWith(
      expect.objectContaining({
        storyId: "story-1",
        actorUserId: "admin-1",
        actorLabel: "admin@storycot.test",
        action: "approved",
      })
    );
  });

  it("requires a reason when rejecting a public story", async () => {
    mockDb.stories.getById.mockResolvedValue({
      ...readyStory,
      publicReviewStatus: "pending_review",
    });

    const { POST } =
      await import("@/app/api/admin/public-stories/[id]/review/route");
    const res = await POST(
      new NextRequest(
        "http://localhost/api/admin/public-stories/story-1/review",
        {
          method: "POST",
          body: JSON.stringify({ decision: "rejected" }),
        }
      ),
      { params: Promise.resolve({ id: "story-1" }) }
    );

    expect(res.status).toBe(400);
    expect(mockDb.stories.update).not.toHaveBeenCalled();
  });
});
