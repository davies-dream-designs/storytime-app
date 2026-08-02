import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const { mockAdminIdentity, mockDb, mockNotifyPublicStoryOwner } = vi.hoisted(
  () => ({
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
      publicStoryReports: {
        closeForStory: vi.fn(),
      },
      publicStoryModerationEvents: {
        create: vi.fn(),
      },
    },
  })
);

vi.mock("@/lib/adminAuth", () => ({
  getAdminIdentity: mockAdminIdentity,
}));

vi.mock("@/lib/db", () => ({
  db: mockDb,
}));

vi.mock("@/lib/publicStoryNotifications", () => ({
  notifyPublicStoryOwner: mockNotifyPublicStoryOwner,
}));

const publicStory = {
  id: "story-1",
  userId: "creator-1",
  title: "Moon Garden",
  visibility: "public",
  publicReviewStatus: "approved",
};

describe("admin public story report actions", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    mockAdminIdentity.mockResolvedValue({
      userId: "admin-1",
      label: "admin@storycot.test",
    });
    mockDb.stories.getById.mockResolvedValue(publicStory);
    mockDb.stories.update.mockImplementation(async (_id, updates) => ({
      ...publicStory,
      ...updates,
    }));
    mockDb.publicStoryReports.closeForStory.mockResolvedValue(2);
  });

  it("closes open reports for a story as reviewed", async () => {
    const { POST } =
      await import("@/app/api/admin/public-stories/[id]/reports/route");
    const res = await POST(
      new NextRequest(
        "http://localhost/api/admin/public-stories/story-1/reports",
        {
          method: "POST",
          body: JSON.stringify({ action: "reviewed" }),
        }
      ),
      { params: Promise.resolve({ id: "story-1" }) }
    );

    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({ closed: 2 });
    expect(mockDb.publicStoryReports.closeForStory).toHaveBeenCalledWith({
      storyId: "story-1",
      status: "reviewed",
      reviewedBy: "admin@storycot.test",
    });
    expect(mockDb.publicStoryModerationEvents.create).toHaveBeenCalledWith(
      expect.objectContaining({
        storyId: "story-1",
        actorUserId: "admin-1",
        actorLabel: "admin@storycot.test",
        action: "reports_reviewed",
        metadata: { closed: 2 },
      })
    );
  });

  it("delists a public story, closes reports, and notifies the owner", async () => {
    const { POST } =
      await import("@/app/api/admin/public-stories/[id]/delist/route");
    const res = await POST(
      new NextRequest(
        "http://localhost/api/admin/public-stories/story-1/delist",
        {
          method: "POST",
          body: JSON.stringify({ reason: "Contains a private school name." }),
        }
      ),
      { params: Promise.resolve({ id: "story-1" }) }
    );

    expect(res.status).toBe(200);
    expect(mockDb.stories.update).toHaveBeenCalledWith(
      "story-1",
      expect.objectContaining({
        visibility: "private",
        publicReviewStatus: "rejected",
        publicReviewedBy: "admin@storycot.test",
        publicRejectionReason: "Contains a private school name.",
      })
    );
    expect(mockDb.publicStoryReports.closeForStory).toHaveBeenCalledWith({
      storyId: "story-1",
      status: "reviewed",
      reviewedBy: "admin@storycot.test",
    });
    expect(mockNotifyPublicStoryOwner).toHaveBeenCalledWith(
      expect.objectContaining({
        subject:
          "Your Storycot story was removed from the gallery - Moon Garden",
        headline: "Your story was removed from the gallery",
      })
    );
    expect(mockDb.publicStoryModerationEvents.create).toHaveBeenCalledWith(
      expect.objectContaining({
        storyId: "story-1",
        actorUserId: "admin-1",
        actorLabel: "admin@storycot.test",
        action: "delisted",
        note: "Contains a private school name.",
      })
    );
  });

  it("requires a delist reason", async () => {
    const { POST } =
      await import("@/app/api/admin/public-stories/[id]/delist/route");
    const res = await POST(
      new NextRequest(
        "http://localhost/api/admin/public-stories/story-1/delist",
        {
          method: "POST",
          body: JSON.stringify({ reason: "" }),
        }
      ),
      { params: Promise.resolve({ id: "story-1" }) }
    );

    expect(res.status).toBe(400);
    expect(mockDb.stories.update).not.toHaveBeenCalled();
  });
});
