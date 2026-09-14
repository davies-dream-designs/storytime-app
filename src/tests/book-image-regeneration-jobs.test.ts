import { beforeEach, describe, expect, it, vi } from "vitest";
import type { BookProject, BookSpread } from "@/types/printBook";

const {
  mockInngestSend,
  mockAssertImageRegenerationAffordable,
  mockChargeImageRegenerationCredit,
  mockCaptureIllustratedBookCredits,
  mockRefundIllustratedBookCredits,
  mockReserveIllustratedBookCredits,
  mockRegenerateBookSpreadPageImage,
  mockLogEvent,
  mockDb,
} = vi.hoisted(() => ({
  mockInngestSend: vi.fn(async () => {}),
  mockAssertImageRegenerationAffordable: vi.fn(async () => {}),
  mockChargeImageRegenerationCredit: vi.fn(async () => ({ credits: 2, isAdmin: false })),
  mockCaptureIllustratedBookCredits: vi.fn(async (p: BookProject) => ({
    ...p,
    billing: { ...p.billing, status: "captured" },
  })),
  mockRefundIllustratedBookCredits: vi.fn(async () => {}),
  mockReserveIllustratedBookCredits: vi.fn(async (p: BookProject) => ({
    ...p,
    billing: {
      product: "illustrated_book",
      status: "reserved",
      credits: 10,
      reservedAt: "2026-01-01T00:00:00.000Z",
    },
  })),
  mockRegenerateBookSpreadPageImage: vi.fn(),
  mockLogEvent: vi.fn(async () => {}),
  mockDb: {
    bookProjects: {
      getById: vi.fn(),
      update: vi.fn(),
    },
  },
}));

vi.mock("@/lib/inngest/client", () => ({
  inngest: { send: mockInngestSend },
  INNGEST_EVENTS: {
    bookImageRegenerationRequested: "storycot/book.image.regeneration.requested",
  },
}));

vi.mock("@/lib/credits", () => ({
  assertImageRegenerationAffordable: mockAssertImageRegenerationAffordable,
  chargeImageRegenerationCredit: mockChargeImageRegenerationCredit,
  captureIllustratedBookCredits: mockCaptureIllustratedBookCredits,
  refundIllustratedBookCredits: mockRefundIllustratedBookCredits,
  reserveIllustratedBookCredits: mockReserveIllustratedBookCredits,
}));

vi.mock("@/lib/print-books/jobs", () => ({
  regenerateBookSpreadPageImage: mockRegenerateBookSpreadPageImage,
}));

vi.mock("@/lib/print-books/illustrations", () => ({
  applySpreadIllustration: (spreads: BookSpread[], next: BookSpread) =>
    spreads.map((s) => (s.id === next.id ? next : s)),
}));

vi.mock("@/lib/logEvent", () => ({ logEvent: mockLogEvent }));
vi.mock("@/lib/db", () => ({ db: mockDb }));

function makeSpread(overrides?: Partial<BookSpread>): BookSpread {
  return {
    id: "spread-1",
    bookProjectId: "book-1",
    sequence: 1,
    pageStart: 1,
    pageEnd: 2,
    layoutType: "hero",
    leftPageText: "",
    rightPageText: "",
    sceneBrief: "Forest",
    illustrationPrompt: "Forest",
    rightPageImageUrl: "https://blob.example/old.png",
    ...overrides,
  };
}

function makeProject(overrides?: Partial<BookProject>): BookProject {
  return {
    id: "book-1",
    userId: "user-1",
    sourceStoryId: "story-1",
    profileId: "profile-1",
    ageBand: "3-5",
    status: "ready",
    trimSize: "storycot-dynamic-square",
    pageCount: 32,
    spreadCount: 1,
    completedSpreads: 1,
    totalSpreads: 1,
    currentStageLabel: "Ready",
    beats: [],
    spreads: [makeSpread()],
    assets: { proofVersion: 1 },
    retryCount: 0,
    createdAt: "2026-07-15T00:00:00.000Z",
    updatedAt: "2026-07-15T00:00:00.000Z",
    ...overrides,
  };
}

describe("enqueueBookImageRegeneration", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    mockDb.bookProjects.update.mockResolvedValue(makeProject());
  });

  it("enqueues and returns queued status for a paid redo", async () => {
    const { enqueueBookImageRegeneration } = await import(
      "@/lib/bookImageRegenerationJobs"
    );
    const p = makeProject({
      billing: {
        product: "illustrated_book",
        status: "captured",
        credits: 10,
        capturedAt: "2026-01-01T00:00:00.000Z",
      },
    });
    const result = await enqueueBookImageRegeneration({
      project: p,
      spreadId: "spread-1",
      side: "right",
    });
    expect(result.status).toBe("queued");
    expect(result.existing).toBe(false);
    expect(mockAssertImageRegenerationAffordable).toHaveBeenCalledWith("user-1");
    expect(mockInngestSend).toHaveBeenCalledWith(
      expect.objectContaining({
        name: "storycot/book.image.regeneration.requested",
      })
    );
  });

  it("returns existing when the same side already has an active queued job", async () => {
    const { enqueueBookImageRegeneration } = await import(
      "@/lib/bookImageRegenerationJobs"
    );
    const p = makeProject({
      spreads: [
        makeSpread({
          rightPageImageStatus: "queued",
          rightPageImageJobId: "existing-regen-job",
          rightPageImageAttemptKey: "key-x",
        }),
      ],
    });
    const result = await enqueueBookImageRegeneration({
      project: p,
      spreadId: "spread-1",
      side: "right",
    });
    expect(result.existing).toBe(true);
    expect(result.jobId).toBe("existing-regen-job");
    expect(mockInngestSend).not.toHaveBeenCalled();
  });
});

describe("processBookImageRegenerationJob", () => {
  const baseInput = {
    jobId: "regen-1",
    userId: "user-1",
    projectId: "book-1",
    spreadId: "spread-1",
    side: "right" as const,
    attemptKey: "key-1",
    shouldChargeRedo: false,
    reservedBookCharge: false,
  };

  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    const readySpread = makeSpread({
      rightPageImageUrl: "https://blob.example/new.png",
      rightPageImageStatus: "ready",
      rightPageImageJobId: undefined,
      rightPageImageAttemptKey: "key-1",
    });
    const readyProject = makeProject({ status: "ready", spreads: [readySpread] });
    mockRegenerateBookSpreadPageImage.mockResolvedValue(readyProject);
    mockDb.bookProjects.getById.mockResolvedValue(readyProject);
    mockDb.bookProjects.update.mockResolvedValue(readyProject);
  });

  it("returns ready status on successful regeneration", async () => {
    const { processBookImageRegenerationJob } = await import(
      "@/lib/bookImageRegenerationJobs"
    );
    const result = await processBookImageRegenerationJob(baseInput);
    expect(result.status).toBe("ready");
    expect(mockRegenerateBookSpreadPageImage).toHaveBeenCalledWith(
      expect.objectContaining({ jobId: "regen-1", side: "right" })
    );
  });

  it("charges one credit after successful redo when shouldChargeRedo is true", async () => {
    const { processBookImageRegenerationJob } = await import(
      "@/lib/bookImageRegenerationJobs"
    );
    await processBookImageRegenerationJob({ ...baseInput, shouldChargeRedo: true });
    expect(mockChargeImageRegenerationCredit).toHaveBeenCalledWith("user-1");
  });

  it("does not charge when shouldChargeRedo is false", async () => {
    const { processBookImageRegenerationJob } = await import(
      "@/lib/bookImageRegenerationJobs"
    );
    await processBookImageRegenerationJob(baseInput);
    expect(mockChargeImageRegenerationCredit).not.toHaveBeenCalled();
  });

  it("returns failed and does not charge when regeneration throws", async () => {
    mockRegenerateBookSpreadPageImage.mockRejectedValue(
      new Error("provider timeout")
    );
    mockDb.bookProjects.getById.mockResolvedValue(makeProject());
    mockDb.bookProjects.update.mockResolvedValue(makeProject());

    const { processBookImageRegenerationJob } = await import(
      "@/lib/bookImageRegenerationJobs"
    );
    const result = await processBookImageRegenerationJob({
      ...baseInput,
      shouldChargeRedo: true,
    });
    expect(result.status).toBe("failed");
    expect(mockChargeImageRegenerationCredit).not.toHaveBeenCalled();
    expect(mockLogEvent).toHaveBeenCalled();
  });

  it("refunds reserved credits when regeneration fails and reservedBookCharge is true", async () => {
    mockRegenerateBookSpreadPageImage.mockRejectedValue(
      new Error("provider failed")
    );
    const reservedProject = makeProject({
      billing: {
        product: "illustrated_book",
        status: "reserved",
        credits: 10,
        reservedAt: "2026-01-01T00:00:00.000Z",
      },
    });
    mockDb.bookProjects.getById.mockResolvedValue(reservedProject);
    mockDb.bookProjects.update.mockResolvedValue(reservedProject);

    const { processBookImageRegenerationJob } = await import(
      "@/lib/bookImageRegenerationJobs"
    );
    await processBookImageRegenerationJob({ ...baseInput, reservedBookCharge: true });
    expect(mockRefundIllustratedBookCredits).toHaveBeenCalled();
  });
});
