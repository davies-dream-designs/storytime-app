import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const { mockAuth, mockDb, mockNotifyPublicStoryOwner } = vi.hoisted(() => ({
  mockAuth: vi.fn(async () => ({ userId: "reader-1" })),
  mockNotifyPublicStoryOwner: vi.fn(),
  mockDb: {
    stories: {
      getById: vi.fn(),
      update: vi.fn(),
    },
    publicStoryVotes: {
      create: vi.fn(),
      countByStoryIds: vi.fn(),
    },
    publicStoryReports: {
      create: vi.fn(),
      countOpenByStoryId: vi.fn(),
    },
    publicStoryModerationEvents: {
      create: vi.fn(),
    },
  },
}));

vi.mock("@clerk/nextjs/server", () => ({
  auth: mockAuth,
}));

vi.mock("@/lib/db", () => ({
  db: mockDb,
}));

vi.mock("@/lib/publicStoryNotifications", () => ({
  notifyPublicStoryOwner: mockNotifyPublicStoryOwner,
}));

const approvedStory = {
  id: "story-1",
  userId: "creator-1",
  title: "Moon Garden",
  status: "ready",
  visibility: "public",
  publicReviewStatus: "approved",
};

describe("public story actions", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    mockAuth.mockResolvedValue({ userId: "reader-1" });
    mockDb.stories.getById.mockResolvedValue(approvedStory);
    mockDb.stories.update.mockImplementation(async (_id, updates) => ({
      ...approvedStory,
      ...updates,
    }));
    mockDb.publicStoryVotes.create.mockResolvedValue(true);
    mockDb.publicStoryVotes.countByStoryIds.mockResolvedValue({ "story-1": 7 });
    mockDb.publicStoryReports.create.mockResolvedValue(true);
    mockDb.publicStoryReports.countOpenByStoryId.mockResolvedValue(1);
  });

  it("counts a signed-in vote for an approved public story", async () => {
    mockDb.publicStoryVotes.countByStoryIds.mockResolvedValue({ "story-1": 1 });
    const { POST } = await import("@/app/api/public-stories/[id]/vote/route");
    const res = await POST(
      new Request("http://localhost/api/public-stories/story-1/vote"),
      {
        params: Promise.resolve({ id: "story-1" }),
      }
    );

    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({
      voted: true,
      alreadyVoted: false,
      votes: 1,
    });
    expect(mockDb.publicStoryVotes.create).toHaveBeenCalledWith(
      "story-1",
      "reader-1"
    );
    expect(mockNotifyPublicStoryOwner).toHaveBeenCalledWith(
      expect.objectContaining({
        subject: "1 vote for your Storycot story",
        headline: "Your story has its first vote",
      })
    );
  });

  it("does not count votes from the story creator", async () => {
    mockAuth.mockResolvedValue({ userId: "creator-1" });

    const { POST } = await import("@/app/api/public-stories/[id]/vote/route");
    const res = await POST(
      new Request("http://localhost/api/public-stories/story-1/vote"),
      {
        params: Promise.resolve({ id: "story-1" }),
      }
    );

    expect(res.status).toBe(400);
    expect(mockDb.publicStoryVotes.create).not.toHaveBeenCalled();
  });

  it("records a signed-in report for an approved public story", async () => {
    const { POST } = await import("@/app/api/public-stories/[id]/report/route");
    const res = await POST(
      new NextRequest("http://localhost/api/public-stories/story-1/report", {
        method: "POST",
        body: JSON.stringify({ reason: "privacy", note: "Contains a school." }),
      }),
      { params: Promise.resolve({ id: "story-1" }) }
    );

    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({
      reported: true,
      alreadyReported: false,
      hiddenForReview: false,
    });
    expect(mockDb.publicStoryReports.create).toHaveBeenCalledWith({
      storyId: "story-1",
      userId: "reader-1",
      reason: "privacy",
      note: "Contains a school.",
    });
    expect(mockDb.publicStoryModerationEvents.create).toHaveBeenCalledWith(
      expect.objectContaining({
        storyId: "story-1",
        actorUserId: "reader-1",
        actorLabel: "reader",
        action: "reported",
        note: "privacy",
        metadata: { note: "Contains a school." },
      })
    );
  });

  it("auto-hides a story after three open reports", async () => {
    mockDb.publicStoryReports.countOpenByStoryId.mockResolvedValue(3);

    const { POST } = await import("@/app/api/public-stories/[id]/report/route");
    const res = await POST(
      new NextRequest("http://localhost/api/public-stories/story-1/report", {
        method: "POST",
        body: JSON.stringify({ reason: "unsafe" }),
      }),
      { params: Promise.resolve({ id: "story-1" }) }
    );

    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toMatchObject({
      hiddenForReview: true,
    });
    expect(mockDb.stories.update).toHaveBeenCalledWith(
      "story-1",
      expect.objectContaining({
        visibility: "private",
        publicReviewStatus: "pending_review",
      })
    );
    expect(mockNotifyPublicStoryOwner).toHaveBeenCalledWith(
      expect.objectContaining({
        subject: "Your Storycot story is back in review - Moon Garden",
        headline: "Your story is back in review",
      })
    );
    expect(mockDb.publicStoryModerationEvents.create).toHaveBeenCalledWith(
      expect.objectContaining({
        storyId: "story-1",
        actorLabel: "system",
        action: "auto_hidden",
        metadata: { openReportCount: 3 },
      })
    );
  });
});
