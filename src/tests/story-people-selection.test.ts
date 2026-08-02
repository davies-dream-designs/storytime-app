import { describe, expect, it, vi } from "vitest";
import { getSelectedStoryPeople } from "@/lib/storyPeopleSelection";

const { mockPeople } = vi.hoisted(() => ({
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
}));

vi.mock("@/lib/db", () => ({
  db: {
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
});
