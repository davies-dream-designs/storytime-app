import { beforeEach, describe, expect, it } from "vitest";
import { createMemoryDb } from "@/tests/helpers/memoryDb";
import type { Story } from "@/types";

function makeStory(overrides: Partial<Story> = {}): Story {
  return {
    id: "story-1",
    userId: "user-1",
    title: "Weaving your story...",
    profileId: "profile-1",
    profileName: "Bailey",
    pages: [],
    wordCount: 0,
    theme: "kindness",
    notes: "",
    createdAt: "2026-07-15T00:00:00.000Z",
    status: "generating",
    ...overrides,
  };
}

describe("db.stories.claimGeneration", () => {
  let db: ReturnType<typeof createMemoryDb>;

  beforeEach(async () => {
    db = createMemoryDb();
    await db.stories.create(makeStory());
  });

  const now = "2026-07-15T01:00:00.000Z";
  const staleBefore = "2026-07-15T00:58:00.000Z"; // now - 2min

  it("claims an unclaimed generating story", async () => {
    const claimed = await db.stories.claimGeneration(
      "story-1",
      "stream:1",
      now,
      staleBefore
    );
    expect(claimed?.generationJobId).toBe("stream:1");
    expect(claimed?.generationClaimedAt).toBe(now);
  });

  it("refuses to claim a story a fresh generator already owns", async () => {
    await db.stories.claimGeneration("story-1", "stream:1", now, staleBefore);
    const second = await db.stories.claimGeneration(
      "story-1",
      "inngest:2",
      "2026-07-15T01:00:30.000Z",
      "2026-07-15T00:58:30.000Z"
    );
    expect(second).toBeUndefined();
  });

  it("takes over a stale claim so a wedged generator can be retried", async () => {
    await db.stories.update("story-1", {
      generationJobId: "stream:old",
      generationClaimedAt: "2026-07-15T00:50:00.000Z", // older than staleBefore
    });
    const takeover = await db.stories.claimGeneration(
      "story-1",
      "inngest:2",
      now,
      staleBefore
    );
    expect(takeover?.generationJobId).toBe("inngest:2");
  });

  it("never claims a story that is already terminal", async () => {
    await db.stories.update("story-1", { status: "ready" });
    const claimed = await db.stories.claimGeneration(
      "story-1",
      "inngest:2",
      now,
      staleBefore
    );
    expect(claimed).toBeUndefined();
  });
});
