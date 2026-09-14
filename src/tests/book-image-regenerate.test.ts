import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import type { BookProject } from "@/types/printBook";

const {
  mockAuth,
  mockEnqueueBookImageRegeneration,
  mockDb,
  mockImageRatelimit,
  mockCheckRatelimit,
} = vi.hoisted(() => ({
  mockAuth: vi.fn(async () => ({ userId: "user-1" })),
  mockEnqueueBookImageRegeneration: vi.fn(),
  mockDb: {
    bookProjects: { getById: vi.fn() },
  },
  mockImageRatelimit: {},
  mockCheckRatelimit: vi.fn(async () => null),
}));

vi.mock("@clerk/nextjs/server", () => ({ auth: mockAuth }));
vi.mock("@/lib/db", () => ({ db: mockDb }));
vi.mock("@/lib/bookImageRegenerationJobs", () => ({
  enqueueBookImageRegeneration: mockEnqueueBookImageRegeneration,
}));
vi.mock("@/lib/ratelimit", () => ({
  imageRatelimit: mockImageRatelimit,
  checkRatelimit: mockCheckRatelimit,
}));

function createBookProject(): BookProject {
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
    currentStageLabel: "Ready to download",
    beats: [],
    spreads: [],
    assets: { proofVersion: 1 },
    retryCount: 0,
    createdAt: "2026-07-15T00:00:00.000Z",
    updatedAt: "2026-07-15T00:00:00.000Z",
  };
}

describe("POST /api/books/[id]/images/regenerate", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    mockAuth.mockResolvedValue({ userId: "user-1" });
    mockCheckRatelimit.mockResolvedValue(null);
    mockDb.bookProjects.getById.mockResolvedValue({
      ...createBookProject(),
      spreads: [
        {
          id: "spread-2",
          bookProjectId: "book-1",
          sequence: 2,
          pageStart: 3,
          pageEnd: 4,
          layoutType: "hero",
          leftPageText: "",
          rightPageText: "",
          sceneBrief: "Garden",
          illustrationPrompt: "Garden",
          leftPageImageUrl: "https://example.com/left.png",
          rightPageImageUrl: "https://example.com/right.png",
        },
      ],
    });
    mockEnqueueBookImageRegeneration.mockResolvedValue({
      jobId: "regen-job-1",
      status: "queued",
      attemptKey: "key-1",
      existing: false,
    });
  });

  it("enqueues a regeneration job and returns 202", async () => {
    const { POST } = await import("@/app/api/books/[id]/images/regenerate/route");
    const res = await POST(
      new NextRequest("http://localhost/api/books/book-1/images/regenerate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ spreadId: "spread-2", side: "right" }),
      }),
      { params: Promise.resolve({ id: "book-1" }) }
    );
    expect(res.status).toBe(202);
    const body = await res.json();
    expect(body.jobId).toBe("regen-job-1");
    expect(body.status).toBe("queued");
    expect(mockEnqueueBookImageRegeneration).toHaveBeenCalledWith(
      expect.objectContaining({ spreadId: "spread-2", side: "right" })
    );
  });

  it("passes a user correction note to the enqueue call", async () => {
    const { POST } = await import("@/app/api/books/[id]/images/regenerate/route");
    await POST(
      new NextRequest("http://localhost/api/books/book-1/images/regenerate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          spreadId: "spread-2",
          side: "right",
          correctionNote: "Make the cape blue.",
        }),
      }),
      { params: Promise.resolve({ id: "book-1" }) }
    );
    expect(mockEnqueueBookImageRegeneration).toHaveBeenCalledWith(
      expect.objectContaining({ correctionNote: "Make the cape blue." })
    );
  });

  it("returns 200 when an identical queued job already exists (idempotent)", async () => {
    mockEnqueueBookImageRegeneration.mockResolvedValue({
      jobId: "existing-job",
      status: "queued",
      attemptKey: "key-1",
      existing: true,
    });
    const { POST } = await import("@/app/api/books/[id]/images/regenerate/route");
    const res = await POST(
      new NextRequest("http://localhost/api/books/book-1/images/regenerate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ spreadId: "spread-2", side: "right" }),
      }),
      { params: Promise.resolve({ id: "book-1" }) }
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.existing).toBe(true);
  });

  it("returns 400 when no side is selected", async () => {
    const { POST } = await import("@/app/api/books/[id]/images/regenerate/route");
    const res = await POST(
      new NextRequest("http://localhost/api/books/book-1/images/regenerate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ spreadId: "spread-2", side: "middle" }),
      }),
      { params: Promise.resolve({ id: "book-1" }) }
    );
    expect(res.status).toBe(400);
    expect(mockEnqueueBookImageRegeneration).not.toHaveBeenCalled();
  });

  it("returns 402 when enqueue throws an insufficient-credits error", async () => {
    mockEnqueueBookImageRegeneration.mockRejectedValue(
      new Error("Insufficient credits. Regenerating an image costs 1 credit.")
    );
    const { POST } = await import("@/app/api/books/[id]/images/regenerate/route");
    const res = await POST(
      new NextRequest("http://localhost/api/books/book-1/images/regenerate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ spreadId: "spread-2", side: "left" }),
      }),
      { params: Promise.resolve({ id: "book-1" }) }
    );
    expect(res.status).toBe(402);
  });

  it("returns 404 when the project does not belong to the user", async () => {
    mockDb.bookProjects.getById.mockResolvedValue({
      ...createBookProject(),
      userId: "other-user",
    });
    const { POST } = await import("@/app/api/books/[id]/images/regenerate/route");
    const res = await POST(
      new NextRequest("http://localhost/api/books/book-1/images/regenerate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ spreadId: "spread-2", side: "right" }),
      }),
      { params: Promise.resolve({ id: "book-1" }) }
    );
    expect(res.status).toBe(404);
    expect(mockEnqueueBookImageRegeneration).not.toHaveBeenCalled();
  });
});
