import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ChildProfile, Character } from "@/types";
import {
  buildStoryPostCheckPrompt,
  buildStoryPrompt,
  generateStory,
  normalizeGeneratedStory,
  prepareGeneratedStoryForPostCheck,
  streamStory,
} from "@/lib/storyGenerator";

const { mockMessagesCreate, mockMessagesStream } = vi.hoisted(() => ({
  mockMessagesCreate: vi.fn(),
  mockMessagesStream: vi.fn(),
}));

vi.mock("@anthropic-ai/sdk", () => ({
  default: vi.fn(() => ({
    messages: {
      create: mockMessagesCreate,
      stream: mockMessagesStream,
    },
  })),
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

describe("story post-check", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("instructs the final editor to fix grammar, attribution, dashes, and IP leaks", () => {
    const prompt = buildStoryPostCheckPrompt(
      {
        profile: createProfile(),
        characters: [],
        theme: "kindness",
        notes: "",
        storyPreset: "moonlit-adventures",
        locale: "en",
      },
      {
        title: "Bailey and the Bluey Cave",
        pages: [
          {
            pageNumber: 1,
            text: "Bailey smiled — then Bluey said hello.",
            illustrationPrompt: "Bluey in a cosy cave.",
          },
        ],
      }
    );

    expect(prompt).toContain("Fix grammar, spelling, punctuation");
    expect(prompt).toContain("dialogue attribution accurate");
    expect(prompt).toContain("Bailey said");
    expect(prompt).toContain("Remove every em dash and en dash");
    expect(prompt).toContain("Remove or rewrite any surviving franchise");
    expect(prompt).toContain("valid JSON");
  });

  it("repairs malformed story JSON before surfacing a generation failure", async () => {
    mockMessagesCreate
      .mockResolvedValueOnce({
        content: [
          {
            type: "text",
            text: '{"title":"Bailey Moon","pages":[{"pageNumber":1,"text":"Bailey waved" "illustrationPrompt":"Bailey in a cosy room"}]}',
          },
        ],
      })
      .mockResolvedValueOnce({
        content: [
          {
            type: "text",
            text: JSON.stringify({
              title: "Bailey Moon",
              pages: [
                {
                  pageNumber: 1,
                  text: "Bailey waved.",
                  illustrationPrompt: "Bailey in a cosy room.",
                },
              ],
            }),
          },
        ],
      })
      .mockResolvedValueOnce({
        content: [
          {
            type: "text",
            text: JSON.stringify({
              title: "Bailey Moon",
              pages: [
                {
                  pageNumber: 1,
                  text: "Bailey waved.",
                  illustrationPrompt: "Bailey in a cosy room.",
                },
              ],
            }),
          },
        ],
      });

    await expect(
      generateStory({
        profile: createProfile(),
        characters: [],
        theme: "kindness",
        notes: "",
        storyPreset: "tiny-tales",
        locale: "en",
      })
    ).resolves.toEqual({
      title: "Bailey Moon",
      pages: [
        {
          pageNumber: 1,
          text: "Bailey waved.",
          illustrationPrompt: "Bailey in a cosy room.",
        },
      ],
    });
    expect(mockMessagesCreate).toHaveBeenCalledTimes(3);
    expect(mockMessagesCreate.mock.calls[1]?.[0].messages[0].content).toContain(
      "Repair this malformed Storycot story JSON"
    );
  });

  it("reports drafting and polishing stages while streaming a story", async () => {
    const generatedStory = {
      title: "Bailey Moon",
      pages: [
        {
          pageNumber: 1,
          text: "Bailey waved.",
          illustrationPrompt: "Bailey in a cosy room.",
        },
      ],
    };
    const stream = {
      on: vi.fn(
        (
          event: string,
          callback: (delta: string, snapshot: string) => void
        ) => {
          if (event === "text") {
            callback("", JSON.stringify(generatedStory));
          }
          return stream;
        }
      ),
      finalText: vi.fn(async () => JSON.stringify(generatedStory)),
    };
    mockMessagesStream.mockReturnValueOnce(stream);
    mockMessagesCreate.mockResolvedValueOnce({
      content: [
        {
          type: "text",
          text: JSON.stringify(generatedStory),
        },
      ],
    });
    const stages: string[] = [];
    const snapshots: string[][] = [];

    await expect(
      streamStory(
        {
          profile: createProfile(),
          characters: [],
          theme: "kindness",
          notes: "",
          storyPreset: "tiny-tales",
          locale: "en",
        },
        (pages) => snapshots.push(pages),
        (stage) => stages.push(stage)
      )
    ).resolves.toEqual(generatedStory);

    expect(stages).toEqual(["drafting", "polishing"]);
    expect(snapshots).toEqual([["Bailey waved."]]);
    expect(mockMessagesStream).toHaveBeenCalledTimes(1);
    expect(mockMessagesCreate).toHaveBeenCalledTimes(1);
  });

  it("removes em and en dashes from generated story fields", () => {
    expect(
      normalizeGeneratedStory({
        title: "Bailey — Moon Helper",
        pages: [
          {
            pageNumber: 1,
            text: "Bailey waved — the lantern glowed.",
            illustrationPrompt: "A moonlit room – warm and safe.",
          },
        ],
      })
    ).toEqual({
      title: "Bailey Moon Helper",
      pages: [
        {
          pageNumber: 1,
          text: "Bailey waved the lantern glowed.",
          illustrationPrompt: "A moonlit room warm and safe.",
        },
      ],
    });
  });

  it("removes repeated generated pages before the final post-check", () => {
    expect(
      prepareGeneratedStoryForPostCheck(
        { storyPreset: "tiny-tales" },
        {
          title: "Bailey Moon",
          pages: [
            {
              pageNumber: 1,
              text: "Bailey found a moon boat.",
              illustrationPrompt: "Bailey beside a moon boat.",
            },
            {
              pageNumber: 2,
              text: "The moon boat bobbed gently.",
              illustrationPrompt: "A moon boat bobbing gently.",
            },
            {
              pageNumber: 3,
              text: "The moon boat bobbed gently.",
              illustrationPrompt: "A repeated extra page.",
            },
          ],
        }
      )
    ).toEqual({
      title: "Bailey Moon",
      pages: [
        {
          pageNumber: 1,
          text: "Bailey found a moon boat.",
          illustrationPrompt: "Bailey beside a moon boat.",
        },
        {
          pageNumber: 2,
          text: "The moon boat bobbed gently.",
          illustrationPrompt: "A moon boat bobbing gently.",
        },
      ],
    });
  });

  it("caps generated pages to the selected preset maximum", () => {
    const prepared = prepareGeneratedStoryForPostCheck(
      { storyPreset: "tiny-tales" },
      {
        title: "Bailey Moon",
        pages: Array.from({ length: 9 }, (_, index) => ({
          pageNumber: index + 1,
          text: `Bailey page ${index + 1}.`,
          illustrationPrompt: `Illustration ${index + 1}.`,
        })),
      }
    );

    expect(prepared.pages).toHaveLength(6);
    expect(prepared.pages.map((page) => page.pageNumber)).toEqual([
      1, 2, 3, 4, 5, 6,
    ]);
    expect(prepared.pages.at(-1)?.text).toBe("Bailey page 6.");
  });
});
