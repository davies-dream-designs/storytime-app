import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ChildProfile, Story } from "@/types";
import type { CharacterBible } from "@/types/printBook";
import {
  buildIllustrationDirection,
  generateCharacterBible,
} from "@/lib/print-books/characterBible";

function bibleWithCompanion(): CharacterBible {
  return {
    childAppearance: "Bailey has short ginger hair and blue eyes.",
    outfitRules: "Blue tee, grey joggers, yellow boots.",
    recurringProps: ["speckled egg", "silver lantern"],
    companionCharacters: ["a small green baby dinosaur named Pip"],
    palette: "soft green garden tones",
    renderStyle: "storybook gouache",
    lightingTone: "warm afternoon",
    doNotChange: ["ginger hair"],
  };
}

describe("buildIllustrationDirection companion/prop gating", () => {
  it("shows all companions and props when no scene text is provided", () => {
    const direction = buildIllustrationDirection(bibleWithCompanion());
    expect(direction).toContain("baby dinosaur");
    expect(direction).toContain("speckled egg");
  });

  it("hides a companion the story text has not introduced yet", () => {
    const direction = buildIllustrationDirection(bibleWithCompanion(), {
      activeSceneText:
        "Bailey found a speckled egg in the garden and made a cosy nest.",
    });
    expect(direction).toContain("Companion characters: none");
    // The egg has appeared, so its prop is still allowed.
    expect(direction).toContain("speckled egg");
  });

  it("shows a companion once the story text introduces it", () => {
    const direction = buildIllustrationDirection(bibleWithCompanion(), {
      activeSceneText:
        "The egg cracked and a tiny dinosaur peeked out. Bailey named the dinosaur Pip.",
    });
    expect(direction).toContain("dinosaur");
    expect(direction).not.toContain("Companion characters: none");
  });

  it("does not trigger a companion on unrelated colour words in the scene", () => {
    const direction = buildIllustrationDirection(bibleWithCompanion(), {
      activeSceneText: "Bailey played in the green garden all afternoon.",
    });
    expect(direction).toContain("Companion characters: none");
  });
});

const { mockMessagesCreate } = vi.hoisted(() => ({
  mockMessagesCreate: vi.fn(),
}));

vi.mock("@anthropic-ai/sdk", () => ({
  default: vi.fn(() => ({
    messages: {
      create: mockMessagesCreate,
    },
  })),
}));

function createProfile(): ChildProfile {
  return {
    id: "profile-1",
    userId: "user-1",
    name: "Mila",
    age: 5,
    favouriteCharacters: ["Bunny"],
    favouriteActivities: ["painting"],
    favouriteAnimals: ["fox"],
    favouritePlaces: ["garden"],
    lessons: ["kindness"],
    createdAt: "2026-07-15T00:00:00.000Z",
  };
}

function createStory(pageCount = 12): Story {
  return {
    id: "story-1",
    userId: "user-1",
    title: "Moonlight Garden",
    profileId: "profile-1",
    profileName: "Mila",
    wordCount: 480,
    theme: "kindness",
    notes: "",
    storyPreset: "preschool-story",
    createdAt: "2026-07-15T00:00:00.000Z",
    pages: Array.from({ length: pageCount }, (_, index) => ({
      pageNumber: index + 1,
      text: `Later scene ${index + 1} with Mila following the moon path.`,
      illustrationPrompt: `Illustration prompt ${index + 1} with moon flowers and a sleepy fox.`,
    })),
  };
}

describe("generateCharacterBible", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("includes later story pages in the bible prompt context", async () => {
    mockMessagesCreate.mockResolvedValueOnce({
      content: [
        {
          type: "text",
          text: JSON.stringify({
            childAppearance: "Mila has curly dark hair and bright brown eyes.",
            outfitRules: "Keep Mila in a yellow cardigan over blue pajamas.",
            recurringProps: ["silver lantern"],
            companionCharacters: ["sleepy fox"],
            palette: "soft indigo, butter yellow, silver",
            renderStyle: "storybook gouache",
            lightingTone: "cozy moonlight",
            doNotChange: ["curly dark hair", "yellow cardigan"],
          }),
        },
      ],
    });

    await generateCharacterBible({
      profile: createProfile(),
      story: createStory(12),
      characters: [],
    });

    const prompt = mockMessagesCreate.mock.calls[0]?.[0].messages[0].content;
    expect(prompt).toContain("Page 12");
    expect(prompt).toContain("Later scene 12 with Mila following the moon path.");
    expect(prompt).toContain(
      "Illustration prompt 12 with moon flowers and a sleepy fox."
    );
  });
});
