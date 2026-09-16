import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import type { BookBuildJob, BookProject } from "@/types/printBook";
import type { TradeTitle } from "@/types/tradeBook";
import type { ChildProfile, Story } from "@/types";

// ── DB mock (memoryDb) ──────────────────────────────────────────────────────
vi.mock("@/lib/db", async () => {
  const { createMemoryDb } = await vi.importActual<
    typeof import("@/tests/helpers/memoryDb")
  >("@/tests/helpers/memoryDb");
  return { db: createMemoryDb() };
});
import { db as mockedDb } from "@/lib/db";
const memoryDb = mockedDb as typeof mockedDb & { _reset(): void };

// ── Admin auth mock ─────────────────────────────────────────────────────────
const mockAdminIdentity = vi.fn();
vi.mock("@/lib/adminAuth", () => ({ getAdminIdentity: mockAdminIdentity }));

// ── processBookBuildJob mock ─────────────────────────────────────────────────
const mockProcessBookBuildJob =
  vi.fn<
    (jobId: string) => Promise<{ job: BookBuildJob; shouldContinue: boolean }>
  >();
vi.mock("@/lib/print-books/jobs", () => ({
  processBookBuildJob: mockProcessBookBuildJob,
}));

// ── generateTradeCharacterBible mock ─────────────────────────────────────────
const mockGenerateTradeCharacterBible = vi.fn();
vi.mock("@/lib/trade-books/generateTradeCharacterBible", () => ({
  generateTradeCharacterBible: mockGenerateTradeCharacterBible,
}));

// ── Env for model config ────────────────────────────────────────────────────
function configureTradeModels() {
  process.env.TRADE_BOOKS_OPENAI_BASE_URL = "https://cliproxy.test/v1";
  process.env.TRADE_BOOKS_OPENAI_API_KEY = "test-key";
  process.env.TRADE_BOOKS_TEXT_MODEL = "trade-text-model";
  process.env.TRADE_BOOKS_REVIEW_MODEL = "trade-review-model";
  process.env.TRADE_BOOKS_TRENDS_MODEL = "trade-trends-model";
  process.env.TRADE_BOOKS_IMAGE_MODEL = "trade-image-model";
  process.env.TRADE_BOOKS_IMAGE_FALLBACK_MODEL = "trade-image-fallback-model";
}

// ── Fixtures ────────────────────────────────────────────────────────────────
function makeProfile(overrides: Partial<ChildProfile> = {}): ChildProfile {
  return {
    id: "profile-1",
    userId: "user-1",
    name: "Mia",
    age: 5,
    favouriteCharacters: [],
    favouriteActivities: [],
    favouriteAnimals: [],
    favouritePlaces: [],
    lessons: [],
    createdAt: "2026-09-16T00:00:00.000Z",
    ...overrides,
  };
}

function makeStory(overrides: Partial<Story> = {}): Story {
  return {
    id: "story-1",
    userId: "user-1",
    title: "Garden Adventure",
    profileId: "profile-1",
    profileName: "Mia",
    pages: [],
    wordCount: 200,
    theme: "Helping neighbours",
    notes: "Warm and gentle.",
    storyPreset: "preschool-story",
    createdAt: "2026-09-16T00:00:00.000Z",
    ...overrides,
  };
}

function makeTitle(overrides: Partial<TradeTitle> = {}): TradeTitle {
  return {
    id: "trade-title-1",
    status: "draft",
    storyId: "story-1",
    profileId: "profile-1",
    seedBrief: {
      theme: "Helping neighbours",
      premise: "A child helps restore a community garden.",
      notes: "Warm and gentle.",
      storyPreset: "preschool-story",
      locale: "en",
      protagonist: { name: "Mia", age: 5, gender: "girl" },
    },
    createdAt: "2026-09-16T00:00:00.000Z",
    updatedAt: "2026-09-16T00:00:00.000Z",
    ...overrides,
  };
}

function makeBuildJob(overrides: Partial<BookBuildJob> = {}): BookBuildJob {
  return {
    id: "job-1",
    projectId: "project-1",
    userId: "trade-system",
    mode: "full",
    status: "queued",
    step: 0,
    token: "token-1",
    baseUrl: "",
    createdAt: "2026-09-16T00:00:00.000Z",
    updatedAt: "2026-09-16T00:00:00.000Z",
    ...overrides,
  };
}

function makeProject(overrides: Partial<BookProject> = {}): BookProject {
  return {
    id: "project-1",
    userId: "trade-system",
    sourceStoryId: "story-1",
    profileId: "profile-1",
    ageBand: "preschool-story",
    status: "queued",
    trimSize: "storycot-dynamic-square",
    pageCount: 24,
    spreadCount: 12,
    completedSpreads: 0,
    totalSpreads: 12,
    currentStageLabel: "Dreaming up the adventure...",
    beats: [],
    spreads: [],
    assets: { proofVersion: 0 },
    retryCount: 0,
    createdAt: "2026-09-16T00:00:00.000Z",
    updatedAt: "2026-09-16T00:00:00.000Z",
    ...overrides,
  };
}

function makeCharacterBible() {
  return {
    childAppearance: "A girl with curly red hair.",
    outfitRules: "Keep it consistent.",
    recurringProps: [],
    companionCharacters: [],
    palette: "Soft greens and yellows.",
    renderStyle: "Warm watercolour.",
    lightingTone: "Bright and cheerful.",
    doNotChange: [],
  };
}

beforeEach(() => {
  vi.resetModules();
  memoryDb._reset();
  configureTradeModels();
  mockAdminIdentity.mockReset();
  mockAdminIdentity.mockResolvedValue({
    userId: "admin-1",
    label: "admin@storycot.test",
  });
  mockProcessBookBuildJob.mockReset();
  mockGenerateTradeCharacterBible.mockReset();
});

// ──────────────────────────────────────────────────────────────────────────────
// 1. Approve action
// ──────────────────────────────────────────────────────────────────────────────
describe("approve action", () => {
  it("creates a BookProject and enqueues a build_trade_book job when approving a title with story+profile", async () => {
    const title = makeTitle();
    const profile = makeProfile();
    const story = makeStory();
    await memoryDb.tradeTitles.create(title);
    await memoryDb.profiles.create(profile);
    await memoryDb.stories.create(story);

    const { POST } =
      await import("@/app/api/admin/trade-titles/[id]/action/route");
    const res = await POST(
      new NextRequest(
        `http://localhost/api/admin/trade-titles/${title.id}/action`,
        { method: "POST", body: JSON.stringify({ decision: "approved" }) }
      ),
      { params: Promise.resolve({ id: title.id }) }
    );

    expect(res.status).toBe(200);
    const { title: updated } = (await res.json()) as { title: TradeTitle };
    expect(updated.status).toBe("approved");
    expect(updated.bookProjectId).toBeDefined();

    // BookProject was saved
    const project = await memoryDb.bookProjects.getById(updated.bookProjectId!);
    expect(project).toBeDefined();
    expect(project?.userId).toBe("trade-system");
    expect(project?.sourceStoryId).toBe("story-1");
    expect(project?.profileId).toBe("profile-1");
    expect(project?.status).toBe("queued");

    // BookBuildJob was saved
    const job = await memoryDb.bookBuildJobs.getCurrentByProjectId(project!.id);
    expect(job).toBeDefined();
    expect(job?.userId).toBe("trade-system");
    expect(job?.mode).toBe("full");
    expect(job?.status).toBe("queued");

    // build_trade_book job was enqueued
    const tradeJob = await memoryDb.tradeBookJobs.claimNext({
      leaseToken: "test",
      now: new Date().toISOString(),
      leaseExpiresAt: new Date(Date.now() + 60_000).toISOString(),
    });
    expect(tradeJob?.kind).toBe("build_trade_book");
    expect(tradeJob?.dedupeKey).toBe(`trade-build:${title.id}:v1`);
    expect(tradeJob?.payload).toMatchObject({
      tradeTitleId: title.id,
      bookProjectId: project?.id,
    });
  });

  it("does not create a BookProject when rejecting a title", async () => {
    const title = makeTitle();
    await memoryDb.tradeTitles.create(title);

    const { POST } =
      await import("@/app/api/admin/trade-titles/[id]/action/route");
    const res = await POST(
      new NextRequest(
        `http://localhost/api/admin/trade-titles/${title.id}/action`,
        { method: "POST", body: JSON.stringify({ decision: "rejected" }) }
      ),
      { params: Promise.resolve({ id: title.id }) }
    );

    expect(res.status).toBe(200);
    const { title: updated } = (await res.json()) as { title: TradeTitle };
    expect(updated.status).toBe("rejected");
    expect(updated.bookProjectId).toBeUndefined();
  });
});

// ──────────────────────────────────────────────────────────────────────────────
// 2. buildTradeBook
// ──────────────────────────────────────────────────────────────────────────────
describe("buildTradeBook", () => {
  it("calls generateTradeCharacterBible then drives processBookBuildJob to completion", async () => {
    const bible = makeCharacterBible();
    mockGenerateTradeCharacterBible.mockResolvedValue(bible);

    const project = makeProject();
    const job = makeBuildJob({ projectId: project.id });
    const title = makeTitle({
      status: "approved",
      bookProjectId: project.id,
    });

    await memoryDb.tradeTitles.create(title);
    await memoryDb.bookProjects.create(project);
    await memoryDb.bookBuildJobs.create(job);
    await memoryDb.profiles.create(makeProfile());
    await memoryDb.stories.create(makeStory());

    // Step 1: advance build
    mockProcessBookBuildJob.mockImplementationOnce(async () => {
      return {
        job: makeBuildJob({ status: "running", step: 1 }),
        shouldContinue: true,
      };
    });
    // Step 2: mark project ready and stop
    mockProcessBookBuildJob.mockImplementationOnce(async () => {
      await memoryDb.bookProjects.update(project.id, { status: "ready" });
      return {
        job: makeBuildJob({ status: "completed", step: 2 }),
        shouldContinue: false,
      };
    });

    const { buildTradeBook } = await import("@/lib/trade-books/buildTradeBook");
    await buildTradeBook(title.id);

    expect(mockGenerateTradeCharacterBible).toHaveBeenCalledOnce();
    expect(mockGenerateTradeCharacterBible).toHaveBeenCalledWith(
      expect.objectContaining({
        profile: expect.objectContaining({ id: "profile-1" }),
        story: expect.objectContaining({ id: "story-1" }),
      })
    );
    expect(mockProcessBookBuildJob).toHaveBeenCalledTimes(2);

    const updatedTitle = await memoryDb.tradeTitles.getById(title.id);
    expect(updatedTitle?.status).toBe("book_ready");
  });

  it("skips character bible generation if already present on the project", async () => {
    const bible = makeCharacterBible();
    const project = makeProject({ characterBible: bible });
    const job = makeBuildJob({ projectId: project.id });
    const title = makeTitle({
      status: "approved",
      bookProjectId: project.id,
    });

    await memoryDb.tradeTitles.create(title);
    await memoryDb.bookProjects.create(project);
    await memoryDb.bookBuildJobs.create(job);
    await memoryDb.profiles.create(makeProfile());
    await memoryDb.stories.create(makeStory());

    mockProcessBookBuildJob.mockImplementationOnce(async () => {
      await memoryDb.bookProjects.update(project.id, { status: "ready" });
      return {
        job: makeBuildJob({ status: "completed", step: 1 }),
        shouldContinue: false,
      };
    });

    const { buildTradeBook } = await import("@/lib/trade-books/buildTradeBook");
    await buildTradeBook(title.id);

    expect(mockGenerateTradeCharacterBible).not.toHaveBeenCalled();
    const updatedTitle = await memoryDb.tradeTitles.getById(title.id);
    expect(updatedTitle?.status).toBe("book_ready");
  });

  it("is idempotent: returns immediately when title is already book_ready", async () => {
    const title = makeTitle({
      status: "book_ready",
      bookProjectId: "project-1",
    });
    await memoryDb.tradeTitles.create(title);

    const { buildTradeBook } = await import("@/lib/trade-books/buildTradeBook");
    await buildTradeBook(title.id);

    expect(mockGenerateTradeCharacterBible).not.toHaveBeenCalled();
    expect(mockProcessBookBuildJob).not.toHaveBeenCalled();
  });

  it("is idempotent: marks book_ready and returns if BookProject is already ready", async () => {
    const project = makeProject({ status: "ready" });
    const title = makeTitle({
      status: "approved",
      bookProjectId: project.id,
    });

    await memoryDb.tradeTitles.create(title);
    await memoryDb.bookProjects.create(project);

    const { buildTradeBook } = await import("@/lib/trade-books/buildTradeBook");
    await buildTradeBook(title.id);

    expect(mockProcessBookBuildJob).not.toHaveBeenCalled();
    const updatedTitle = await memoryDb.tradeTitles.getById(title.id);
    expect(updatedTitle?.status).toBe("book_ready");
  });

  it("throws a permanent error if the title is not in an approved/book_ready status", async () => {
    const title = makeTitle({ status: "draft" });
    await memoryDb.tradeTitles.create(title);

    const { buildTradeBook } = await import("@/lib/trade-books/buildTradeBook");
    const { TradeBookJobPermanentError } =
      await import("@/lib/trade-books/worker");
    await expect(buildTradeBook(title.id)).rejects.toBeInstanceOf(
      TradeBookJobPermanentError
    );
  });
});
