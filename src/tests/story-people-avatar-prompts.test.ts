import { describe, expect, it } from "vitest";
import {
  buildChildProfileDescriptionAvatarPrompt,
  buildChildProfileAvatarPrompt,
  buildStoryPersonDescriptionAvatarPrompt,
  buildStoryPersonAvatarPrompt,
  buildRedoFidelityInstruction,
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

  it("builds a description-only family reference prompt without visible labels", () => {
    const person: StoryPerson = {
      id: "person-1",
      userId: "user-1",
      name: "Glenpa",
      relationship: "grandparent",
      bodyBuild: "large",
      ageGroup: "adult",
      height: "tall",
      description: "Reads quiet bedtime stories",
      personality: "warm and silly",
      appearance: "Grey hair in a neat man bun, rectangular glasses, cream top.",
      pronouns: "he/him",
      availableToAllProfiles: true,
      profileIds: [],
      createdAt: "2026-08-02T00:00:00.000Z",
      updatedAt: "2026-08-02T00:00:00.000Z",
    };

    const prompt = buildStoryPersonDescriptionAvatarPrompt(person);

    expect(prompt).not.toMatch(/Glenpa|he\/him|Name:|Pronouns:/i);
    expect(prompt).toContain("Current appearance description");
    expect(prompt).toContain("Grey hair in a neat man bun");
    expect(prompt).toContain("Because no source photo is supplied");
    expect(prompt).toContain("No text, captions, name labels");
  });

  it("builds a description-only child reference prompt from profile appearance", () => {
    const profile: ChildProfile = {
      id: "profile-1",
      userId: "user-1",
      name: "Levi",
      age: 1,
      gender: "boy",
      appearance: {
        hairColor: "red",
        hairLength: "short",
        eyeColor: "brown",
        clothingVibe: "pajamas",
        bodyBuild: "average",
        hairStyles: [],
        featureEmphasis: [],
        distinguishingFeatures: [],
        expressionVibes: ["calm"],
      },
      favouriteCharacters: [],
      favouriteActivities: [],
      favouriteAnimals: [],
      favouritePlaces: [],
      lessons: [],
      createdAt: "2026-08-02T00:00:00.000Z",
    };

    const prompt = buildChildProfileDescriptionAvatarPrompt(profile);

    expect(prompt).not.toMatch(/Levi|boy|Name:|Pronouns:/i);
    expect(prompt).toContain("Current profile appearance");
    expect(prompt).toContain("red short hair");
    expect(prompt).toContain("Because no source photo is supplied");
    expect(prompt).toContain("upper chest to top of head");
  });

  describe("identity locks (hair colour + eyeglasses)", () => {
    const person: StoryPerson = {
      id: "person-1",
      userId: "user-1",
      name: "Dad",
      relationship: "parent",
      ageGroup: "adult",
      description: "",
      personality: "",
      appearance: "Dark brown hair, short beard, clear-framed glasses.",
      availableToAllProfiles: true,
      profileIds: [],
      createdAt: "2026-08-02T00:00:00.000Z",
      updatedAt: "2026-08-02T00:00:00.000Z",
    };
    const profile: ChildProfile = {
      id: "profile-1",
      userId: "user-1",
      name: "Levi",
      age: 4,
      gender: "boy",
      appearance: {
        hairColor: "dark_brown",
        hairStyles: [],
        featureEmphasis: [],
        distinguishingFeatures: ["glasses"],
        expressionVibes: [],
      },
      favouriteCharacters: [],
      favouriteActivities: [],
      favouriteAnimals: [],
      favouritePlaces: [],
      lessons: [],
      createdAt: "2026-08-02T00:00:00.000Z",
    };
    const analysis = {
      appearance: "dark brown hair, short beard, clear-framed rectangular glasses",
      appearanceSummary: "Adult with dark brown hair and clear glasses.",
    };

    it("locks hair colour and glasses in the photo-based family prompt", () => {
      const prompt = buildStoryPersonAvatarPrompt(person);
      expect(prompt).toContain("Identity lock, highest priority");
      expect(prompt).toMatch(/never warm-tint|Never warm-tint/);
      expect(prompt).toContain("never remove or omit them");
      expect(prompt).toMatch(
        /apply the warm Storycot palette only to background, clothing, and lighting/i
      );
    });

    it("locks hair colour and glasses in the photo-based child prompt", () => {
      const prompt = buildChildProfileAvatarPrompt(profile, analysis);
      expect(prompt).toContain("Identity lock, highest priority");
      expect(prompt).toContain("never remove or omit them");
    });

    it("locks hair colour and glasses in the description-only prompts", () => {
      expect(buildStoryPersonDescriptionAvatarPrompt(person)).toContain(
        "Identity lock, highest priority"
      );
      expect(buildChildProfileDescriptionAvatarPrompt(profile)).toContain(
        "Identity lock, highest priority"
      );
    });

    it("does not let the family reference infer body size from baggy clothing or occluding people", () => {
      const prompt = buildStoryPersonAvatarPrompt(person);
      expect(prompt).toContain(
        "Do not infer a larger body from loose, baggy, oversized, or bulky clothing"
      );
      expect(prompt).toContain("do not add bulk where they were");
    });
  });

  describe("redo fidelity (body build preservation)", () => {
    it("preserves body build and forbids bulk-fill for non-size corrections", () => {
      const instruction = buildRedoFidelityInstruction("remove the child");
      expect(instruction).toContain(
        "keep the subject's body build, face width, torso width, and proportions the same"
      );
      expect(instruction).toContain(
        "do not invent a larger body to fill the space the removed subject occupied"
      );
      expect(instruction).not.toContain("even when that means changing body build");
    });

    it("still allows body-build changes when the correction asks for them", () => {
      expect(buildRedoFidelityInstruction("make her slimmer")).toContain(
        "even when that means changing body build"
      );
      expect(buildRedoFidelityInstruction("very large plus-size build")).toContain(
        "even when that means changing body build"
      );
    });
  });
});
