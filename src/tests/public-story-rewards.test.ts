import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockAdminIdentity, mockAdjustUserCredits, mockDb } = vi.hoisted(() => ({
  mockAdminIdentity: vi.fn(),
  mockAdjustUserCredits: vi.fn(),
  mockDb: {
    publicStoryVotes: {
      getVoteMonth: vi.fn(() => "2026-07"),
      leaderboard: vi.fn(),
    },
    publicStoryModerationEvents: {
      listRewardEventsForMonth: vi.fn(),
      listAllRewardedStoryIds: vi.fn(),
      create: vi.fn(),
    },
  },
}));

vi.mock("@/lib/adminAuth", () => ({ getAdminIdentity: mockAdminIdentity }));
vi.mock("@/lib/credits", () => ({ adjustUserCredits: mockAdjustUserCredits }));
vi.mock("@/lib/db", () => ({ db: mockDb }));

const makeStory = (id: string, userId: string, title: string) => ({
  id, userId, title, theme: "bravery",
});

const s1 = makeStory("story-1", "user-1", "Moon Garden");
const s2 = makeStory("story-2", "user-2", "Star River");
const s3 = makeStory("story-3", "user-3", "Cloud Castle");
const s4 = makeStory("story-4", "user-4", "Sun Valley");

describe("admin public story rewards — top-3 tier system", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    mockAdminIdentity.mockResolvedValue({ userId: "admin-1", label: "admin@storycot.test" });
    mockDb.publicStoryVotes.getVoteMonth.mockReturnValue("2026-07");
    mockDb.publicStoryModerationEvents.listRewardEventsForMonth.mockResolvedValue([]);
    mockDb.publicStoryModerationEvents.listAllRewardedStoryIds.mockResolvedValue(new Set());
    mockDb.publicStoryVotes.leaderboard.mockResolvedValue([
      { story: s1, votes: 20 },
      { story: s2, votes: 15 },
      { story: s3, votes: 10 },
      { story: s4, votes: 5 },
    ]);
    mockAdjustUserCredits.mockResolvedValue(20);
  });

  it("awards top 3 with correct credit tiers (10/5/3)", async () => {
    const { POST } = await import("@/app/api/admin/public-story-rewards/award/route");
    const res = await POST();

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.awarded).toHaveLength(3);
    expect(body.awarded[0]).toMatchObject({ place: 1, storyId: "story-1", credits: 10 });
    expect(body.awarded[1]).toMatchObject({ place: 2, storyId: "story-2", credits: 5 });
    expect(body.awarded[2]).toMatchObject({ place: 3, storyId: "story-3", credits: 3 });
    expect(mockAdjustUserCredits).toHaveBeenCalledTimes(3);
    expect(mockAdjustUserCredits).toHaveBeenCalledWith("user-1", 10);
    expect(mockAdjustUserCredits).toHaveBeenCalledWith("user-2", 5);
    expect(mockAdjustUserCredits).toHaveBeenCalledWith("user-3", 3);
  });

  it("records moderation events with place metadata", async () => {
    const { POST } = await import("@/app/api/admin/public-story-rewards/award/route");
    await POST();

    expect(mockDb.publicStoryModerationEvents.create).toHaveBeenCalledWith(
      expect.objectContaining({
        storyId: "story-1",
        action: "reward_granted",
        metadata: expect.objectContaining({
          voteMonth: "2026-07",
          place: 1,
          credits: 10,
        }),
      })
    );
  });

  it("is idempotent — second run returns empty awarded and skips all", async () => {
    mockDb.publicStoryModerationEvents.listRewardEventsForMonth.mockResolvedValue([
      { id: "e1", storyId: "story-1", action: "reward_granted",
        metadata: { voteMonth: "2026-07", place: 1 }, createdAt: "2026-07-28T00:00:00Z" },
    ]);

    const { POST } = await import("@/app/api/admin/public-story-rewards/award/route");
    const res = await POST();

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.awarded).toHaveLength(0);
    expect(body.skipped).toHaveLength(3);
    expect(body.skipped[0]).toMatchObject({ reason: "already_awarded_this_month" });
    expect(mockAdjustUserCredits).not.toHaveBeenCalled();
  });

  it("excludes stories that won in a previous month", async () => {
    // s1 and s2 won previously — only s3 and s4 are eligible
    mockDb.publicStoryModerationEvents.listAllRewardedStoryIds.mockResolvedValue(
      new Set(["story-1", "story-2"])
    );

    const { POST } = await import("@/app/api/admin/public-story-rewards/award/route");
    const res = await POST();

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.awarded).toHaveLength(2); // only s3 and s4 remain
    expect(body.awarded[0]).toMatchObject({ place: 1, storyId: "story-3", credits: 10 });
    expect(body.awarded[1]).toMatchObject({ place: 2, storyId: "story-4", credits: 5 });
    expect(body.skipped).toHaveLength(1);
    expect(body.skipped[0]).toMatchObject({ place: 3, reason: "no_eligible_story" });
  });

  it("skips places with no eligible stories", async () => {
    // Only one story in the leaderboard
    mockDb.publicStoryVotes.leaderboard.mockResolvedValue([
      { story: s1, votes: 5 },
    ]);

    const { POST } = await import("@/app/api/admin/public-story-rewards/award/route");
    const res = await POST();

    const body = await res.json();
    expect(body.awarded).toHaveLength(1);
    expect(body.skipped).toHaveLength(2);
    expect(body.skipped.every((s: { reason: string }) => s.reason === "no_eligible_story")).toBe(true);
  });

  it("returns 403 if not admin", async () => {
    mockAdminIdentity.mockResolvedValue(null);

    const { POST } = await import("@/app/api/admin/public-story-rewards/award/route");
    const res = await POST();

    expect(res.status).toBe(403);
    expect(mockAdjustUserCredits).not.toHaveBeenCalled();
  });
});
