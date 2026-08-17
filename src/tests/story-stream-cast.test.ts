import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const CHILD_CAST_ID = "child:profile-2";

const { mockAuth, mockClerkClient, mockDb, mockStreamStory } = vi.hoisted(() => ({
  mockAuth: vi.fn(async () => ({ userId: "user-1" })),
  mockClerkClient: vi.fn(),
  mockDb: {
    stories: {
      getById: vi.fn(),
      getByProfileId: vi.fn(),
      update: vi.fn(),
    },
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
  },
  mockStreamStory: vi.fn(),
}));

vi.mock("@clerk/nextjs/server", () => ({
  auth: mockAuth,
  clerkClient: mockClerkClient,
}));

vi.mock("@/lib/db", () => ({
  db: mockDb,
}));

vi.mock("@vercel/kv", () => ({
  kv: { del: vi.fn() },
}));

vi.mock("@/lib/storyGenerator", () => ({
  StoryGenerationError: class StoryGenerationError extends Error {},
  streamStory: mockStreamStory,
}));

vi.mock("@/lib/ipGuardrails", () => ({
  assessGeneratedStoryIp: vi.fn(() => ({ riskLevel: "clear", printAllowed: true })),
  assessProfileIp: vi.fn(() => ({ printAllowed: true })),
  profileIpErrorResponse: vi.fn(() => ({ error: "blocked" })),
}));

vi.mock("@/lib/logEvent", () => ({ logEvent: vi.fn() }));
vi.mock("@/lib/ratelimit", () => ({
  storyRatelimit: {},
  checkRatelimit: vi.fn(async () => null),
}));

describe("POST /api/stories/[id]/stream cast continuity", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    process.env.ANTHROPIC_API_KEY = "test-key";
    mockAuth.mockResolvedValue({ userId: "user-1" });
    mockClerkClient.mockResolvedValue({
      users: {
        getUser: vi.fn().mockResolvedValue({
          privateMetadata: { credits: 3 },
          primaryEmailAddress: { emailAddress: "parent@example.com" },
        }),
        updateUserMetadata: vi.fn().mockResolvedValue(undefined),
      },
    });
    mockDb.stories.getById.mockResolvedValue({
      id: "story-1",
      userId: "user-1",
      title: "Weaving your story...",
      profileId: "profile-1",
      profileName: "Bailey",
      pages: [],
      wordCount: 0,
      theme: "kindness",
      notes: "",
      storyPreset: "preschool-story",
      storyPersonIds: [CHILD_CAST_ID, "person-1"],
      createdAt: "2026-07-15T00:00:00.000Z",
      status: "generating",
    });
    mockDb.stories.getByProfileId.mockResolvedValue([]);
    mockDb.stories.update.mockImplementation(async (_id: string, updates: object) => ({
      id: "story-1",
      ...updates,
    }));
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
    mockDb.characters.getByProfileId.mockResolvedValue([]);
    mockStreamStory.mockImplementation(async (input) => ({
      title: "Bailey and Mila",
      pages: [
        {
          pageNumber: 1,
          text: `Bailey and ${input.storyPeople.map((person: { name: string }) => person.name).join(" and ")} waved goodnight.`,
          illustrationPrompt: "A cozy bedtime wave.",
        },
      ],
    }));
  });

  it("rehydrates child-profile cast ids when streaming a persisted story", async () => {
    const { POST } = await import("@/app/api/stories/[id]/stream/route");
    const response = await POST(
      new NextRequest("http://localhost/api/stories/story-1/stream?locale=en", {
        method: "POST",
      }),
      { params: Promise.resolve({ id: "story-1" }) }
    );

    await response.text();

    expect(mockDb.profiles.getByUserId).toHaveBeenCalledWith("user-1");
    expect(mockStreamStory).toHaveBeenCalledTimes(1);
    const storyPeople = mockStreamStory.mock.calls[0]?.[0]?.storyPeople ?? [];
    expect(storyPeople.map((person: { id: string }) => person.id)).toEqual([
      "person-1",
      CHILD_CAST_ID,
    ]);
    expect(storyPeople.map((person: { name: string }) => person.name)).toEqual([
      "Nanna Jo",
      "Mila",
    ]);
  });
});
