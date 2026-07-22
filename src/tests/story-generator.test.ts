import { describe, expect, it, vi } from "vitest";
import type { ChildProfile, Character } from "@/types";
import { buildStoryPrompt } from "@/lib/storyGenerator";

vi.mock("@anthropic-ai/sdk", () => ({
  default: vi.fn(() => ({})),
}));

function createProfile(): ChildProfile {
  return {
    id: "profile-1",
    userId: "user-1",
    name: "Bailey",
    age: 4,
    favouriteCharacters: ["Bluey", "Bingo"],
    favouriteActivities: ["pond walks"],
    favouriteAnimals: ["fish"],
    favouritePlaces: ["garden"],
    lessons: ["kindness"],
    createdAt: "2026-07-15T00:00:00.000Z",
  };
}

describe("buildStoryPrompt", () => {
  it("adds moderation-aware guardrails for story and illustration generation", () => {
    const prompt = buildStoryPrompt({
      profile: createProfile(),
      characters: [],
      theme: "kindness",
      notes: "",
      storyPreset: "moonlit-adventures",
      locale: "en",
    });

    expect(prompt).toContain("image-safe");
    expect(prompt).toContain("visibly clothed");
    expect(prompt).toContain("trusted adult nearby");
    expect(prompt).toContain("Do not quote story prose");
    expect(prompt).toContain("no bathing, toilets, undressing");
    expect(prompt).toContain("Do not focus illustration prompts on feet");
    expect(prompt).toContain("no text in image");
    expect(prompt).toContain("IP originality requirements");
    expect(prompt).toContain("Do not use or imitate existing franchises");
  });

  it("does not include saved characters that look like protected source material", () => {
    const characters: Character[] = [
      {
        id: "character-1",
        userId: "user-1",
        profileId: "profile-1",
        name: "Bluey",
        description: "A blue cartoon puppy from a TV show.",
        personality: "Playful",
        appearance: "Looks exactly like the famous character.",
        createdAt: "2026-07-15T00:00:00.000Z",
      },
      {
        id: "character-2",
        userId: "user-1",
        profileId: "profile-1",
        name: "Pip",
        description: "Bailey's handmade moon fox.",
        personality: "Gentle and curious",
        appearance: "Silver fur, star scarf, round glasses.",
        createdAt: "2026-07-15T00:00:00.000Z",
      },
    ];

    const prompt = buildStoryPrompt({
      profile: createProfile(),
      characters,
      theme: "kindness",
      notes: "",
      storyPreset: "moonlit-adventures",
      locale: "en",
    });

    expect(prompt).not.toContain("Bluey");
    expect(prompt).toContain("Pip");
  });
});
