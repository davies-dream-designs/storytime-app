import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ChildProfile, Story } from "@/types";
import { generateCharacterBible } from "@/lib/print-books/characterBible";

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
