import { beforeEach, describe, expect, it, vi } from "vitest";
import type { BookBuildJob, BookProject } from "@/types/printBook";

const { store, mockGenerateBookEpub, mockGenerateBookPdfs } = vi.hoisted(() => ({
  store: new Map<string, unknown>(),
  mockGenerateBookEpub: vi.fn(),
  mockGenerateBookPdfs: vi.fn(),
}));

vi.mock("@vercel/kv", () => ({
  kv: {
    get: vi.fn(async (key: string) => store.get(key) ?? null),
    set: vi.fn(async (key: string, value: unknown) => {
      store.set(key, value);
    }),
    setnx: vi.fn(async (key: string, value: unknown) => {
      if (store.has(key)) return 0;
      store.set(key, value);
      return 1;
    }),
    del: vi.fn(async (key: string) => {
      store.delete(key);
    }),
  },
}));

vi.mock("@/lib/print-books/pdf", () => ({
  generateBookPdfs: mockGenerateBookPdfs,
}));

vi.mock("@/lib/print-books/epub", () => ({
  generateBookEpub: mockGenerateBookEpub,
}));

function createReadyProject(): BookProject {
  return {
    id: "book-1",
    userId: "user-1",
    sourceStoryId: "story-1",
    profileId: "profile-1",
    ageBand: "6-8",
    status: "ready",
    trimSize: "storycot-dynamic-square",
    pageCount: 24,
    spreadCount: 12,
    completedSpreads: 12,
    totalSpreads: 12,
    currentStageLabel: "Your illustrated book is ready to order.",
    beats: [],
    characterBible: {
      childAppearance: "Bailey has blond hair.",
      outfitRules: "Keep the black jumper and green boots.",
      recurringProps: [],
      companionCharacters: [],
      palette: "warm watercolor",
      renderStyle: "soft storybook watercolor",
      lightingTone: "gentle sunlight",
      doNotChange: ["Bailey"],
    },
    spreads: [
      {
        id: "spread-1",
        bookProjectId: "book-1",
        sequence: 2,
        pageStart: 3,
        pageEnd: 4,
        layoutType: "text_art",
        title: "Page 1",
        leftPageText: "Once upon a time.",
        rightPageText: "",
        sceneBrief: "A sunny garden.",
        illustrationPrompt: "A sunny garden.",
        imageUrl: "https://example.com/spread.png",
        leftPageImageUrl: "https://example.com/spread.png",
      },
    ],
    assets: {
      proofVersion: 1,
      coverImageUrl: "https://example.com/cover.png",
      printPdfUrl: "https://example.com/book.pdf",
      epubUrl: "https://example.com/book.epub",
    },
    retryCount: 0,
    createdAt: "2026-07-20T00:00:00.000Z",
    updatedAt: "2026-07-20T00:00:00.000Z",
    readyAt: "2026-07-20T00:00:00.000Z",
  };
}

function createExportJob(): BookBuildJob {
  return {
    id: "job-1",
    projectId: "book-1",
    userId: "user-1",
    mode: "exports",
    status: "queued",
    step: 0,
    totalSteps: 1,
    token: "job-token",
    baseUrl: "http://localhost",
    createdAt: "2026-07-20T00:01:00.000Z",
    updatedAt: "2026-07-20T00:01:00.000Z",
  };
}

describe("book export refresh jobs", () => {
  beforeEach(() => {
    vi.resetModules();
    store.clear();
    mockGenerateBookEpub.mockReset();
    mockGenerateBookPdfs.mockReset();
    mockGenerateBookPdfs.mockResolvedValue({
      coverPdfUrl: "https://example.com/cover.pdf",
      coverPdfReadyForOrdering: true,
      coverPdfSpineWidthIn: 0.25,
      coverPdfSpineSource: "calculated",
      coverPdfPageWidthIn: 17.75,
      coverPdfPageHeightIn: 8.75,
      coverSpineTextIncluded: true,
      printPdfUrl: "https://example.com/book.pdf",
      luluCoverPdfUrl: "https://example.com/lulu-cover.pdf",
      luluCoverPdfPageWidthIn: 18,
      luluCoverPdfPageHeightIn: 8.75,
      luluCoverPdfSpineWidthIn: 0.5,
      luluPrintPdfUrl: "https://example.com/lulu-print.pdf",
      luluPrintPdfPageWidthIn: 8.5,
      luluPrintPdfPageHeightIn: 8.5,
      luluPrintPdfPageCount: 24,
      printPdfPageWidthIn: 8.55,
      printPdfPageHeightIn: 8.55,
      interiorTextSafeMarginIn: 0.35,
      previewImages: [],
    });
    mockGenerateBookEpub.mockResolvedValue({
      epubUrl: "https://example.com/book.epub",
    });
  });

  it("keeps a ready book ready while export refresh is queued", async () => {
    const { db } = await import("@/lib/db");
    const { enqueueBookBuildJob } = await import("@/lib/print-books/jobs");
    const project = createReadyProject();
    await db.bookProjects.create(project);

    const result = await enqueueBookBuildJob({
      project,
      mode: "exports",
      baseUrl: "http://localhost",
    });

    expect(result.project.status).toBe("ready");
    expect(result.project.currentStageLabel).toBe(
      "Queued to refresh export files..."
    );
    expect(result.project.assets.activeJobMode).toBe("exports");
    expect(result.project.assets.activeJobStatus).toBe("queued");
  });

  it("does not mark a ready book failed when export refresh fails", async () => {
    const { db } = await import("@/lib/db");
    const { processBookBuildJob } = await import("@/lib/print-books/jobs");
    await db.bookProjects.create({
      ...createReadyProject(),
      assets: {
        ...createReadyProject().assets,
        activeJobId: "job-1",
        activeJobMode: "exports",
        activeJobStatus: "queued",
      },
    });
    await db.stories.create({
      id: "story-1",
      userId: "user-1",
      profileId: "profile-1",
      profileName: "Bailey",
      title: "The Garden",
      pages: [
        {
          pageNumber: 1,
          text: "Once upon a time.",
          illustrationPrompt: "A sunny garden.",
        },
      ],
      wordCount: 4,
      theme: "bravery",
      premise: "A garden story",
      notes: "",
      createdAt: "2026-07-20T00:00:00.000Z",
    });
    await db.profiles.create({
      id: "profile-1",
      userId: "user-1",
      name: "Bailey",
      age: 6,
      favouriteCharacters: [],
      favouriteActivities: [],
      favouriteAnimals: [],
      favouritePlaces: [],
      lessons: [],
      createdAt: "2026-07-20T00:00:00.000Z",
    });
    await db.bookBuildJobs.create(createExportJob());
    mockGenerateBookPdfs.mockRejectedValue(new Error("PDF render failed"));

    await expect(processBookBuildJob("job-1")).rejects.toThrow(
      "PDF render failed"
    );

    const project = await db.bookProjects.getById("book-1");
    const job = await db.bookBuildJobs.getById("job-1");
    expect(project?.status).toBe("ready");
    expect(project?.currentStageLabel).toBe(
      "Your illustrated book is ready to order."
    );
    expect(project?.errorMessage).toBe(
      "Export refresh didn't finish. Your book is still available; refresh the PDFs again to retry."
    );
    expect(project?.assets.activeJobStatus).toBeUndefined();
    expect(job?.status).toBe("failed");
  });

  it("clears stale image errors when the generated image exists", async () => {
    const { db } = await import("@/lib/db");
    const { processBookBuildJob } = await import("@/lib/print-books/jobs");
    const readyProject = createReadyProject();
    await db.bookProjects.create({
      ...readyProject,
      assets: {
        ...readyProject.assets,
        activeJobId: "job-1",
        activeJobMode: "exports",
        activeJobStatus: "queued",
      },
      spreads: readyProject.spreads.map((spread) => ({
        ...spread,
        leftPageImageError: "Previous transient image error",
      })),
    });
    await db.stories.create({
      id: "story-1",
      userId: "user-1",
      profileId: "profile-1",
      profileName: "Bailey",
      title: "The Garden",
      pages: [
        {
          pageNumber: 1,
          text: "Once upon a time.",
          illustrationPrompt: "A sunny garden.",
        },
      ],
      wordCount: 4,
      theme: "bravery",
      premise: "A garden story",
      notes: "",
      createdAt: "2026-07-20T00:00:00.000Z",
    });
    await db.profiles.create({
      id: "profile-1",
      userId: "user-1",
      name: "Bailey",
      age: 6,
      favouriteCharacters: [],
      favouriteActivities: [],
      favouriteAnimals: [],
      favouritePlaces: [],
      lessons: [],
      createdAt: "2026-07-20T00:00:00.000Z",
    });
    await db.bookBuildJobs.create(createExportJob());

    await expect(processBookBuildJob("job-1")).resolves.toMatchObject({
      shouldContinue: false,
    });

    const project = await db.bookProjects.getById("book-1");
    expect(project?.status).toBe("ready");
    expect(project?.spreads[0]?.leftPageImageUrl).toBe(
      "https://example.com/spread.png"
    );
    expect(project?.spreads[0]?.leftPageImageError).toBeUndefined();
    expect(project?.assets.activeJobStatus).toBeUndefined();
  });

  it("allows export refresh even when image failure metadata remains unresolved", async () => {
    const { db } = await import("@/lib/db");
    const { processBookBuildJob } = await import("@/lib/print-books/jobs");
    const readyProject = createReadyProject();
    await db.bookProjects.create({
      ...readyProject,
      assets: {
        ...readyProject.assets,
        activeJobId: "job-1",
        activeJobMode: "exports",
        activeJobStatus: "queued",
      },
      spreads: readyProject.spreads.map((spread) => ({
        ...spread,
        imageUrl: undefined,
        leftPageImageUrl: undefined,
        leftPageImageError: "Image generation failed",
      })),
    });
    await db.stories.create({
      id: "story-1",
      userId: "user-1",
      profileId: "profile-1",
      profileName: "Bailey",
      title: "The Garden",
      pages: [
        {
          pageNumber: 1,
          text: "Once upon a time.",
          illustrationPrompt: "A sunny garden.",
        },
      ],
      wordCount: 4,
      theme: "bravery",
      premise: "A garden story",
      notes: "",
      createdAt: "2026-07-20T00:00:00.000Z",
    });
    await db.profiles.create({
      id: "profile-1",
      userId: "user-1",
      name: "Bailey",
      age: 6,
      favouriteCharacters: [],
      favouriteActivities: [],
      favouriteAnimals: [],
      favouritePlaces: [],
      lessons: [],
      createdAt: "2026-07-20T00:00:00.000Z",
    });
    await db.bookBuildJobs.create(createExportJob());

    await expect(processBookBuildJob("job-1")).resolves.toMatchObject({
      shouldContinue: false,
    });

    const project = await db.bookProjects.getById("book-1");
    expect(project?.status).toBe("ready");
    expect(project?.spreads[0]?.leftPageImageError).toBe(
      "Image generation failed"
    );
    expect(project?.assets.activeJobStatus).toBeUndefined();
  });
});
