import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ChildProfile, Story } from "@/types";
import type { BookProject } from "@/types/printBook";

const { mockStoreBookAsset, mockBuildCoverPdf, mockGetLuluFlatCoverSpineWidthIn } =
  vi.hoisted(() => ({
    mockStoreBookAsset: vi.fn(),
    mockBuildCoverPdf: vi.fn(),
    mockGetLuluFlatCoverSpineWidthIn: vi.fn(),
  }));

vi.mock("@/lib/print-books/storage", () => ({
  storeBookAsset: mockStoreBookAsset,
}));

vi.mock("@/lib/print-books/pdf/builders", () => ({
  buildCoverPdf: mockBuildCoverPdf,
}));

vi.mock("@/lib/print-books/lulu", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("@/lib/print-books/lulu")>();
  return {
    ...actual,
    getLuluFlatCoverSpineWidthIn: mockGetLuluFlatCoverSpineWidthIn,
  };
});

vi.mock("@/lib/db", async () => {
  const { createMemoryDb } = await vi.importActual<
    typeof import("@/tests/helpers/memoryDb")
  >("@/tests/helpers/memoryDb");
  return { db: createMemoryDb() };
});
import { db as mockedDb } from "@/lib/db";
import { getOrCreateLuluCoverPdfUrl } from "@/lib/print-books/lazyCovers";

const memoryDb = mockedDb as typeof mockedDb & { _reset(): void };

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
        illustrationPrompt: "A magical moonlight garden.",
      },
    ],
  };
}

function createProject(overrides?: Partial<BookProject>): BookProject {
  return {
    id: "book-1",
    userId: "user-1",
    sourceStoryId: "story-1",
    profileId: "profile-1",
    ageBand: "3-5",
    status: "ready",
    trimSize: "storycot-dynamic-square",
    pageCount: 32,
    spreadCount: 16,
    completedSpreads: 16,
    totalSpreads: 16,
    currentStageLabel: "Ready",
    beats: [],
    spreads: [],
    assets: {
      proofVersion: 1,
      luluPrintPdfUrl: "https://assets.storycot.test/book-1-lulu-print.pdf",
      luluPrintPdfPageCount: 32,
      orderabilityState: "export_ready",
    },
    retryCount: 0,
    createdAt: "2026-07-15T00:00:00.000Z",
    updatedAt: "2026-07-15T00:00:00.000Z",
    ...overrides,
  };
}

describe("getOrCreateLuluCoverPdfUrl", () => {
  beforeEach(() => {
    memoryDb._reset();
    vi.clearAllMocks();
    mockGetLuluFlatCoverSpineWidthIn.mockResolvedValue(0.132);
    mockBuildCoverPdf.mockResolvedValue(new Uint8Array([1, 2, 3]));
    mockStoreBookAsset.mockResolvedValue(
      "https://assets.storycot.test/book-1-lulu-cover-paperback.pdf"
    );
  });

  it("generates and persists a new cover on first call", async () => {
    const project = createProject();
    await memoryDb.bookProjects.create(project);

    const url = await getOrCreateLuluCoverPdfUrl({
      project,
      story: createStory(),
      profile: createProfile(),
      productKey: "paperback",
    });

    expect(url).toBe(
      "https://assets.storycot.test/book-1-lulu-cover-paperback.pdf"
    );
    expect(mockGetLuluFlatCoverSpineWidthIn).toHaveBeenCalledWith(
      32,
      "paperback"
    );
    expect(mockBuildCoverPdf).toHaveBeenCalledWith(
      expect.objectContaining({ spineWidthIn: 0.132, productKey: "paperback" })
    );
    expect(mockStoreBookAsset).toHaveBeenCalledWith(
      expect.objectContaining({
        pathname: "books/book-1/lulu-cover-paperback.pdf",
      })
    );

    const persisted = await memoryDb.bookProjects.getById("book-1");
    expect(
      persisted?.assets.luluFlatCoverPdfUrlByProduct?.paperback
    ).toBe("https://assets.storycot.test/book-1-lulu-cover-paperback.pdf");
  });

  it("returns the cached URL on a second call without regenerating", async () => {
    const project = createProject({
      assets: {
        ...createProject().assets,
        luluFlatCoverPdfUrlByProduct: {
          paperback: "https://assets.storycot.test/already-cached.pdf",
        },
      },
    });
    await memoryDb.bookProjects.create(project);

    const url = await getOrCreateLuluCoverPdfUrl({
      project,
      story: createStory(),
      profile: createProfile(),
      productKey: "paperback",
    });

    expect(url).toBe("https://assets.storycot.test/already-cached.pdf");
    expect(mockBuildCoverPdf).not.toHaveBeenCalled();
    expect(mockGetLuluFlatCoverSpineWidthIn).not.toHaveBeenCalled();
  });

  it("keeps paperback and coil covers independently cached on the same book", async () => {
    const project = createProject({
      assets: {
        ...createProject().assets,
        luluFlatCoverPdfUrlByProduct: {
          paperback: "https://assets.storycot.test/paperback-cover.pdf",
        },
      },
    });
    await memoryDb.bookProjects.create(project);
    mockStoreBookAsset.mockResolvedValue(
      "https://assets.storycot.test/coil-cover.pdf"
    );

    const url = await getOrCreateLuluCoverPdfUrl({
      project,
      story: createStory(),
      profile: createProfile(),
      productKey: "coil",
    });

    expect(url).toBe("https://assets.storycot.test/coil-cover.pdf");
    const persisted = await memoryDb.bookProjects.getById("book-1");
    expect(persisted?.assets.luluFlatCoverPdfUrlByProduct).toEqual({
      paperback: "https://assets.storycot.test/paperback-cover.pdf",
      coil: "https://assets.storycot.test/coil-cover.pdf",
    });
  });

  it("propagates a live spine-width lookup failure rather than falling back to a guess", async () => {
    const project = createProject();
    await memoryDb.bookProjects.create(project);
    mockGetLuluFlatCoverSpineWidthIn.mockRejectedValue(
      new Error("Lulu cover dimensions response was incomplete.")
    );

    await expect(
      getOrCreateLuluCoverPdfUrl({
        project,
        story: createStory(),
        profile: createProfile(),
        productKey: "paperback",
      })
    ).rejects.toThrow("Lulu cover dimensions response was incomplete.");
    expect(mockBuildCoverPdf).not.toHaveBeenCalled();
  });
});
