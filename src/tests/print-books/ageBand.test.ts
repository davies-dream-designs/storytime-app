import { describe, expect, it } from "vitest";
import { inferAgeBand, inferBookAgeBand } from "@/lib/print-books/ageBand";
import type { ChildProfile } from "@/types";

function createProfile(overrides: Partial<ChildProfile>): ChildProfile {
  return {
    id: "profile-1",
    userId: "user-1",
    name: "Milo",
    age: 3,
    favouriteCharacters: [],
    favouriteActivities: [],
    favouriteAnimals: [],
    favouritePlaces: [],
    lessons: [],
    createdAt: "2026-07-15T00:00:00.000Z",
    ...overrides,
  };
}

describe("inferAgeBand", () => {
  it("maps ages 0-2 to the youngest band", () => {
    expect(inferAgeBand(createProfile({ age: 0 }))).toBe("0-2");
    expect(inferAgeBand(createProfile({ age: 2 }))).toBe("0-2");
  });

  it("maps ages 3-5 to the middle band", () => {
    expect(inferAgeBand(createProfile({ age: 3 }))).toBe("3-5");
    expect(inferAgeBand(createProfile({ age: 5 }))).toBe("3-5");
  });

  it("maps ages 6+ to the oldest v1 band", () => {
    expect(inferAgeBand(createProfile({ age: 6 }))).toBe("6-8");
    expect(inferAgeBand(createProfile({ age: 8 }))).toBe("6-8");
  });

  it("uses dateOfBirth-derived age when present", () => {
    const today = new Date();
    const dob = new Date(
      today.getFullYear() - 1,
      today.getMonth(),
      today.getDate()
    );
    expect(
      inferAgeBand(
        createProfile({
          age: 8,
          dateOfBirth: dob.toISOString().slice(0, 10),
        })
      )
    ).toBe("0-2");
  });
});

describe("inferBookAgeBand", () => {
  it("uses the selected story preset when present", () => {
    const toddler = createProfile({ age: 2 });

    expect(
      inferBookAgeBand({ profile: toddler, storyPreset: "tiny-tales" })
    ).toBe("0-2");
    expect(
      inferBookAgeBand({ profile: toddler, storyPreset: "moonlit-adventures" })
    ).toBe("3-5");
    expect(
      inferBookAgeBand({ profile: toddler, storyPreset: "epic-sagas" })
    ).toBe("6-8");
  });

  it("falls back to the child age when no preset is stored", () => {
    expect(inferBookAgeBand({ profile: createProfile({ age: 2 }) })).toBe(
      "0-2"
    );
    expect(inferBookAgeBand({ profile: createProfile({ age: 7 }) })).toBe(
      "6-8"
    );
  });
});
