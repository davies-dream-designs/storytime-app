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
    delete process.env.IMAGE_PROVIDER;
    delete process.env.FAL_KEY;
    delete process.env.FLUX_MODEL;
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
      layoutType: "text_art" as const,
      title: "Page",
      illustrationPrompt: "A gentle story-page illustration.",
    };
    const titleSpread = {
      ...project.spreads[0]!,
      id: "book-1:spread:title",
      sequence: 3,
      pageStart: 5,
      pageEnd: 6,
      layoutType: "front_matter" as const,
      title: "Title",
    };
    const endSpread = {
      ...project.spreads[0]!,
      id: "book-1:spread:end",
      sequence: 4,
      pageStart: 7,
      pageEnd: 8,
      layoutType: "end_matter" as const,
      title: "The End",
    };
    const backCoverSpread = {
      ...project.spreads[0]!,
      id: "book-1:spread:back",
      sequence: 5,
      pageStart: 9,
      pageEnd: 10,
      layoutType: "end_matter" as const,
      title: "Back Cover",
    };

    const requests = buildBookImageBatchRequests({
      project: {
        ...project,
        spreads: [
          ...project.spreads,
          titleSpread,
          spread,
          endSpread,
          backCoverSpread,
        ],
      },
      story: createStory(),
      profile: createProfile(),
      characterBible: createCharacterBible(),
    });

    expect(requests.map((request) => request.customId)).toEqual([
      "cover",
      "spread:book-1:spread:2:left",
    ]);
    expect(requests[0]?.size).toBe("1024x1024");
    expect(requests[1]?.size).toBe("1024x1024");
  });

  it("omits raw story prose from sequential page image prompts", async () => {
    process.env.OPENAI_API_KEY = "test-key";

    vi.doMock("@/lib/print-books/storage", () => ({
      storeBookAsset: mockStoreBookAsset,
      isBookAssetStorageConfigured: () => true,
    }));

    vi.doMock("sharp", () => {
      const instance = {
        resize: vi.fn().mockReturnThis(),
        removeAlpha: vi.fn().mockReturnThis(),
        raw: vi.fn().mockReturnThis(),
        png: vi.fn().mockReturnThis(),
        toBuffer: vi.fn((options?: { resolveWithObject?: boolean }) =>
          options?.resolveWithObject
            ? Promise.resolve({
                data: Buffer.from([128, 128, 128, 180, 180, 180]),
                info: { channels: 3 },
              })
            : Promise.resolve(Buffer.from("upscaled-png"))
        ),
      };
      const sharpFn = vi.fn(() => instance);
      const sharpMock = Object.assign(sharpFn, {
        kernel: { lanczos3: "lanczos3" },
      });
      return { default: sharpMock };
    });

    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        data: [{ b64_json: Buffer.from("image").toString("base64") }],
      }),
    });
    vi.stubGlobal("fetch", fetchMock);
    mockStoreBookAsset.mockResolvedValue("https://example.com/page.png");

    vi.resetModules();
    const { generateSpreadPageIllustration } =
      await import("@/lib/print-books/illustrations");

    const project = createProject();
    const spread = {
      ...project.spreads[0]!,
      id: "book-1:spread:2",
      sequence: 2,
      pageStart: 3,
      pageEnd: 4,
      title: "Pond",
      leftPageText:
        "Bailey stood at the edge of the water with bare little toes touching the warm mud.",
      rightPageText: "The little fish peeked out from under a lily pad.",
      sceneBrief: "Bailey watches a shy fish from the safe pond edge.",
      illustrationPrompt:
        "A gentle pond scene with Bailey calmly watching a shy fish.",
    };

    await generateSpreadPageIllustration({
      project,
      story: createStory(),
      profile: createProfile(),
      characterBible: createCharacterBible(),
      spread,
      side: "left",
    });

    const requestBody = JSON.parse(fetchMock.mock.calls[0]?.[1]?.body);
    expect(requestBody.prompt).toContain("A gentle pond scene");
    expect(requestBody.prompt).not.toContain("bare little toes");
    expect(requestBody.prompt).not.toContain("Page moment:");

    vi.unstubAllGlobals();
    vi.doUnmock("sharp");
    vi.doUnmock("@/lib/print-books/storage");
  });

  it("falls back to a safe branded cover when cover moderation blocks generation", async () => {
    process.env.OPENAI_API_KEY = "test-key";

    vi.doMock("@/lib/print-books/storage", () => ({
      storeBookAsset: mockStoreBookAsset,
      isBookAssetStorageConfigured: () => true,
    }));

    const fetchMock = vi.fn().mockResolvedValue({
      ok: false,
      status: 400,
      headers: new Headers(),
      text: async () =>
        JSON.stringify({ error: { code: "moderation_blocked" } }),
    });
    vi.stubGlobal("fetch", fetchMock);
    mockStoreBookAsset.mockImplementation(async ({ pathname }) =>
      pathname.endsWith(".svg")
        ? "data:image/svg+xml;base64,cover"
        : "https://example.com/cover.png"
    );

    vi.resetModules();
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
    expect(mockStoreBookAsset).toHaveBeenCalledWith(
      expect.objectContaining({
        pathname: "books/book-1/cover.svg",
        contentType: "image/svg+xml",
      })
    );

    vi.unstubAllGlobals();
    vi.doUnmock("@/lib/print-books/storage");
  });

  it("marks a missing batch image as failed without replacing other images", async () => {
    process.env.OPENAI_API_KEY = "test-key";

    vi.doMock("@/lib/print-books/storage", () => ({
      storeBookAsset: mockStoreBookAsset,
      isBookAssetStorageConfigured: () => true,
    }));

    // Passthrough sharp so the fake test buffers (and placeholder SVG) upscale cleanly.
    vi.doMock("sharp", () => {
      const instance = {
        resize: vi.fn().mockReturnThis(),
        removeAlpha: vi.fn().mockReturnThis(),
        raw: vi.fn().mockReturnThis(),
        png: vi.fn().mockReturnThis(),
        toBuffer: vi.fn((options?: { resolveWithObject?: boolean }) =>
          options?.resolveWithObject
            ? Promise.resolve({
                data: Buffer.from([128, 128, 128, 180, 180, 180]),
                info: { channels: 3 },
              })
            : Promise.resolve(Buffer.from("upscaled-png"))
        ),
      };
      const sharpFn = vi.fn(() => instance);
      const sharpMock = Object.assign(sharpFn, {
        kernel: { lanczos3: "lanczos3" },
      });
      return { default: sharpMock };
    });

    // Regeneration of the missing image fails (simulating a persistent moderation
    // block), so only that page should be marked failed.
    const fetchMock = vi.fn().mockResolvedValue({
      ok: false,
      status: 400,
      headers: new Headers(),
      text: async () =>
        JSON.stringify({ error: { message: "moderation_blocked" } }),
    });
    vi.stubGlobal("fetch", fetchMock);
    mockStoreBookAsset.mockResolvedValue("https://example.com/image.png");

    vi.resetModules();
    const { applyBookImageBatchOutput } =
      await import("@/lib/print-books/illustrations");

    const project = createProject();
    const spread = {
      ...project.spreads[0]!,
      id: "book-1:spread:2",
      sequence: 2,
      pageStart: 3,
      pageEnd: 4,
      layoutType: "text_art" as const,
      title: "Page",
      illustrationPrompt: "A gentle story-page illustration.",
    };
    // Cover present; the primary spread image is missing from the batch output.
    const outputText = [
      JSON.stringify({
        custom_id: "cover",
        response: {
          body: {
            data: [{ b64_json: Buffer.from("cover").toString("base64") }],
          },
        },
      }),
    ].join("\n");

    const result = await applyBookImageBatchOutput({
      project: { ...project, spreads: [...project.spreads, spread] },
      story: createStory(),
      profile: createProfile(),
      characterBible: createCharacterBible(),
      outputText,
    });

    expect(result.provider).toBe("mixed");
    expect(result.coverImageUrl).toBe("https://example.com/image.png");
    expect(result.spreads.find((item) => item.id === spread.id)).toMatchObject({
      leftPageImageUrl: undefined,
      leftPageImageError: expect.stringContaining("moderation blocked"),
      rightPageImageUrl: undefined,
      rightPageImageError: undefined,
    });
    // Only the cover is stored.
    expect(mockStoreBookAsset).toHaveBeenCalledTimes(1);
    expect(mockStoreBookAsset).toHaveBeenCalledWith(
      expect.objectContaining({ contentType: "image/png" })
    );

    vi.unstubAllGlobals();
    vi.doUnmock("sharp");
    vi.doUnmock("@/lib/print-books/storage");
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
      layoutType: "text_art" as const,
      title: "Page",
      illustrationPrompt: "A gentle story-page illustration.",
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
    expect(result.spread.rightPageImageUrl).toBeUndefined();
    expect(mockStoreBookAsset).toHaveBeenCalledWith(
      expect.objectContaining({
        pathname: "books/book-1/spreads/2-left.svg",
        contentType: "image/svg+xml",
      })
    );
  });

  it("generates cover art via fal.ai FLUX when IMAGE_PROVIDER=flux", async () => {
    process.env.IMAGE_PROVIDER = "flux";
    process.env.FAL_KEY = "fal-test-key";

    vi.doMock("@/lib/print-books/storage", () => ({
      storeBookAsset: mockStoreBookAsset,
      isBookAssetStorageConfigured: () => true,
    }));

    vi.doMock("sharp", () => {
      const instance = {
        resize: vi.fn().mockReturnThis(),
        removeAlpha: vi.fn().mockReturnThis(),
        raw: vi.fn().mockReturnThis(),
        png: vi.fn().mockReturnThis(),
        toBuffer: vi.fn((options?: { resolveWithObject?: boolean }) =>
          options?.resolveWithObject
            ? Promise.resolve({
                data: Buffer.from([128, 128, 128, 180, 180, 180]),
                info: { channels: 3 },
              })
            : Promise.resolve(Buffer.from("upscaled-png"))
        ),
      };
      const sharpFn = vi.fn(() => instance);
      const sharpMock = Object.assign(sharpFn, {
        kernel: { lanczos3: "lanczos3" },
      });
      return { default: sharpMock };
    });

    const fetchMock = vi
      .fn()
      // 1) fal.ai generation request
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          images: [{ url: "https://fal.media/files/cover.png" }],
        }),
      })
      // 2) download of the returned image URL
      .mockResolvedValueOnce({
        ok: true,
        arrayBuffer: async () =>
          new Uint8Array(Buffer.from("flux-png-bytes")).buffer,
      });

    vi.stubGlobal("fetch", fetchMock);
    mockStoreBookAsset.mockResolvedValue("https://example.com/cover.png");

    vi.resetModules();
    const { generateCoverIllustration, getImageProvider } =
      await import("@/lib/print-books/illustrations");

    expect(getImageProvider()).toBe("flux");

    const result = await generateCoverIllustration({
      project: createProject(),
      story: createStory(),
      profile: createProfile(),
      characterBible: createCharacterBible(),
    });

    expect(result.coverImageUrl).toBe("https://example.com/cover.png");

    // Hit fal.ai's FLUX endpoint with the right auth and a disabled safety checker.
    const generationCall = fetchMock.mock.calls[0];
    expect(String(generationCall?.[0])).toContain("fal.run/fal-ai/flux/dev");
    expect(generationCall?.[1]?.headers?.Authorization).toBe(
      "Key fal-test-key"
    );
    const body = String(generationCall?.[1]?.body);
    expect(body).toContain('"enable_safety_checker":false');
    expect(body).toContain('"image_size":"square_hd"');
    // Second call downloads the produced image.
    expect(String(fetchMock.mock.calls[1]?.[0])).toBe(
      "https://fal.media/files/cover.png"
    );
    // Stored as PNG for the print pipeline.
    expect(mockStoreBookAsset).toHaveBeenCalledWith(
      expect.objectContaining({ contentType: "image/png" })
    );

    vi.unstubAllGlobals();
    vi.doUnmock("sharp");
    vi.doUnmock("@/lib/print-books/storage");
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
        removeAlpha: vi.fn().mockReturnThis(),
        raw: vi.fn().mockReturnThis(),
        png: vi.fn().mockReturnThis(),
        toBuffer: vi.fn((options?: { resolveWithObject?: boolean }) =>
          options?.resolveWithObject
            ? Promise.resolve({
                data: Buffer.from([128, 128, 128, 180, 180, 180]),
                info: { channels: 3 },
              })
            : Promise.resolve(Buffer.from("upscaled-png"))
        ),
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

  it("retries cover generation when the provider returns an almost black image", async () => {
    process.env.OPENAI_API_KEY = "test-key";
    process.env.OPENAI_IMAGE_MODEL = "gpt-image-1";

    vi.doMock("@/lib/print-books/storage", () => ({
      storeBookAsset: mockStoreBookAsset,
      isBookAssetStorageConfigured: () => true,
    }));

    const qualitySamples = [
      Buffer.from([0, 0, 0, 1, 1, 1]),
      Buffer.from([128, 128, 128, 180, 180, 180]),
    ];
    vi.doMock("sharp", () => {
      const instance = {
        resize: vi.fn().mockReturnThis(),
        removeAlpha: vi.fn().mockReturnThis(),
        raw: vi.fn().mockReturnThis(),
        png: vi.fn().mockReturnThis(),
        toBuffer: vi.fn((options?: { resolveWithObject?: boolean }) =>
          options?.resolveWithObject
            ? Promise.resolve({
                data: qualitySamples.shift() ?? Buffer.from([180, 180, 180]),
                info: { channels: 3 },
              })
            : Promise.resolve(Buffer.from("upscaled-png"))
        ),
      };
      const sharpFn = vi.fn(() => instance);
      const sharpMock = Object.assign(sharpFn, {
        kernel: { lanczos3: "lanczos3" },
      });
      return { default: sharpMock };
    });

    const fetchMock = vi.fn().mockResolvedValue({
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
    expect(mockStoreBookAsset).toHaveBeenCalledTimes(1);

    vi.unstubAllGlobals();
    vi.doUnmock("sharp");
    vi.doUnmock("@/lib/print-books/storage");
  });
});
