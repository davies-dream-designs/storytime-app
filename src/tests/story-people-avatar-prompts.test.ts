import { describe, expect, it } from "vitest";
import {
  buildChildProfileAvatarPrompt,
  buildStoryPersonAvatarPrompt,
} from "@/lib/storyPeopleAvatars";
import type { ChildProfile, StoryPerson } from "@/types";

describe("story people avatar prompts", () => {
  it("does not pass display names, pronoun values, or label-removal text into family reference image prompts", () => {
    const person: StoryPerson = {
      id: "person-1",
      userId: "user-1",
      name: "Mumma",
      relationship: "parent",
      bodyBuild: "large",
      ageGroup: "adult",
      height: "tall",
      description: "Kind bedtime helper",
      personality: "gentle and funny",
      appearance: "Warm smile and short brown hair.",
      pronouns: "he/her",
      availableToAllProfiles: true,
      profileIds: [],
      createdAt: "2026-08-02T00:00:00.000Z",
      updatedAt: "2026-08-02T00:00:00.000Z",
    };

    const prompt = buildStoryPersonAvatarPrompt(
      person,
      "remove mumma and he/her text"
    );

    expect(prompt).not.toMatch(/Mumma|he\/her|Display name|Pronouns:/i);
    expect(prompt).toContain("Age group context: Adult.");
    expect(prompt).toContain("Height context: Tall.");
    expect(prompt).toContain("Body build context: Large.");
    expect(prompt).toContain("remove all visible writing");
    expect(prompt).toContain("Do not include any written words");
    expect(prompt).toContain("Show only the named subject");
  });

  it("does not pass child names, exact ages, or gender values into child reference image prompts", () => {
    const profile: ChildProfile = {
      id: "profile-1",
      userId: "user-1",
      name: "Levi",
      age: 2,
      gender: "boy",
      appearance: {
        bodyBuild: "broad",
        hairStyles: [],
        featureEmphasis: [],
        distinguishingFeatures: [],
        expressionVibes: [],
      },
      favouriteCharacters: [],
      favouriteActivities: [],
      favouriteAnimals: [],
      favouritePlaces: [],
      lessons: [],
      createdAt: "2026-08-02T00:00:00.000Z",
    };

    const prompt = buildChildProfileAvatarPrompt(
      profile,
      {
        appearance:
          "short reddish-blonde hair, brown eyes, teal top, navy socks",
        appearanceSummary: "Toddler with reddish-blonde hair.",
      },
      "remove Age: 2"
    );

    expect(prompt).not.toMatch(/Levi|Age:\s*2|Gender\/pronoun setting|boy/i);
    expect(prompt).toContain("Body build context: Broad.");
    expect(prompt).toContain("toddler proportions");
    expect(prompt).toContain("upper chest to top of head");
    expect(prompt).toContain("Do not create a full-body");
    expect(prompt).toContain("remove all visible writing");
    expect(prompt).toContain("Do not include any written words");
    expect(prompt).toContain("Show only the child");
  });
});
