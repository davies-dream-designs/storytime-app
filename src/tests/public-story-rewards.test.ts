import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockAdminIdentity, mockAdjustUserCredits, mockDb } = vi.hoisted(() => ({
  mockAdminIdentity: vi.fn(async () => ({
    userId: "admin-1",
    label: "admin@storycot.test",
  })),
  mockAdjustUserCredits: vi.fn(),
  mockDb: {
    publicStoryVotes: {
      getVoteMonth: vi.fn(() => "2026-07"),
      leaderboard: vi.fn(),
    },
    publicStoryModerationEvents: {
      listRewardEventsForMonth: vi.fn(),
      create: vi.fn(),
    },
  },
}));

vi.mock("@/lib/adminAuth", () => ({
  getAdminIdentity: mockAdminIdentity,
}));

vi.mock("@/lib/credits", () => ({
  adjustUserCredits: mockAdjustUserCredits,
}));

vi.mock("@/lib/db", () => ({
  db: mockDb,
}));

const topStory = {
  id: "story-1",
  userId: "creator-1",
  title: "Moon Garden",
  theme: "bravery",
};

describe("admin public story rewards", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    mockAdminIdentity.mockResolvedValue({
      userId: "admin-1",
      label: "admin@storycot.test",
    });
    mockDb.publicStoryVotes.getVoteMonth.mockReturnValue("2026-07");
    mockDb.publicStoryModerationEvents.listRewardEventsForMonth.mockResolvedValue(
      []
    );
    mockDb.publicStoryVotes.leaderboard.mockResolvedValue([
      { story: topStory, votes: 12 },
    ]);
    mockAdjustUserCredits.mockResolvedValue(14);
  });

  it("awards each monthly category winner once", async () => {
    const { POST } =
      await import("@/app/api/admin/public-story-rewards/award/route");
    const res = await POST();

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.awarded).toHaveLength(6);
    expect(mockAdjustUserCredits).toHaveBeenCalledTimes(6);
    expect(mockAdjustUserCredits).toHaveBeenCalledWith("creator-1", 8);
    expect(mockAdjustUserCredits).toHaveBeenCalledWith("creator-1", 3);
    expect(mockDb.publicStoryModerationEvents.create).toHaveBeenCalledWith(
      expect.objectContaining({
        storyId: "story-1",
        actorUserId: "admin-1",
        actorLabel: "admin@storycot.test",
        action: "reward_granted",
        metadata: expect.objectContaining({
          voteMonth: "2026-07",
          category: "all",
          credits: 8,
          votes: 12,
          userId: "creator-1",
        }),
      })
    );
  });

  it("skips categories already awarded for the month", async () => {
    mockDb.publicStoryModerationEvents.listRewardEventsForMonth.mockResolvedValue(
      [
        {
          id: "event-1",
          storyId: "story-1",
          actorUserId: "admin-1",
          actorLabel: "admin@storycot.test",
          action: "reward_granted",
          note: null,
          metadata: { voteMonth: "2026-07", category: "all" },
          createdAt: "2026-07-28T00:00:00.000Z",
        },
      ]
    );

    const { POST } =
      await import("@/app/api/admin/public-story-rewards/award/route");
    const res = await POST();

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.awarded).toHaveLength(5);
    expect(body.skipped).toContainEqual({
      category: "all",
      reason: "already_awarded",
    });
    expect(mockAdjustUserCredits).toHaveBeenCalledTimes(5);
  });
});
