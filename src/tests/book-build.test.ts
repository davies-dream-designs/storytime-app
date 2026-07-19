import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import type { BookBuildJob, BookProject } from "@/types/printBook";

const { mockAfter, mockAuth, mockEnqueueBookBuildJob } = vi.hoisted(() => ({
  mockAfter: vi.fn(async (callback: () => Promise<void> | void) => {
    await callback();
  }),
  mockAuth: vi.fn(async () => ({ userId: "user-1" })),
  mockEnqueueBookBuildJob: vi.fn(),
}));

const mockDb = {
  bookProjects: {
    getById: vi.fn(),
  },
};

vi.mock("next/server", async () => {
  const actual =
    await vi.importActual<typeof import("next/server")>("next/server");
  return {
    ...actual,
    after: mockAfter,
  };
});

vi.mock("@clerk/nextjs/server", () => ({
  auth: mockAuth,
}));

vi.mock("@/lib/db", () => ({
  db: mockDb,
}));

vi.mock("@/lib/print-books/jobs", () => ({
  enqueueBookBuildJob: mockEnqueueBookBuildJob,
}));

vi.mock("@/lib/inngest/client", () => ({
  inngest: { send: vi.fn().mockResolvedValue(undefined) },
  INNGEST_EVENTS: { bookBuildRequested: "storycot/book.build.requested" },
}));

function createBookProject(): BookProject {
  return {
    id: "book-1",
    userId: "user-1",
    sourceStoryId: "story-1",
    profileId: "profile-1",
    ageBand: "3-5",
    status: "queued",
    trimSize: "storycot-dynamic-square",
    pageCount: 32,
    spreadCount: 16,
    completedSpreads: 0,
    totalSpreads: 16,
    currentStageLabel: "Dreaming up the adventure...",
    beats: [],
    spreads: [],
    assets: { proofVersion: 0 },
    retryCount: 0,
    createdAt: "2026-07-15T00:00:00.000Z",
    updatedAt: "2026-07-15T00:00:00.000Z",
  };
}

function createJob(mode: BookBuildJob["mode"] = "full"): BookBuildJob {
  return {
    id: "job-1",
    projectId: "book-1",
    userId: "user-1",
    mode,
    status: "queued",
    step: 0,
    token: "job-token",
    baseUrl: "http://localhost",
    createdAt: "2026-07-16T00:00:00.000Z",
    updatedAt: "2026-07-16T00:00:00.000Z",
  };
}

describe("POST /api/books/[id]/build", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    mockAuth.mockResolvedValue({ userId: "user-1" });
    mockDb.bookProjects.getById.mockResolvedValue(createBookProject());
    mockEnqueueBookBuildJob.mockResolvedValue({
      job: createJob(),
      project: {
        ...createBookProject(),
        assets: {
          proofVersion: 0,
          activeJobId: "job-1",
          activeJobMode: "full",
          activeJobStatus: "queued",
        },
      },
      alreadyQueued: false,
    });
  });

  it("enqueues a full build and dispatches the worker", async () => {
    const { POST } = await import("@/app/api/books/[id]/build/route");
    const res = await POST(
      new NextRequest("http://localhost/api/books/book-1/build", {
        method: "POST",
      }),
      {
        params: Promise.resolve({ id: "book-1" }),
      }
    );

    expect(res.status).toBe(200);
    expect(mockEnqueueBookBuildJob).toHaveBeenCalledWith({
      project: expect.objectContaining({ id: "book-1" }),
      mode: "full",
      baseUrl: "http://localhost",
    });
    const body = await res.json();
    expect(body.assets?.activeJobId).toBe("job-1");
  });

  it("supports queueing explicit build modes", async () => {
    mockEnqueueBookBuildJob.mockResolvedValue({
      job: createJob("art"),
      project: {
        ...createBookProject(),
        status: "illustrating",
        assets: {
          proofVersion: 0,
          activeJobId: "job-1",
          activeJobMode: "art",
          activeJobStatus: "queued",
        },
      },
      alreadyQueued: false,
    });

    const { POST } = await import("@/app/api/books/[id]/build/route");
    const res = await POST(
      new NextRequest("http://localhost/api/books/book-1/build", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode: "art" }),
      }),
      { params: Promise.resolve({ id: "book-1" }) }
    );

    expect(res.status).toBe(200);
    expect(mockEnqueueBookBuildJob).toHaveBeenCalledWith({
      project: expect.objectContaining({ id: "book-1" }),
      mode: "art",
      baseUrl: "http://localhost",
    });
  });

  it("defaults bare ready-book build requests to export refresh", async () => {
    mockDb.bookProjects.getById.mockResolvedValue({
      ...createBookProject(),
      status: "ready",
      spreads: [
        {
          id: "spread-1",
          bookProjectId: "book-1",
          sequence: 1,
          pageStart: 1,
          pageEnd: 2,
          layoutType: "front_matter",
          title: "Cover",
          leftPageText: "",
          rightPageText: "",
          sceneBrief: "Cover",
          illustrationPrompt: "Cover",
        },
      ],
      assets: {
        proofVersion: 1,
        coverImageUrl: "https://example.com/cover.png",
      },
    });

    const { POST } = await import("@/app/api/books/[id]/build/route");
    const res = await POST(
      new NextRequest("http://localhost/api/books/book-1/build", {
        method: "POST",
      }),
      { params: Promise.resolve({ id: "book-1" }) }
    );

    expect(res.status).toBe(200);
    expect(mockEnqueueBookBuildJob).toHaveBeenCalledWith({
      project: expect.objectContaining({ id: "book-1", status: "ready" }),
      mode: "exports",
      baseUrl: "http://localhost",
    });
  });

  it("rejects bare build retries for image-failed books", async () => {
    mockDb.bookProjects.getById.mockResolvedValue({
      ...createBookProject(),
      status: "failed",
      errorCode: "illustrating:image_failed",
    });

    const { POST } = await import("@/app/api/books/[id]/build/route");
    const res = await POST(
      new NextRequest("http://localhost/api/books/book-1/build", {
        method: "POST",
      }),
      { params: Promise.resolve({ id: "book-1" }) }
    );

    expect(res.status).toBe(409);
    await expect(res.json()).resolves.toEqual({
      error: "Retry only the failed image from the spread review.",
    });
    expect(mockEnqueueBookBuildJob).not.toHaveBeenCalled();
  });

  it("returns 409 when another job is already running", async () => {
    mockEnqueueBookBuildJob.mockRejectedValue(
      new Error("A full build is already running for this book.")
    );

    const { POST } = await import("@/app/api/books/[id]/build/route");
    const res = await POST(
      new NextRequest("http://localhost/api/books/book-1/build", {
        method: "POST",
      }),
      {
        params: Promise.resolve({ id: "book-1" }),
      }
    );

    expect(res.status).toBe(409);
    expect(await res.json()).toEqual({
      error: "A full build is already running for this book.",
    });
  });

  it("returns 402 when illustrated generation has insufficient credits", async () => {
    mockEnqueueBookBuildJob.mockRejectedValue(
      new Error("Insufficient credits. This illustrated book costs 8 credits.")
    );

    const { POST } = await import("@/app/api/books/[id]/build/route");
    const res = await POST(
      new NextRequest("http://localhost/api/books/book-1/build", {
        method: "POST",
      }),
      {
        params: Promise.resolve({ id: "book-1" }),
      }
    );

    expect(res.status).toBe(402);
    expect(await res.json()).toEqual({
      error: "Insufficient credits. This illustrated book costs 8 credits.",
    });
  });

  it("returns 404 for missing projects", async () => {
    mockDb.bookProjects.getById.mockResolvedValue(undefined);

    const { POST } = await import("@/app/api/books/[id]/build/route");
    const res = await POST(
      new NextRequest("http://localhost/api/books/book-1/build", {
        method: "POST",
      }),
      {
        params: Promise.resolve({ id: "book-1" }),
      }
    );

    expect(res.status).toBe(404);
    expect(mockEnqueueBookBuildJob).not.toHaveBeenCalled();
  });
});
