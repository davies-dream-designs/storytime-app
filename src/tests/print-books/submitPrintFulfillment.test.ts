import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ChildProfile, Story } from "@/types";
import type { BookProject, PrintBookOrder } from "@/types/printBook";

const { mockSubmitLuluPrintJob, mockGetOrCreateLuluCoverPdfUrl, mockLogEvent } =
  vi.hoisted(() => ({
    mockSubmitLuluPrintJob: vi.fn(),
    mockGetOrCreateLuluCoverPdfUrl: vi.fn(),
    mockLogEvent: vi.fn(),
  }));

vi.mock("@/lib/print-books/lulu", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("@/lib/print-books/lulu")>();
  return {
    ...actual,
    submitLuluPrintJob: mockSubmitLuluPrintJob,
  };
});

vi.mock("@/lib/print-books/lazyCovers", () => ({
  getOrCreateLuluCoverPdfUrl: mockGetOrCreateLuluCoverPdfUrl,
}));

vi.mock("@/lib/logEvent", () => ({
  logEvent: mockLogEvent,
}));

vi.mock("@/lib/db", async () => {
  const { createMemoryDb } = await vi.importActual<
    typeof import("@/tests/helpers/memoryDb")
  >("@/tests/helpers/memoryDb");
  return { db: createMemoryDb() };
});
import { db as mockedDb } from "@/lib/db";
import { submitPrintFulfillment } from "@/lib/print-books/fulfillment";

const memoryDb = mockedDb as typeof mockedDb & { _reset(): void };
const previousEnv = process.env;

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
    createdAt: "2026-07-17T00:00:00.000Z",
    updatedAt: "2026-07-17T00:00:00.000Z",
    ...overrides,
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

function createOrder(overrides?: Partial<PrintBookOrder>): PrintBookOrder {
  return {
    productKey: "paperback",
    productLabel: "Paperback",
    provider: "Lulu",
    format: '8.5" square paperback',
    status: "paid",
    amountAud: 24.95,
    pageCount: 32,
    checkoutSessionId: "cs_test_123",
    shipping: {
      name: "Mila Reader",
      email: "mila@example.com",
      line1: "1 Story Lane",
      city: "Sydney",
      state: "NSW",
      postalCode: "2000",
      countryCode: "AU",
    },
    paidAt: "2026-07-17T00:00:00.000Z",
    ...overrides,
  };
}

describe("submitPrintFulfillment (paperback/coil lazy cover integration)", () => {
  beforeEach(() => {
    memoryDb._reset();
    vi.clearAllMocks();
    process.env = { ...previousEnv, STORYCOT_PRINT_PROVIDER: "lulu" };
    mockSubmitLuluPrintJob.mockResolvedValue({
      orderId: "lulu-order-1",
      externalStatus: "CREATED",
    });
  });

  it("generates the paperback cover just-in-time and submits successfully", async () => {
    const project = createProject();
    await memoryDb.bookProjects.create(project);
    await memoryDb.stories.create(createStory());
    await memoryDb.profiles.create(createProfile());
    mockGetOrCreateLuluCoverPdfUrl.mockImplementation(async () => {
      await memoryDb.bookProjects.update("book-1", {
        assets: {
          ...project.assets,
          luluFlatCoverPdfUrlByProduct: {
            paperback: "https://assets.storycot.test/lazy-cover.pdf",
          },
        },
      });
      return "https://assets.storycot.test/lazy-cover.pdf";
    });

    const result = await submitPrintFulfillment({
      project,
      order: createOrder(),
    });

    expect(mockGetOrCreateLuluCoverPdfUrl).toHaveBeenCalledWith(
      expect.objectContaining({ productKey: "paperback" })
    );
    expect(result.status).toBe("submitted");
    expect(result.externalOrderId).toBe("lulu-order-1");
    expect(mockSubmitLuluPrintJob).toHaveBeenCalledWith(
      expect.objectContaining({
        line_items: [
          expect.objectContaining({
            printable_normalization: expect.objectContaining({
              cover: { source_url: "https://assets.storycot.test/lazy-cover.pdf" },
            }),
          }),
        ],
      })
    );
  });

  it("skips lazy generation entirely for hardcover (unchanged eager path)", async () => {
    const project = createProject({
      assets: {
        ...createProject().assets,
        luluCoverPdfUrl: "https://assets.storycot.test/eager-hardcover-cover.pdf",
      },
    });
    await memoryDb.bookProjects.create(project);

    await submitPrintFulfillment({
      project,
      order: createOrder({
        productKey: "hardcover",
        productLabel: "Hardcover",
        format: '8.5" square hardcover casewrap',
      }),
    });

    expect(mockGetOrCreateLuluCoverPdfUrl).not.toHaveBeenCalled();
  });

  it("does not re-generate the cover once it's already cached from a prior order", async () => {
    const project = createProject({
      assets: {
        ...createProject().assets,
        luluFlatCoverPdfUrlByProduct: {
          paperback: "https://assets.storycot.test/already-cached.pdf",
        },
      },
    });
    await memoryDb.bookProjects.create(project);

    await submitPrintFulfillment({ project, order: createOrder() });

    expect(mockGetOrCreateLuluCoverPdfUrl).not.toHaveBeenCalled();
    expect(mockSubmitLuluPrintJob).toHaveBeenCalledWith(
      expect.objectContaining({
        line_items: [
          expect.objectContaining({
            printable_normalization: expect.objectContaining({
              cover: {
                source_url: "https://assets.storycot.test/already-cached.pdf",
              },
            }),
          }),
        ],
      })
    );
  });

  it("fails gracefully (not_configured, logged) rather than throwing when the live spine-width/cover build fails", async () => {
    const project = createProject();
    await memoryDb.bookProjects.create(project);
    await memoryDb.stories.create(createStory());
    await memoryDb.profiles.create(createProfile());
    mockGetOrCreateLuluCoverPdfUrl.mockRejectedValue(
      new Error("Lulu cover dimensions response was incomplete.")
    );

    const result = await submitPrintFulfillment({
      project,
      order: createOrder(),
    });

    expect(result.status).toBe("not_configured");
    expect(result.message).toContain("Lulu cover dimensions");
    expect(mockSubmitLuluPrintJob).not.toHaveBeenCalled();
    expect(mockLogEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        code: "print.fulfillment_config_missing",
        context: expect.objectContaining({ productKey: "paperback" }),
      })
    );
  });

  it("fails gracefully when the book's source story/profile is missing (never crashes fulfillment)", async () => {
    const project = createProject();
    await memoryDb.bookProjects.create(project);
    // Deliberately not seeding stories/profiles.

    const result = await submitPrintFulfillment({
      project,
      order: createOrder(),
    });

    expect(result.status).toBe("not_configured");
    expect(result.message).toContain("source story or profile is missing");
    expect(mockGetOrCreateLuluCoverPdfUrl).not.toHaveBeenCalled();
    expect(mockSubmitLuluPrintJob).not.toHaveBeenCalled();
  });
});
