import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ChildProfile, Character, StoryPerson } from "@/types";
import {
  buildStoryPostCheckPrompt,
  buildStoryPrompt,
  generateSuggestions,
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
    expect(prompt).toContain(
      "Gender/pronouns: not specified; avoid assuming gender"
    );
  });

  it("keeps the premise grounded and preserves every named premise element", () => {
    const prompt = buildStoryPrompt({
      profile: createProfile(),
      characters: [],
      theme: "family time",
      notes: "",
      premise:
        "Bailey eating ice cream by the beach at sunset with chips as an entree",
      storyPreset: "preschool-story",
      locale: "en",
    });

    expect(prompt).toContain("Stay grounded and true to this premise");
    expect(prompt).toContain("Include every element the premise names");
    expect(prompt).toMatch(
      /do NOT turn an incidental or side detail into a giant, surreal, magical, or physically impossible centrepiece/
    );
    expect(prompt).toContain(
      "keep the premise and its everyday details grounded and realistic"
    );
  });

  it("uses selected gender guidance when the profile provides it", () => {
    const prompt = buildStoryPrompt({
      profile: { ...createProfile(), gender: "girl" },
      characters: [],
      theme: "kindness",
      notes: "",
      storyPreset: "moonlit-adventures",
      locale: "en",
    });

    expect(prompt).toContain("Gender/pronouns: girl; use she/her");
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

  it("includes selected reusable story people and warns against inventing family", () => {
    const storyPeople: StoryPerson[] = [
      {
        id: "person-1",
        userId: "user-1",
        name: "Nanna Jo",
        relationship: "grandparent",
        description: "Bailey's calm bedtime storyteller.",
        personality: "Warm and patient",
        appearance: "Silver hair and round purple glasses.",
        pronouns: "she/her",
        availableToAllProfiles: true,
        profileIds: [],
        createdAt: "2026-07-15T00:00:00.000Z",
        updatedAt: "2026-07-15T00:00:00.000Z",
      },
    ];

    const prompt = buildStoryPrompt({
      profile: createProfile(),
      characters: [],
      storyPeople,
      theme: "kindness",
      notes: "",
      storyPreset: "preschool-story",
      locale: "en",
    });

    expect(prompt).toContain("Selected family, friends, pets");
    expect(prompt).toContain("Nanna Jo (Grandparent, she/her)");
    expect(prompt).toContain("Does not invent named parents");
  });

  it("filters selected story people that look like protected source material", () => {
    const storyPeople: StoryPerson[] = [
      {
        id: "person-1",
        userId: "user-1",
        name: "Elsa",
        relationship: "friend",
        description: "A snow queen from a famous movie.",
        personality: "Magical",
        appearance: "Looks like the Disney character.",
        availableToAllProfiles: true,
        profileIds: [],
        createdAt: "2026-07-15T00:00:00.000Z",
        updatedAt: "2026-07-15T00:00:00.000Z",
      },
      {
        id: "person-2",
        userId: "user-1",
        name: "Grandad Ray",
        relationship: "grandparent",
        description: "A gentle gardener.",
        personality: "Patient",
        appearance: "Brown cardigan and kind eyes.",
        availableToAllProfiles: true,
        profileIds: [],
        createdAt: "2026-07-15T00:00:00.000Z",
        updatedAt: "2026-07-15T00:00:00.000Z",
      },
    ];

    const prompt = buildStoryPrompt({
      profile: createProfile(),
      characters: [],
      storyPeople,
      theme: "kindness",
      notes: "",
      storyPreset: "preschool-story",
      locale: "en",
    });

    expect(prompt).not.toContain("Elsa");
    expect(prompt).toContain("Grandad Ray");
  });
});

describe("generateSuggestions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("asks for fresh ideas around the selected theme while avoiding already-shown ideas", async () => {
    mockMessagesCreate.mockResolvedValueOnce({
      content: [
        {
          type: "text",
          text: JSON.stringify([
            {
              title: "The Listening Lantern",
              premise: "Bailey helps a lantern hear the stars.",
              theme: "listening",
            },
          ]),
        },
      ],
    });

    await expect(
      generateSuggestions(createProfile(), ["The Moon Pond"], "en", {
        selectedTheme: "listening",
        previousSuggestions: [
          {
            title: "The Garden Rocket",
            premise: "Bailey and a teddy fly to a garden moon.",
            theme: "kindness",
          },
        ],
      })
    ).resolves.toEqual([
      {
        title: "The Listening Lantern",
        premise: "Bailey helps a lantern hear the stars.",
        theme: "listening",
      },
    ]);

    const prompt = mockMessagesCreate.mock.calls[0]?.[0].messages[0].content;
    expect(prompt).toContain("Selected theme for this batch: listening");
    expect(prompt).toContain("Already shown to the parent today");
    expect(prompt).toContain("The Garden Rocket");
    expect(prompt).toContain(
      "Don't suggest stories similar to these recent ones: The Moon Pond"
    );
  });

  it("includes selected family and friends in the story idea prompt", async () => {
    const storyPeople: StoryPerson[] = [
      {
        id: "person-1",
        userId: "user-1",
        name: "Glenpa",
        relationship: "grandparent",
        description: "Bailey's playful grandparent who loves beach walks.",
        personality: "warm, silly, encouraging",
        appearance: "grey-brown hair and dark-framed glasses",
        appearanceSummary: "Warm grandparent with glasses.",
        pronouns: "he/him",
        availableToAllProfiles: true,
        profileIds: [],
        createdAt: "2026-08-03T00:00:00.000Z",
        updatedAt: "2026-08-03T00:00:00.000Z",
      },
    ];
    mockMessagesCreate.mockResolvedValueOnce({
      content: [
        {
          type: "text",
          text: JSON.stringify([
            {
              title: "Glenpa's Shell Song",
              premise: "Bailey and Glenpa listen for gentle shell songs.",
              theme: "listening",
            },
          ]),
        },
      ],
    });

    await generateSuggestions(createProfile(), [], "en", {
      selectedTheme: "listening",
      storyPeople,
    });

    const prompt = mockMessagesCreate.mock.calls[0]?.[0].messages[0].content;
    expect(prompt).toContain(
      "Selected family, friends, pets, or other child profiles"
    );
    expect(prompt).toContain("Glenpa (Grandparent, he/him)");
    expect(prompt).toContain(
      "make at least one idea naturally include one or more of them by name"
    );
    expect(prompt).toContain("Do not invent named parents");
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

  it("falls back to the un-polished draft when the polish step fails", async () => {
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
    mockMessagesCreate.mockRejectedValueOnce(new Error("polish 500"));

    const result = await streamStory(
      {
        profile: createProfile(),
        characters: [],
        theme: "kindness",
        notes: "",
        storyPreset: "tiny-tales",
        locale: "en",
      },
      () => {},
      () => {}
    );

    expect(result).toEqual(normalizeGeneratedStory(generatedStory));
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
