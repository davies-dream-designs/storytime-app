import { describe, expect, it, vi, beforeEach } from "vitest";
import type { ChildProfile, Story } from "@/types";
import type { BookProject, CharacterBible } from "@/types/printBook";

const mockStoreBookAsset = vi.fn();

vi.mock("@/lib/print-books/storage", () => ({
  storeBookAsset: mockStoreBookAsset,
  isBookAssetStorageConfigured: () => false,
}));

function createProfile(): ChildProfile {
  return {
    id: "profile-1",
    userId: "user-1",
    name: "Mila",
    age: 4,
    favouriteCharacters: ["Bunny"],
    favouriteActivities: ["painting"],
    favouriteAnimals: ["fox"],
    favouritePlaces: ["garden"],
    lessons: ["kindness"],
    createdAt: "2026-07-15T00:00:00.000Z",
  };
}

function createStory(): Story {
  return {
    id: "story-1",
    userId: "user-1",
    title: "Moonlight Garden",
    profileId: "profile-1",
    profileName: "Mila",
    wordCount: 120,
    theme: "kindness",
    notes: "",
    createdAt: "2026-07-15T00:00:00.000Z",
    pages: [
      {
        pageNumber: 1,
        text: "Mila stepped into the moonlight garden.",
        illustrationPrompt:
          "A magical print-ready picture-book cover moment in a moonlight garden.",
      },
    ],
  };
}

function createCharacterBible(): CharacterBible {
  return {
    childAppearance: "Mila has curly dark hair and bright brown eyes.",
    outfitRules: "Keep Mila in a yellow cardigan over blue pajamas.",
    recurringProps: ["silver lantern"],
    companionCharacters: ["sleepy fox"],
    palette: "soft indigo, butter yellow, silver",
    renderStyle: "storybook gouache",
    lightingTone: "cozy moonlight",
    doNotChange: ["curly dark hair", "yellow cardigan"],
  };
}

function createProject(): BookProject {
  return {
    id: "book-1",
    userId: "user-1",
    sourceStoryId: "story-1",
    profileId: "profile-1",
    ageBand: "3-5",
    status: "illustrating",
    trimSize: "storycot-dynamic-square",
    pageCount: 32,
    spreadCount: 16,
    completedSpreads: 0,
    totalSpreads: 16,
    currentStageLabel: "Painting moonlit pages...",
    characterBible: createCharacterBible(),
    beats: [],
    spreads: [
      {
        id: "book-1:spread:1",
        bookProjectId: "book-1",
        sequence: 1,
        pageStart: 1,
        pageEnd: 2,
        layoutType: "front_matter",
        title: "Cover",
        leftPageText: "Moonlight Garden",
        rightPageText: "",
        sceneBrief: "Front cover for Moonlight Garden",
        illustrationPrompt:
          'A magical print-ready picture-book cover for "Moonlight Garden" starring Mila.',
      },
    ],
    assets: { proofVersion: 0 },
    retryCount: 0,
    createdAt: "2026-07-15T00:00:00.000Z",
    updatedAt: "2026-07-15T00:00:00.000Z",
  };
}

describe("generateCoverIllustration", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    delete process.env.OPENAI_API_KEY;
    delete process.env.OPENAI_IMAGE_MODEL;
    delete process.env.BLOB_READ_WRITE_TOKEN;
    mockStoreBookAsset.mockResolvedValue("data:image/svg+xml;base64,cover");
  });

  it("reports final-art generation as unavailable without OpenAI plus blob storage", async () => {
    const { isGeneratedIllustrationConfigured } =
      await import("@/lib/print-books/illustrations");
    expect(isGeneratedIllustrationConfigured()).toBe(false);
  });

  it("creates a placeholder cover asset when provider credentials are missing", async () => {
    const { generateCoverIllustration } =
      await import("@/lib/print-books/illustrations");
    const result = await generateCoverIllustration({
      project: createProject(),
      story: createStory(),
      profile: createProfile(),
      characterBible: createCharacterBible(),
    });

    expect(result.provider).toBe("placeholder");
    expect(result.coverImageUrl).toBe("data:image/svg+xml;base64,cover");
    expect(result.spreads[0]?.imageUrl).toBe("data:image/svg+xml;base64,cover");
    expect(mockStoreBookAsset).toHaveBeenCalledWith(
      expect.objectContaining({
        pathname: "books/book-1/cover.svg",
        contentType: "image/svg+xml",
      })
    );
  });

  it("uses branded placeholder cover copy instead of debug preview text", async () => {
    const { generateCoverIllustration } =
      await import("@/lib/print-books/illustrations");
    mockStoreBookAsset.mockImplementation(async ({ body }) => body as string);

    const result = await generateCoverIllustration({
      project: createProject(),
      story: createStory(),
      profile: createProfile(),
      characterBible: createCharacterBible(),
    });

    expect(result.coverImageUrl).toContain("Storycot");
    expect(result.coverImageUrl).not.toContain("STORYCOT PRINT PREVIEW");
    expect(result.coverImageUrl).not.toContain("renderStyle");
    expect(result.coverImageUrl).not.toContain("Palette inspiration");
  });

  it("builds a cover prompt from the character bible and cover spread", async () => {
    const { buildCoverIllustrationPrompt } =
      await import("@/lib/print-books/illustrations");
    const project = createProject();
    const prompt = buildCoverIllustrationPrompt({
      project,
      story: createStory(),
      profile: createProfile(),
      characterBible: createCharacterBible(),
      coverSpread: project.spreads[0],
    });

    expect(prompt).toContain(
      "Child appearance: Mila has curly dark hair and bright brown eyes."
    );
    expect(prompt).toContain("Book title: Moonlight Garden.");
    expect(prompt).toContain("Cover scene:");
  });

  it("builds book image batch requests for the cover and page art", async () => {
    const { buildBookImageBatchRequests } =
      await import("@/lib/print-books/illustrations");
    const project = createProject();
    const spread = {
      ...project.spreads[0]!,
      id: "book-1:spread:2",
      sequence: 2,
      pageStart: 3,
      pageEnd: 4,
      title: "Title",
      illustrationPrompt:
        'A gentle title-page illustration motif for "Moonlight Garden".',
    };

    const requests = buildBookImageBatchRequests({
      project: { ...project, spreads: [...project.spreads, spread] },
      story: createStory(),
      profile: createProfile(),
      characterBible: createCharacterBible(),
    });

    expect(requests.map((request) => request.customId)).toEqual([
      "cover",
      "spread:book-1:spread:2:left",
      "spread:book-1:spread:2:right",
    ]);
    expect(requests[0]?.size).toBe("1024x1024");
    expect(requests[1]?.size).toBe("1024x1024");
    expect(requests[2]?.size).toBe("1024x1024");
  });

  it("fails batch output when generated image lines are missing", async () => {
    const { applyBookImageBatchOutput } =
      await import("@/lib/print-books/illustrations");
    const project = createProject();
    const spread = {
      ...project.spreads[0]!,
      id: "book-1:spread:2",
      sequence: 2,
      pageStart: 3,
      pageEnd: 4,
      title: "Title",
      illustrationPrompt:
        'A gentle title-page illustration motif for "Moonlight Garden".',
    };
    const outputText = [
      JSON.stringify({
        custom_id: "cover",
        response: {
          body: {
            data: [{ b64_json: Buffer.from("cover").toString("base64") }],
          },
        },
      }),
      JSON.stringify({
        custom_id: "spread:book-1:spread:2:left",
        response: {
          body: {
            data: [{ b64_json: Buffer.from("left").toString("base64") }],
          },
        },
      }),
    ].join("\n");

    await expect(
      applyBookImageBatchOutput({
        project: { ...project, spreads: [...project.spreads, spread] },
        story: createStory(),
        profile: createProfile(),
        characterBible: createCharacterBible(),
        outputText,
      })
    ).rejects.toThrow(
      "OpenAI image batch completed without 1 generated image result"
    );
    expect(mockStoreBookAsset).not.toHaveBeenCalled();
  });

  it("creates a placeholder spread asset when provider credentials are missing", async () => {
    const { generateSpreadIllustration } =
      await import("@/lib/print-books/illustrations");
    const project = createProject();
    const spread = {
      ...project.spreads[0]!,
      id: "book-1:spread:2",
      sequence: 2,
      pageStart: 3,
      pageEnd: 4,
      title: "Title",
      illustrationPrompt:
        'A gentle title-page illustration motif for "Moonlight Garden".',
    };

    const result = await generateSpreadIllustration({
      project,
      story: createStory(),
      profile: createProfile(),
      characterBible: createCharacterBible(),
      spread,
    });

    expect(result.provider).toBe("placeholder");
    expect(result.spread.leftPageImageUrl).toBe(
      "data:image/svg+xml;base64,cover"
    );
    expect(result.spread.rightPageImageUrl).toBe(
      "data:image/svg+xml;base64,cover"
    );
    expect(mockStoreBookAsset).toHaveBeenCalledWith(
      expect.objectContaining({
        pathname: "books/book-1/spreads/2-left.svg",
        contentType: "image/svg+xml",
      })
    );
    expect(mockStoreBookAsset).toHaveBeenCalledWith(
      expect.objectContaining({
        pathname: "books/book-1/spreads/2-right.svg",
        contentType: "image/svg+xml",
      })
    );
  });

  it("falls back from gpt-image-2 to gpt-image-1 when the newer model is unavailable", async () => {
    process.env.OPENAI_API_KEY = "test-key";

    vi.doMock("@/lib/print-books/storage", () => ({
      storeBookAsset: mockStoreBookAsset,
      isBookAssetStorageConfigured: () => true,
    }));

    // Mock sharp so upscaling is a passthrough (test buffers are not real PNGs).
    vi.doMock("sharp", () => {
      const instance = {
        resize: vi.fn().mockReturnThis(),
        png: vi.fn().mockReturnThis(),
        toBuffer: vi.fn().mockResolvedValue(Buffer.from("upscaled-png")),
      };
      const sharpFn = vi.fn(() => instance);
      const sharpMock = Object.assign(sharpFn, {
        kernel: { lanczos3: "lanczos3" },
      });
      return { default: sharpMock };
    });

    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({
        ok: false,
        status: 400,
        text: async () =>
          JSON.stringify({
            error: {
              message:
                "The model `gpt-image-2` does not exist or is not available.",
            },
          }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          data: [{ b64_json: Buffer.from("png-bytes").toString("base64") }],
        }),
      });

    vi.stubGlobal("fetch", fetchMock);
    mockStoreBookAsset.mockResolvedValue("https://example.com/cover.png");

    vi.resetModules();
    const { generateCoverIllustration } =
      await import("@/lib/print-books/illustrations");

    const result = await generateCoverIllustration({
      project: createProject(),
      story: createStory(),
      profile: createProfile(),
      characterBible: createCharacterBible(),
    });

    expect(result.provider).toBe("openai");
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(String(fetchMock.mock.calls[0]?.[1]?.body)).toContain(
      '"model":"gpt-image-2"'
    );
    expect(String(fetchMock.mock.calls[1]?.[1]?.body)).toContain(
      '"model":"gpt-image-1"'
    );

    vi.unstubAllGlobals();
    vi.doUnmock("sharp");
    vi.doUnmock("@/lib/print-books/storage");
  });
});
