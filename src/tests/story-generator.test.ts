import { describe, expect, it, vi } from "vitest";
import type { ChildProfile } from "@/types";
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
  });
});
