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
    expect(prompt).toContain(
      "Apply the warm palette only to background, clothing, and lighting"
    );
    expect(prompt).toMatch(
      /never warm-tint, redden, or lighten hair, skin, or eyes/
    );
    expect(prompt).toContain("Rendering-level lock");
    expect(prompt).toMatch(
      /do not produce a glossy three-dimensional render, CGI or Pixar-style portrait/
    );
    expect(prompt).toContain("Footwear lock");
    expect(prompt).toContain(
      "so the cover looks like it belongs to the same book as the interior pages"
    );
  });

  it("includes locked character rules in illustration prompts", async () => {
    const { buildCoverIllustrationPrompt } =
      await import("@/lib/print-books/illustrations");
    const project = createProject();
    const bible: CharacterBible = {
      ...createCharacterBible(),
      lockedCharacterRules: [
        {
          id: "person:glenpa",
          name: "Glenpa",
          role: "family_friend_pet",
          relationship: "Grandparent",
          identityRules:
            "Glenpa has dark-framed glasses, a grey man bun, and a large body build.",
          outfitRules:
            "Locked outfit and footwear: plain cream t-shirt, blue trousers, and simple brown shoes.",
          continuityRules: [
            "Use the same face shape, man bun, glasses, body build, outfit, and shoes on every page.",
          ],
        },
      ],
    };

    const prompt = buildCoverIllustrationPrompt({
      project,
      story: createStory(),
      profile: createProfile(),
      characterBible: bible,
      coverSpread: project.spreads[0],
    });

    expect(prompt).toContain("LOCKED CHARACTER CONTINUITY");
    expect(prompt).toContain("plain cream t-shirt");
    expect(prompt).toContain("simple brown shoes");
    expect(prompt).toContain(
      "For any unspecified visual detail, follow the inferred locked rule"
    );
  });

  it("uses sanitized story moment constraints in sequential page image prompts", async () => {
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
        jpeg: vi.fn().mockReturnThis(),
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

    expect(fetchMock.mock.calls[0]?.[0]).toBe(
      "https://api.openai.com/v1/images/generations"
    );
    const requestBody = JSON.parse(fetchMock.mock.calls[0]?.[1]?.body);
    expect(requestBody.prompt).toContain("A gentle pond scene");
    expect(requestBody.prompt).toContain("Story moment constraints");
    expect(requestBody.prompt).toContain("Bailey stood at the edge of the water");
    expect(requestBody.prompt).toContain(
      "The little fish peeked out from under a lily pad"
    );
    expect(requestBody.prompt).not.toContain("bare little toes");
    expect(requestBody.prompt).not.toContain("Page moment:");

    vi.unstubAllGlobals();
    vi.doUnmock("sharp");
    vi.doUnmock("@/lib/print-books/storage");
  });

  it("tells page art to preserve general object and character scene state", async () => {
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
        jpeg: vi.fn().mockReturnThis(),
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
      id: "book-1:spread:3",
      sequence: 3,
      pageStart: 5,
      pageEnd: 6,
      title: "Kitchen",
      leftPageText:
        "Bailey watched from the doorway. The red book was still on the kitchen table, Piggy was under the chair, and Mum held the little yellow cup.",
      rightPageText: "",
      sceneBrief:
        "Bailey watches a quiet kitchen moment from the doorway while the objects stay where they are.",
      illustrationPrompt:
        "Bailey stands in the doorway of a cosy kitchen, with the red book on the table, Piggy under the chair, and Mum holding a little yellow cup.",
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
    expect(requestBody.prompt).toContain("Preserve scene state exactly");
    expect(requestBody.prompt).toContain("who is holding or not holding each object");
    expect(requestBody.prompt).toContain("red book was still on the kitchen table");
    expect(requestBody.prompt).toContain("Piggy was under the chair");
    expect(requestBody.prompt).toContain("Mum held the little yellow cup");
    expect(requestBody.prompt).toContain(
      "Do not move objects, pets, toys, books, gifts, food, clothing, or story props"
    );
    expect(requestBody.prompt).toContain(
      "Scene fidelity is higher priority than a convenient character pose"
    );

    vi.unstubAllGlobals();
    vi.doUnmock("sharp");
    vi.doUnmock("@/lib/print-books/storage");
  });

  it("uses visual reference images for generated page art when available", async () => {
    process.env.OPENAI_API_KEY = "test-key";

    vi.doMock("@/lib/print-books/storage", () => ({
      storeBookAsset: mockStoreBookAsset,
      isBookAssetStorageConfigured: () => true,
    }));

    vi.doMock("sharp", () => {
      const instance = {
        resize: vi.fn().mockReturnThis(),
        composite: vi.fn().mockReturnThis(),
        removeAlpha: vi.fn().mockReturnThis(),
        raw: vi.fn().mockReturnThis(),
        png: vi.fn().mockReturnThis(),
        jpeg: vi.fn().mockReturnThis(),
        rotate: vi.fn().mockReturnThis(),
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

    const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
      void init;
      if (String(url).startsWith("https://assets.example.com/")) {
        return {
          ok: true,
          arrayBuffer: async () => Buffer.from("reference").buffer,
        };
      }
      return {
        ok: true,
        json: async () => ({
          data: [{ b64_json: Buffer.from("image").toString("base64") }],
        }),
      };
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
      title: "Beach",
      leftPageText: "Glenpa smiled from the sand.",
      rightPageText: "",
      sceneBrief: "Glenpa and Bailey play gently near the beach.",
      illustrationPrompt: "Glenpa and Bailey in a calm beach scene.",
    };

    await generateSpreadPageIllustration({
      project,
      story: createStory(),
      profile: createProfile(),
      characterBible: createCharacterBible(),
      visualReferences: [
        {
          id: "person:glenpa",
          name: "Glenpa",
          role: "family_friend_pet",
          relationship: "grandparent",
          imageUrl: "https://assets.example.com/glenpa.jpg",
          appearance:
            "Latest edited appearance: warm smile, dark-framed glasses, grey hair tied in a neat man bun. Previous generated reference summary, use only when it does not conflict with latest edited appearance/body build: grey-brown shoulder-length wavy hair. Illustration body-build cue: very large plus-size body build with a clearly fuller round frame.",
        },
      ],
      spread,
      side: "left",
    });

    const editCall = fetchMock.mock.calls.find((call) =>
      String(call[0]).includes("/images/edits")
    );
    expect(editCall?.[0]).toBe("https://api.openai.com/v1/images/edits");
    expect(
      fetchMock.mock.calls.some((call) =>
        String(call[0]).includes("/images/generations")
      )
    ).toBe(false);
    const body = editCall?.[1]?.body as FormData;
    expect(body.get("prompt")).toContain(
      "Attached character reference sheet order"
    );
    expect(body.get("prompt")).toContain("Latest profile/reference overrides");
    expect(body.get("prompt")).toContain("Identity colour lock");
    expect(body.get("prompt")).toContain("grey hair tied in a neat man bun");
    expect(body.get("prompt")).toContain("grey-brown shoulder-length wavy hair");
    expect(body.get("prompt")).toContain("very large plus-size body build");
    expect(body.get("prompt")).toContain(
      "Latest edited profile/reference text controls changeable visual traits"
    );
    expect(body.get("prompt")).toContain(
      "Body build is controlled by the latest profile/reference text"
    );
    expect(body.get("prompt")).toContain(
      "visibly adjust silhouette, torso width, face fullness, and overall proportions"
    );
    expect(body.get("prompt")).toContain(
      "Large means moderately fuller-than-average, not very large or oversized"
    );
    expect(body.get("prompt")).toContain(
      "Only use a very large plus-size silhouette when the latest profile/reference text explicitly says Very Large"
    );
    expect(body.get("prompt")).toContain(
      "If this conflicts with the older character bible"
    );
    expect(body.get("prompt")).toContain(
      "previous generated reference summary"
    );
    expect(body.get("prompt")).toContain("Glenpa");
    expect(body.get("image")).toBeInstanceOf(File);

    vi.unstubAllGlobals();
    vi.doUnmock("sharp");
    vi.doUnmock("@/lib/print-books/storage");
  });

  it("keeps image-edit prompts under OpenAI's max prompt length", async () => {
    process.env.OPENAI_API_KEY = "test-key";

    vi.doMock("@/lib/print-books/storage", () => ({
      storeBookAsset: mockStoreBookAsset,
      isBookAssetStorageConfigured: () => true,
    }));

    vi.doMock("sharp", () => {
      const instance = {
        resize: vi.fn().mockReturnThis(),
        composite: vi.fn().mockReturnThis(),
        removeAlpha: vi.fn().mockReturnThis(),
        raw: vi.fn().mockReturnThis(),
        png: vi.fn().mockReturnThis(),
        jpeg: vi.fn().mockReturnThis(),
        rotate: vi.fn().mockReturnThis(),
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

    const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
      void init;
      if (String(url).startsWith("https://assets.example.com/")) {
        return {
          ok: true,
          arrayBuffer: async () => Buffer.from("reference").buffer,
        };
      }
      return {
        ok: true,
        json: async () => ({
          data: [{ b64_json: Buffer.from("image").toString("base64") }],
        }),
      };
    });
    vi.stubGlobal("fetch", fetchMock);
    mockStoreBookAsset.mockResolvedValue("https://example.com/page.png");

    vi.resetModules();
    const { generateSpreadPageIllustration } =
      await import("@/lib/print-books/illustrations");

    const hugeText = "very detailed continuity note about Bailey and Piggy ".repeat(
      320
    );
    const bible: CharacterBible = {
      ...createCharacterBible(),
      childAppearance: `${createCharacterBible().childAppearance} ${hugeText}`,
      outfitRules: `${createCharacterBible().outfitRules} ${hugeText}`,
      doNotChange: [hugeText, hugeText],
      lockedCharacterRules: [
        {
          id: "locked:glenpa",
          name: "Glenpa",
          role: "family_friend_pet",
          relationship: "grandparent",
          identityRules: hugeText,
          outfitRules: hugeText,
          continuityRules: [hugeText, hugeText],
        },
      ],
    };
    const project = createProject();
    const spread = {
      ...project.spreads[0]!,
      id: "book-1:spread:2",
      sequence: 2,
      pageStart: 3,
      pageEnd: 4,
      title: "Puddles",
      leftPageText:
        "Mila and Glenpa took Piggy everywhere with Bailey. Bailey, Glenpa, and Piggy splashed past big puddles and little puddles while Mumma and Dad watched.",
      rightPageText: "Piggy stayed close beside Mila and Glenpa on the wobbly path.",
      sceneBrief: hugeText,
      illustrationPrompt: hugeText,
    };

    await generateSpreadPageIllustration({
      project,
      story: createStory(),
      profile: createProfile(),
      characterBible: bible,
      visualReferences: [
        {
          id: "profile:profile-1",
          name: "Mila",
          role: "main_child",
          imageUrl: "https://assets.example.com/mila.jpg",
          appearance: hugeText,
        },
        {
          id: "person:glenpa",
          name: "Glenpa",
          role: "family_friend_pet",
          relationship: "grandparent",
          imageUrl: "https://assets.example.com/glenpa.jpg",
          appearance: hugeText,
          isStale: true,
        },
      ],
      referenceSnapshotKey: "profile|profile-1|snapshot",
      spread,
      side: "left",
      correctionNote: hugeText,
    });

    const editCall = fetchMock.mock.calls.find((call) =>
      String(call[0]).includes("/images/edits")
    );
    const body = editCall?.[1]?.body as FormData;
    const prompt = String(body.get("prompt") ?? "");
    expect(prompt.length).toBeLessThanOrEqual(32000);
    expect(prompt).toContain("Selected cast for this spread: Mila, Glenpa");
    expect(prompt).toContain("Story moment");
    expect(prompt).toContain("No text");

    vi.unstubAllGlobals();
    vi.doUnmock("sharp");
    vi.doUnmock("@/lib/print-books/storage");
  });


  it("filters visual references down to the spread's relevant cast", async () => {
    process.env.OPENAI_API_KEY = "test-key";

    vi.doMock("@/lib/print-books/storage", () => ({
      storeBookAsset: mockStoreBookAsset,
      isBookAssetStorageConfigured: () => true,
    }));

    vi.doMock("sharp", () => {
      const instance = {
        resize: vi.fn().mockReturnThis(),
        composite: vi.fn().mockReturnThis(),
        removeAlpha: vi.fn().mockReturnThis(),
        raw: vi.fn().mockReturnThis(),
        png: vi.fn().mockReturnThis(),
        jpeg: vi.fn().mockReturnThis(),
        rotate: vi.fn().mockReturnThis(),
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

    const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
      void init;
      if (String(url).startsWith("https://assets.example.com/")) {
        return {
          ok: true,
          arrayBuffer: async () => Buffer.from("reference").buffer,
        };
      }
      return {
        ok: true,
        json: async () => ({
          data: [{ b64_json: Buffer.from("image").toString("base64") }],
        }),
      };
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
      title: "Beach",
      leftPageText: "Mila waved to Glenpa near the calm shore.",
      rightPageText: "Together they looked for silver shells in the sand.",
      sceneBrief: "Mila and Glenpa share a calm shell-finding moment.",
      illustrationPrompt: "Mila and Glenpa at the quiet beach.",
    };

    await generateSpreadPageIllustration({
      project,
      story: createStory(),
      profile: createProfile(),
      characterBible: createCharacterBible(),
      visualReferences: [
        {
          id: "profile:profile-1",
          name: "Mila",
          role: "main_child",
          imageUrl: "https://assets.example.com/mila.jpg",
          appearance: "Curly dark hair and bright brown eyes.",
        },
        {
          id: "person:glenpa",
          name: "Glenpa",
          role: "family_friend_pet",
          relationship: "grandparent",
          imageUrl: "https://assets.example.com/glenpa.jpg",
          appearance: "Warm smile, dark-framed glasses, grey hair in a neat bun.",
        },
        {
          id: "person:poppy",
          name: "Poppy",
          role: "family_friend_pet",
          relationship: "friend",
          imageUrl: "https://assets.example.com/poppy.jpg",
          appearance: "Red overalls and two braids.",
        },
      ],
      spread,
      side: "left",
    });

    const editCall = fetchMock.mock.calls.find((call) =>
      String(call[0]).includes("/images/edits")
    );
    const body = editCall?.[1]?.body as FormData;
    expect(body.get("prompt")).toContain(
      "Selected cast for this spread: Mila, Glenpa"
    );
    expect(body.get("prompt")).toContain("Mila");
    expect(body.get("prompt")).toContain("Glenpa");
    expect(body.get("prompt")).not.toContain("Poppy");
    expect(
      fetchMock.mock.calls.some(
        (call) => String(call[0]) === "https://assets.example.com/poppy.jpg"
      )
    ).toBe(false);

    vi.unstubAllGlobals();
    vi.doUnmock("sharp");
    vi.doUnmock("@/lib/print-books/storage");
  });

  it("keeps the recent companion selected on pronoun-only spreads", async () => {
    process.env.OPENAI_API_KEY = "test-key";

    vi.doMock("@/lib/print-books/storage", () => ({
      storeBookAsset: mockStoreBookAsset,
      isBookAssetStorageConfigured: () => true,
    }));

    vi.doMock("sharp", () => {
      const instance = {
        resize: vi.fn().mockReturnThis(),
        composite: vi.fn().mockReturnThis(),
        removeAlpha: vi.fn().mockReturnThis(),
        raw: vi.fn().mockReturnThis(),
        png: vi.fn().mockReturnThis(),
        jpeg: vi.fn().mockReturnThis(),
        rotate: vi.fn().mockReturnThis(),
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

    const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
      void init;
      if (String(url).startsWith("https://assets.example.com/")) {
        return {
          ok: true,
          arrayBuffer: async () => Buffer.from("reference").buffer,
        };
      }
      return {
        ok: true,
        json: async () => ({
          data: [{ b64_json: Buffer.from("image").toString("base64") }],
        }),
      };
    });
    vi.stubGlobal("fetch", fetchMock);
    mockStoreBookAsset.mockResolvedValue("https://example.com/page.png");

    vi.resetModules();
    const { generateSpreadPageIllustration } =
      await import("@/lib/print-books/illustrations");

    const baseProject = createProject();
    const project: BookProject = {
      ...baseProject,
      spreads: [
        baseProject.spreads[0]!,
        {
          id: "book-1:spread:2",
          bookProjectId: "book-1",
          sequence: 2,
          pageStart: 3,
          pageEnd: 4,
          layoutType: "text_art",
          title: "Lantern Bench",
          leftPageText: "Mila sat beside Glenpa on the lantern bench.",
          rightPageText: "They shared a quiet smile.",
          sceneBrief: "Mila and Glenpa rest together by the lantern bench.",
          illustrationPrompt: "Mila and Glenpa on a lantern bench.",
          leftPageQa: {
            provider: "openai",
            generatedAt: "2026-08-17T00:00:00.000Z",
            characterReferenceIds: ["profile:profile-1", "person:glenpa"],
            characterReferenceNames: ["Mila", "Glenpa"],
            continuityReferenceIds: [],
            continuityReferenceLabels: [],
          },
        },
      ],
    };
    const spread = {
      ...project.spreads[1]!,
      id: "book-1:spread:3",
      sequence: 3,
      pageStart: 5,
      pageEnd: 6,
      leftPageText: "Together they watched the lanterns sway overhead.",
      rightPageText: "Their footsteps stayed slow and calm.",
      sceneBrief: "A gentle lantern-bench moment continues with the same pair.",
      illustrationPrompt: "A calm lantern scene with the same companion beside Mila.",
    };

    await generateSpreadPageIllustration({
      project,
      story: createStory(),
      profile: createProfile(),
      characterBible: createCharacterBible(),
      visualReferences: [
        {
          id: "profile:profile-1",
          name: "Mila",
          role: "main_child",
          imageUrl: "https://assets.example.com/mila.jpg",
          appearance: "Curly dark hair and bright brown eyes.",
        },
        {
          id: "person:glenpa",
          name: "Glenpa",
          role: "family_friend_pet",
          relationship: "grandparent",
          imageUrl: "https://assets.example.com/glenpa.jpg",
          appearance: "Warm smile, dark-framed glasses, grey hair in a neat bun.",
        },
        {
          id: "person:poppy",
          name: "Poppy",
          role: "family_friend_pet",
          relationship: "friend",
          imageUrl: "https://assets.example.com/poppy.jpg",
          appearance: "Red overalls and two braids.",
        },
      ],
      spread,
      side: "left",
    });

    const editCall = fetchMock.mock.calls.find((call) =>
      String(call[0]).includes("/images/edits")
    );
    const body = editCall?.[1]?.body as FormData;
    expect(body.get("prompt")).toContain(
      "Selected cast for this spread: Mila, Glenpa"
    );
    expect(body.get("prompt")).not.toContain("Poppy");

    vi.unstubAllGlobals();
    vi.doUnmock("sharp");
    vi.doUnmock("@/lib/print-books/storage");
  });



  it("uses approved cover and prior spread art as continuity references and records QA metadata", async () => {
    process.env.OPENAI_API_KEY = "test-key";

    vi.doMock("@/lib/print-books/storage", () => ({
      storeBookAsset: mockStoreBookAsset,
      isBookAssetStorageConfigured: () => true,
    }));

    vi.doMock("sharp", () => {
      const instance = {
        resize: vi.fn().mockReturnThis(),
        composite: vi.fn().mockReturnThis(),
        removeAlpha: vi.fn().mockReturnThis(),
        raw: vi.fn().mockReturnThis(),
        png: vi.fn().mockReturnThis(),
        jpeg: vi.fn().mockReturnThis(),
        rotate: vi.fn().mockReturnThis(),
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

    const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
      void init;
      if (String(url).startsWith("https://assets.example.com/")) {
        return {
          ok: true,
          arrayBuffer: async () => Buffer.from("reference").buffer,
        };
      }
      return {
        ok: true,
        json: async () => ({
          data: [{ b64_json: Buffer.from("image").toString("base64") }],
        }),
      };
    });
    vi.stubGlobal("fetch", fetchMock);
    mockStoreBookAsset.mockResolvedValue("https://example.com/page.png");

    vi.resetModules();
    const { generateSpreadIllustration } =
      await import("@/lib/print-books/illustrations");

    const baseProject = createProject();
    const project: BookProject = {
      ...baseProject,
      assets: {
        ...baseProject.assets,
        coverImageUrl: "https://assets.example.com/cover.png",
      },
      spreads: [
        {
          ...baseProject.spreads[0]!,
          imageUrl: "https://assets.example.com/cover.png",
        },
        {
          id: "book-1:spread:2",
          bookProjectId: "book-1",
          sequence: 2,
          pageStart: 3,
          pageEnd: 4,
          layoutType: "text_art",
          title: "Garden Path",
          leftPageText: "Mila skipped along the garden path.",
          rightPageText: "",
          sceneBrief: "Mila carries her lantern through the garden path.",
          illustrationPrompt: "Mila on the garden path with her lantern.",
          leftPageImageUrl: "https://assets.example.com/spread-2.png",
          thumbnailUrl: "https://assets.example.com/spread-2-thumb.jpg",
        },
      ],
    };
    const spread = {
      id: "book-1:spread:4",
      bookProjectId: "book-1",
      sequence: 4,
      pageStart: 7,
      pageEnd: 8,
      layoutType: "hero" as const,
      title: "Lantern Walk",
      leftPageText: "Mila and Glenpa walked under the lantern glow.",
      rightPageText: "The silver lantern swung softly beside them.",
      sceneBrief: "Mila and Glenpa share a lantern walk in the same moonlit garden.",
      illustrationPrompt: "Mila and Glenpa walking together under lantern light.",
    };

    const result = await generateSpreadIllustration({
      project,
      story: createStory(),
      profile: createProfile(),
      characterBible: createCharacterBible(),
      visualReferences: [
        {
          id: "profile:profile-1",
          name: "Mila",
          role: "main_child",
          imageUrl: "https://assets.example.com/mila.jpg",
          appearance: "Curly dark hair and bright brown eyes.",
        },
        {
          id: "person:glenpa",
          name: "Glenpa",
          role: "family_friend_pet",
          relationship: "grandparent",
          imageUrl: "https://assets.example.com/glenpa.jpg",
          appearance: "Warm smile, dark-framed glasses, grey hair in a neat bun.",
        },
      ],
      referenceSnapshotKey: "profile|profile-1|snapshot",
      spread,
    });

    const editCall = fetchMock.mock.calls.find((call) =>
      String(call[0]).includes("/images/edits")
    );
    const body = editCall?.[1]?.body as FormData;
    expect(body.get("prompt")).toContain(
      "Approved continuity art references available: Approved spread 2, Approved cover art"
    );
    expect(body.get("prompt")).toContain(
      "Attached approved continuity art sheet order: 1. Approved spread 2 2. Approved cover art"
    );
    expect(
      fetchMock.mock.calls.some(
        (call) => String(call[0]) === "https://assets.example.com/cover.png"
      )
    ).toBe(true);
    expect(
      fetchMock.mock.calls.some(
        (call) => String(call[0]) === "https://assets.example.com/spread-2.png"
      )
    ).toBe(true);
    expect(result.spread.leftPageQa).toMatchObject({
      provider: "openai",
      referenceSnapshotKey: "profile|profile-1|snapshot",
      characterReferenceIds: ["profile:profile-1", "person:glenpa"],
      characterReferenceNames: ["Mila", "Glenpa"],
      continuityReferenceLabels: ["Approved spread 2", "Approved cover art"],
    });

    vi.unstubAllGlobals();
    vi.doUnmock("sharp");
    vi.doUnmock("@/lib/print-books/storage");
  });

  it("prefers prior continuity art with matching cast and scene cues", async () => {
    process.env.OPENAI_API_KEY = "test-key";

    vi.doMock("@/lib/print-books/storage", () => ({
      storeBookAsset: mockStoreBookAsset,
      isBookAssetStorageConfigured: () => true,
    }));

    vi.doMock("sharp", () => {
      const instance = {
        resize: vi.fn().mockReturnThis(),
        composite: vi.fn().mockReturnThis(),
        removeAlpha: vi.fn().mockReturnThis(),
        raw: vi.fn().mockReturnThis(),
        png: vi.fn().mockReturnThis(),
        jpeg: vi.fn().mockReturnThis(),
        rotate: vi.fn().mockReturnThis(),
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

    const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
      void init;
      if (String(url).startsWith("https://assets.example.com/")) {
        return {
          ok: true,
          arrayBuffer: async () => Buffer.from("reference").buffer,
        };
      }
      return {
        ok: true,
        json: async () => ({
          data: [{ b64_json: Buffer.from("image").toString("base64") }],
        }),
      };
    });
    vi.stubGlobal("fetch", fetchMock);
    mockStoreBookAsset.mockResolvedValue("https://example.com/page.png");

    vi.resetModules();
    const { generateSpreadIllustration } =
      await import("@/lib/print-books/illustrations");

    const baseProject = createProject();
    const project: BookProject = {
      ...baseProject,
      assets: {
        ...baseProject.assets,
        coverImageUrl: "https://assets.example.com/cover.png",
      },
      spreads: [
        {
          ...baseProject.spreads[0]!,
          imageUrl: "https://assets.example.com/cover.png",
        },
        {
          id: "book-1:spread:2",
          bookProjectId: "book-1",
          sequence: 2,
          pageStart: 3,
          pageEnd: 4,
          layoutType: "text_art",
          title: "Garden Path",
          leftPageText: "Mila and Glenpa followed the garden lantern path.",
          rightPageText: "",
          sceneBrief: "Mila and Glenpa share a garden lantern walk.",
          illustrationPrompt: "Mila and Glenpa with the silver lantern in the garden.",
          leftPageImageUrl: "https://assets.example.com/spread-2.png",
          leftPageQa: {
            provider: "openai",
            generatedAt: "2026-08-17T00:00:00.000Z",
            characterReferenceIds: ["profile:profile-1", "person:glenpa"],
            characterReferenceNames: ["Mila", "Glenpa"],
            continuityReferenceIds: [],
            continuityReferenceLabels: [],
          },
        },
        {
          id: "book-1:spread:3",
          bookProjectId: "book-1",
          sequence: 3,
          pageStart: 5,
          pageEnd: 6,
          layoutType: "text_art",
          title: "Snowy Hill",
          leftPageText: "Poppy raced down a snowy hill.",
          rightPageText: "",
          sceneBrief: "Poppy enjoys a snowy mountain afternoon.",
          illustrationPrompt: "Poppy in the snow.",
          leftPageImageUrl: "https://assets.example.com/spread-3.png",
          leftPageQa: {
            provider: "openai",
            generatedAt: "2026-08-17T00:00:00.000Z",
            characterReferenceIds: ["person:poppy"],
            characterReferenceNames: ["Poppy"],
            continuityReferenceIds: [],
            continuityReferenceLabels: [],
          },
        },
      ],
    };
    const spread = {
      id: "book-1:spread:5",
      bookProjectId: "book-1",
      sequence: 5,
      pageStart: 9,
      pageEnd: 10,
      layoutType: "hero" as const,
      title: "Lantern Walk",
      leftPageText: "Mila and Glenpa walked beneath the lantern glow.",
      rightPageText: "The silver lantern swung softly beside them.",
      sceneBrief: "Mila and Glenpa return to the moonlit garden path.",
      illustrationPrompt: "Mila and Glenpa walking together under lantern light.",
    };

    const result = await generateSpreadIllustration({
      project,
      story: createStory(),
      profile: createProfile(),
      characterBible: createCharacterBible(),
      visualReferences: [
        {
          id: "profile:profile-1",
          name: "Mila",
          role: "main_child",
          imageUrl: "https://assets.example.com/mila.jpg",
          appearance: "Curly dark hair and bright brown eyes.",
        },
        {
          id: "person:glenpa",
          name: "Glenpa",
          role: "family_friend_pet",
          relationship: "grandparent",
          imageUrl: "https://assets.example.com/glenpa.jpg",
          appearance: "Warm smile, dark-framed glasses, grey hair in a neat bun.",
          isStale: true,
        },
        {
          id: "person:poppy",
          name: "Poppy",
          role: "family_friend_pet",
          relationship: "friend",
          imageUrl: "https://assets.example.com/poppy.jpg",
          appearance: "Red overalls and two braids.",
        },
      ],
      referenceSnapshotKey: "profile|profile-1|snapshot",
      spread,
    });

    expect(
      fetchMock.mock.calls.some(
        (call) => String(call[0]) === "https://assets.example.com/cover.png"
      )
    ).toBe(true);
    expect(
      fetchMock.mock.calls.some(
        (call) => String(call[0]) === "https://assets.example.com/spread-2.png"
      )
    ).toBe(true);
    expect(
      fetchMock.mock.calls.some(
        (call) => String(call[0]) === "https://assets.example.com/spread-3.png"
      )
    ).toBe(false);
    expect(result.spread.leftPageQa?.staleCharacterReferenceNames).toEqual([
      "Glenpa",
    ]);

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
        jpeg: vi.fn().mockReturnThis(),
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
        jpeg: vi.fn().mockReturnThis(),
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
    // Stores the print cover (PNG) plus the web preview (JPEG).
    expect(mockStoreBookAsset).toHaveBeenCalledTimes(2);
    expect(mockStoreBookAsset).toHaveBeenCalledWith(
      expect.objectContaining({ contentType: "image/png" })
    );
    expect(mockStoreBookAsset).toHaveBeenCalledWith(
      expect.objectContaining({ contentType: "image/jpeg" })
    );

    vi.unstubAllGlobals();
    vi.doUnmock("sharp");
    vi.doUnmock("@/lib/print-books/storage");
  });
});
