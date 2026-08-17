import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const CHILD_CAST_ID = "child:profile-2";

const { mockAuth, mockClerkClient, mockDb } = vi.hoisted(() => ({
  mockAuth: vi.fn(async () => ({ userId: "user-1" })),
  mockClerkClient: vi.fn(),
  mockDb: {
    profiles: {
      getById: vi.fn(),
      getByUserId: vi.fn(),
    },
    storyPeople: {
      getByIds: vi.fn(),
    },
    characters: {
      getByProfileId: vi.fn(),
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
    mockClerkClient.mockResolvedValue({
      users: {
        getUser: vi.fn().mockResolvedValue({
          privateMetadata: { credits: 3 },
        }),
      },
    });
    mockDb.profiles.getById.mockResolvedValue({
      id: "profile-1",
      userId: "user-1",
      name: "Bailey",
      age: 4,
      favouriteCharacters: [],
      favouriteActivities: [],
      favouriteAnimals: [],
      favouritePlaces: [],
      lessons: [],
      createdAt: "2026-07-15T00:00:00.000Z",
    });
    mockDb.profiles.getByUserId.mockResolvedValue([
      {
        id: "profile-1",
        userId: "user-1",
        name: "Bailey",
        age: 4,
        favouriteCharacters: [],
        favouriteActivities: [],
        favouriteAnimals: [],
        favouritePlaces: [],
        lessons: [],
        createdAt: "2026-07-15T00:00:00.000Z",
      },
      {
        id: "profile-2",
        userId: "user-1",
        name: "Mila",
        age: 6,
        avatarImageUrl: "https://assets.example.com/mila-avatar.jpg",
        favouriteCharacters: [],
        favouriteActivities: ["painting"],
        favouriteAnimals: [],
        favouritePlaces: [],
        lessons: ["kindness"],
        createdAt: "2026-07-15T00:00:00.000Z",
      },
    ]);
    mockDb.storyPeople.getByIds.mockResolvedValue([]);
    mockDb.characters.getByProfileId.mockResolvedValue([]);
    process.env.ANTHROPIC_API_KEY = "test-key";
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

  it("stores protected-source ideas as originalized story prompts", async () => {
    const { POST } = await import("@/app/api/stories/start/route");
    const res = await POST(
      new NextRequest("http://localhost/api/stories/start", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          profileId: "profile-1",
          premise: "A Toy Story adventure with Woody.",
        }),
      })
    );

    expect(res.status).toBe(201);
    const storedStory = mockDb.stories.create.mock.calls[0]?.[0];
    expect(storedStory).toMatchObject({
      premise: expect.stringContaining("Create an original Storycot adventure"),
      ipPolicy: expect.objectContaining({
        riskLevel: "originalized",
        printAllowed: true,
      }),
    });
    expect(storedStory.premise).not.toContain("Toy Story");
    expect(storedStory.premise).not.toContain("Woody");
  });

  it("rejects protected references saved on the child profile", async () => {
    mockDb.profiles.getById.mockResolvedValue({
      id: "profile-1",
      userId: "user-1",
      name: "Bailey",
      age: 4,
      favouriteCharacters: ["Buzz Lightyear"],
      favouriteActivities: [],
      favouriteAnimals: [],
      favouritePlaces: [],
      lessons: [],
      createdAt: "2026-07-15T00:00:00.000Z",
    });

    const { POST } = await import("@/app/api/stories/start/route");
    const res = await POST(
      new NextRequest("http://localhost/api/stories/start", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          profileId: "profile-1",
          premise: "A gentle bedtime story.",
        }),
      })
    );

    expect(res.status).toBe(400);
    await expect(res.json()).resolves.toMatchObject({
      code: "story_idea_not_allowed",
      category: "protected_ip",
      error: expect.stringContaining("child profile"),
    });
    expect(mockDb.stories.create).not.toHaveBeenCalled();
  });

  it("persists the selected cast ids on the story record", async () => {
    mockDb.storyPeople.getByIds.mockResolvedValue([
      {
        id: "person-1",
        userId: "user-1",
        name: "Nanna Jo",
        relationship: "grandparent",
        description: "A calm bedtime storyteller.",
        personality: "Warm and patient",
        appearance: "Silver hair and purple glasses.",
        availableToAllProfiles: true,
        profileIds: [],
        createdAt: "2026-07-15T00:00:00.000Z",
        updatedAt: "2026-07-15T00:00:00.000Z",
      },
    ]);

    const { POST } = await import("@/app/api/stories/start/route");
    const res = await POST(
      new NextRequest("http://localhost/api/stories/start", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          profileId: "profile-1",
          premise: "A gentle story with Bailey, Mila, and Nanna Jo.",
          storyPersonIds: [CHILD_CAST_ID, "person-1"],
        }),
      })
    );

    expect(res.status).toBe(201);
    const storedStory = mockDb.stories.create.mock.calls.at(-1)?.[0];
    expect(storedStory.storyPersonIds).toEqual(["person-1", CHILD_CAST_ID]);
  });
});
