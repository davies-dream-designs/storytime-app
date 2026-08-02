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
  it("maps baby and toddler ages to finer-grained early bands", () => {
    const today = new Date();
    const sixMonthsAgo = new Date(
      today.getFullYear(),
      today.getMonth() - 6,
      today.getDate()
    );
    const eighteenMonthsAgo = new Date(
      today.getFullYear(),
      today.getMonth() - 18,
      today.getDate()
    );

    expect(
      inferAgeBand(
        createProfile({
          age: 0,
          dateOfBirth: sixMonthsAgo.toISOString().slice(0, 10),
        })
      )
    ).toBe("baby-drift");
    expect(
      inferAgeBand(
        createProfile({
          age: 1,
          dateOfBirth: eighteenMonthsAgo.toISOString().slice(0, 10),
        })
      )
    ).toBe("little-listener");
    expect(inferAgeBand(createProfile({ age: 2 }))).toBe("toddler-tale");
  });

  it("maps ages 3-5 to preschool bands", () => {
    expect(inferAgeBand(createProfile({ age: 3 }))).toBe("first-adventure");
    expect(inferAgeBand(createProfile({ age: 5 }))).toBe("preschool-story");
  });

  it("maps ages 6+ to big kid and young reader bands", () => {
    expect(inferAgeBand(createProfile({ age: 6 }))).toBe("big-kid-chapter");
    expect(inferAgeBand(createProfile({ age: 8 }))).toBe("big-kid-chapter");
    expect(inferAgeBand(createProfile({ age: 9 }))).toBe(
      "young-reader-classic"
    );
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
    ).toBe("little-listener");
  });
});

describe("inferBookAgeBand", () => {
  it("uses the selected story preset when present", () => {
    const toddler = createProfile({ age: 2 });

    expect(
      inferBookAgeBand({ profile: toddler, storyPreset: "baby-drift" })
    ).toBe("baby-drift");
    expect(
      inferBookAgeBand({ profile: toddler, storyPreset: "young-reader-long" })
    ).toBe("young-reader-long");
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
      "toddler-tale"
    );
    expect(inferBookAgeBand({ profile: createProfile({ age: 7 }) })).toBe(
      "big-kid-chapter"
    );
  });
});
