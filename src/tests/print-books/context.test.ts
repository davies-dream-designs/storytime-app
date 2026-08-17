import { beforeEach, describe, expect, it, vi } from "vitest";
import { createMemoryDb } from "@/tests/helpers/memoryDb";
import type { BookProject } from "@/types/printBook";

const CHILD_CAST_ID = "child:profile-2";

describe("loadBuildContext", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
  });

  it("reloads persisted story cast ids for book builds, including child-profile cast members", async () => {
    const memoryDb = createMemoryDb();
    vi.doMock("@/lib/db", () => ({ db: memoryDb }));

    const { loadBuildContext } = await import("@/lib/print-books/jobs/context");
    const { db } = await import("@/lib/db");

    await db.profiles.create({
      id: "profile-1",
      userId: "user-1",
      name: "Bailey",
      age: 4,
      avatarImageUrl: "https://assets.example.com/bailey-avatar.jpg",
      appearanceSummary: "Short fair hair and a cheerful smile.",
      favouriteCharacters: [],
      favouriteActivities: [],
      favouriteAnimals: [],
      favouritePlaces: [],
      lessons: [],
      createdAt: "2026-07-15T00:00:00.000Z",
    });
    await db.profiles.create({
      id: "profile-2",
      userId: "user-1",
      name: "Mila",
      age: 6,
      avatarImageUrl: "https://assets.example.com/mila-avatar.jpg",
      appearanceSummary: "Curly dark hair and bright brown eyes.",
      favouriteCharacters: [],
      favouriteActivities: ["painting"],
      favouriteAnimals: [],
      favouritePlaces: [],
      lessons: ["kindness"],
      createdAt: "2026-07-15T00:00:00.000Z",
    });
    await db.storyPeople.create({
      id: "person-1",
      userId: "user-1",
      name: "Nanna Jo",
      relationship: "grandparent",
      description: "A calm bedtime storyteller.",
      personality: "Warm and patient",
      appearance: "Silver hair and purple glasses.",
      avatarImageUrl: "https://assets.example.com/nanna-jo.jpg",
      availableToAllProfiles: true,
      profileIds: [],
      createdAt: "2026-07-15T00:00:00.000Z",
      updatedAt: "2026-07-15T00:00:00.000Z",
    });
    await db.stories.create({
      id: "story-1",
      userId: "user-1",
      title: "Bailey and Mila",
      profileId: "profile-1",
      profileName: "Bailey",
      pages: [],
      wordCount: 0,
      theme: "kindness",
      notes: "",
      storyPersonIds: ["person-1", CHILD_CAST_ID],
      createdAt: "2026-07-15T00:00:00.000Z",
      status: "ready",
    });

    const project: BookProject = {
      id: "book-1",
      userId: "user-1",
      sourceStoryId: "story-1",
      profileId: "profile-1",
      ageBand: "3-5",
      status: "queued",
      trimSize: "storycot-dynamic-square",
      pageCount: 28,
      spreadCount: 14,
      completedSpreads: 0,
      totalSpreads: 14,
      currentStageLabel: "Queued",
      beats: [],
      spreads: [],
      assets: { proofVersion: 1 },
      retryCount: 0,
      createdAt: "2026-07-15T00:00:00.000Z",
      updatedAt: "2026-07-15T00:00:00.000Z",
    };

    const context = await loadBuildContext(project);

    expect(context.storyPeople.map((person) => person.id)).toEqual([
      "person-1",
      CHILD_CAST_ID,
    ]);
    expect(context.storyPeople.map((person) => person.name)).toEqual([
      "Nanna Jo",
      "Mila",
    ]);
    expect(context.visualReferences.map((reference) => reference.name)).toEqual([
      "Bailey",
      "Nanna Jo",
      "Mila",
    ]);
  });
});
