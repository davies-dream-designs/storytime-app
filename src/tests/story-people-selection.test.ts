import { describe, expect, it, vi } from "vitest";
import {
  buildChildCastId,
  getSelectedStoryPeople,
} from "@/lib/storyPeopleSelection";

const { mockPeople, mockProfiles } = vi.hoisted(() => ({
  mockPeople: [
    {
      id: "mum",
      userId: "user-1",
      name: "Mum",
      relationship: "mum",
      description: "A warm bedtime helper.",
      personality: "Calm",
      appearance: "Dark curls.",
      availableToAllProfiles: true,
      profileIds: [],
      createdAt: "2026-07-15T00:00:00.000Z",
      updatedAt: "2026-07-15T00:00:00.000Z",
    },
    {
      id: "friend",
      userId: "user-1",
      name: "Sam",
      relationship: "friend",
      description: "A school friend.",
      personality: "Funny",
      appearance: "Green jumper.",
      availableToAllProfiles: false,
      profileIds: ["profile-2"],
      createdAt: "2026-07-15T00:00:00.000Z",
      updatedAt: "2026-07-15T00:00:00.000Z",
    },
  ],
  mockProfiles: [
    {
      id: "profile-1",
      userId: "user-1",
      name: "Levi",
      age: 2,
      appearanceSummary: "Short fair hair and a cheerful smile.",
      favouriteCharacters: [],
      favouriteActivities: ["building blocks"],
      favouriteAnimals: [],
      favouritePlaces: [],
      lessons: ["sharing"],
      createdAt: "2026-07-15T00:00:00.000Z",
    },
    {
      id: "profile-2",
      userId: "user-1",
      name: "Mila",
      age: 4,
      avatarImageUrl: "https://assets.example.com/mila-avatar.jpg",
      favouriteCharacters: [],
      favouriteActivities: ["painting"],
      favouriteAnimals: [],
      favouritePlaces: [],
      lessons: ["kindness"],
      createdAt: "2026-07-15T00:00:00.000Z",
    },
  ],
}));

vi.mock("@/lib/db", () => ({
  db: {
    profiles: {
      getByUserId: vi.fn(async (userId: string) =>
        mockProfiles.filter((profile) => profile.userId === userId)
      ),
    },
    storyPeople: {
      getByIds: vi.fn(async (ids: string[], userId: string) =>
        mockPeople.filter(
          (person) => person.userId === userId && ids.includes(person.id)
        )
      ),
    },
  },
}));

describe("getSelectedStoryPeople", () => {
  it("keeps all-child people and filters people not linked to the child", async () => {
    await expect(
      getSelectedStoryPeople({
        userId: "user-1",
        profileId: "profile-1",
        storyPersonIds: ["mum", "friend"],
      })
    ).resolves.toEqual([mockPeople[0]]);
  });

  it("deduplicates and ignores non-string ids", async () => {
    const people = await getSelectedStoryPeople({
      userId: "user-1",
      profileId: "profile-2",
      storyPersonIds: ["mum", "mum", 123, "friend"],
    });

    expect(people.map((person) => person.id)).toEqual(["mum", "friend"]);
  });

  it("maps other child profiles into selectable story cast members", async () => {
    const people = await getSelectedStoryPeople({
      userId: "user-1",
      profileId: "profile-1",
      storyPersonIds: [
        buildChildCastId("profile-2"),
        buildChildCastId("profile-1"),
      ],
    });

    expect(people).toEqual([
      expect.objectContaining({
        id: buildChildCastId("profile-2"),
        name: "Mila",
        relationship: "sibling",
        avatarImageUrl: "https://assets.example.com/mila-avatar.jpg",
        description: "Another child profile on this account, 4 years old.",
        personality: "kindness, painting",
      }),
    ]);
  });
});
