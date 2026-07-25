import { beforeEach, describe, expect, it } from "vitest";
import { createMemoryDb } from "@/tests/helpers/memoryDb";
import type { BookProject, BookBuildJob } from "@/types/printBook";

describe("db delete cascades", () => {
  let db: ReturnType<typeof createMemoryDb>;

  beforeEach(() => {
    db = createMemoryDb();
  });

  it("deleting a story also removes its book projects and build jobs", async () => {
    await db.stories.create({
      id: "story-1",
      userId: "user-1",
      title: "Test Story",
      profileId: "profile-1",
      profileName: "Bailey",
      pages: [],
      wordCount: 0,
      theme: "bravery",
      notes: "",
      shareToken: "share-1",
      createdAt: new Date().toISOString(),
    });

    const project: BookProject = {
      id: "book-1",
      userId: "user-1",
      sourceStoryId: "story-1",
      profileId: "profile-1",
      ageBand: "6-8",
      status: "ready",
      trimSize: "storycot-dynamic-square",
      pageCount: 24,
      spreadCount: 12,
      completedSpreads: 12,
      totalSpreads: 12,
      currentStageLabel: "Ready",
      beats: [],
      spreads: [],
      assets: { proofVersion: 0 },
      retryCount: 0,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    await db.bookProjects.create(project);

    const job: BookBuildJob = {
      id: "job-1",
      projectId: "book-1",
      userId: "user-1",
      mode: "full",
      status: "queued",
      step: 0,
      token: "tok",
      baseUrl: "http://localhost",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    await db.bookBuildJobs.create(job);

    await expect(db.stories.delete("story-1")).resolves.toBe(true);

    expect(await db.stories.getById("story-1")).toBeUndefined();
    expect(await db.bookProjects.getById("book-1")).toBeUndefined();
    expect(await db.bookBuildJobs.getById("job-1")).toBeUndefined();
  });

  it("claims a book ready email only once", async () => {
    const project: BookProject = {
      id: "book-1",
      userId: "user-1",
      sourceStoryId: "story-1",
      profileId: "profile-1",
      ageBand: "6-8",
      status: "ready",
      trimSize: "storycot-dynamic-square",
      pageCount: 24,
      spreadCount: 12,
      completedSpreads: 12,
      totalSpreads: 12,
      currentStageLabel: "Ready",
      beats: [],
      spreads: [],
      assets: { proofVersion: 0 },
      retryCount: 0,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    await db.bookProjects.create(project);

    const first = await db.bookProjects.claimReadyEmail(
      "book-1",
      "2026-07-22T00:00:00.000Z"
    );
    const second = await db.bookProjects.claimReadyEmail(
      "book-1",
      "2026-07-22T00:00:01.000Z"
    );

    expect(first?.assets.bookReadyEmailSentAt).toBe("2026-07-22T00:00:00.000Z");
    expect(second).toBeUndefined();
    const stored = await db.bookProjects.getById("book-1");
    expect(stored?.assets.bookReadyEmailSentAt).toBe(
      "2026-07-22T00:00:00.000Z"
    );
  });
});
