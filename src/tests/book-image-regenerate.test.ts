import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import type { BookProject } from "@/types/printBook";

const {
  mockAuth,
  mockChargeImageRegenerationCredit,
  mockDb,
  mockRefundImageRegenerationCredit,
  mockRegenerateBookSpreadPageImage,
} = vi.hoisted(() => ({
  mockAuth: vi.fn(async () => ({ userId: "user-1" })),
  mockChargeImageRegenerationCredit: vi.fn(),
  mockDb: {
    bookProjects: {
      getById: vi.fn(),
    },
  },
  mockRefundImageRegenerationCredit: vi.fn(),
  mockRegenerateBookSpreadPageImage: vi.fn(),
}));

vi.mock("@clerk/nextjs/server", () => ({
  auth: mockAuth,
}));

vi.mock("@/lib/credits", () => ({
  chargeImageRegenerationCredit: mockChargeImageRegenerationCredit,
  refundImageRegenerationCredit: mockRefundImageRegenerationCredit,
}));

vi.mock("@/lib/db", () => ({
  db: mockDb,
}));

vi.mock("@/lib/print-books/jobs", () => ({
  regenerateBookSpreadPageImage: mockRegenerateBookSpreadPageImage,
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
    mockChargeImageRegenerationCredit.mockResolvedValue({
      credits: 2,
      isAdmin: false,
    });
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
    mockRegenerateBookSpreadPageImage.mockResolvedValue(createBookProject());
  });

  it("charges 1 credit when redoing an existing good spread image", async () => {
    const { POST } =
      await import("@/app/api/books/[id]/images/regenerate/route");
    const res = await POST(
      new NextRequest("http://localhost/api/books/book-1/images/regenerate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ spreadId: "spread-2", side: "right" }),
      }),
      { params: Promise.resolve({ id: "book-1" }) }
    );

    expect(res.status).toBe(200);
    expect(mockChargeImageRegenerationCredit).toHaveBeenCalledWith("user-1");
    expect(mockRegenerateBookSpreadPageImage).toHaveBeenCalledWith({
      projectId: "book-1",
      userId: "user-1",
      spreadId: "spread-2",
      side: "right",
    });
    expect(mockRefundImageRegenerationCredit).not.toHaveBeenCalled();
  });

  it("does not charge when retrying a failed spread image", async () => {
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
          rightPageImageError: "Generated image failed quality check",
        },
      ],
    });

    const { POST } =
      await import("@/app/api/books/[id]/images/regenerate/route");
    const res = await POST(
      new NextRequest("http://localhost/api/books/book-1/images/regenerate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ spreadId: "spread-2", side: "right" }),
      }),
      { params: Promise.resolve({ id: "book-1" }) }
    );

    expect(res.status).toBe(200);
    expect(mockChargeImageRegenerationCredit).not.toHaveBeenCalled();
    expect(mockRegenerateBookSpreadPageImage).toHaveBeenCalledWith({
      projectId: "book-1",
      userId: "user-1",
      spreadId: "spread-2",
      side: "right",
    });
  });

  it("does not charge when no image side is selected", async () => {
    const { POST } =
      await import("@/app/api/books/[id]/images/regenerate/route");
    const res = await POST(
      new NextRequest("http://localhost/api/books/book-1/images/regenerate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ spreadId: "spread-2", side: "middle" }),
      }),
      { params: Promise.resolve({ id: "book-1" }) }
    );

    expect(res.status).toBe(400);
    expect(mockChargeImageRegenerationCredit).not.toHaveBeenCalled();
    expect(mockRegenerateBookSpreadPageImage).not.toHaveBeenCalled();
  });

  it("returns 402 when the user has no credits", async () => {
    mockChargeImageRegenerationCredit.mockRejectedValue(
      new Error("Insufficient credits. Regenerating an image costs 1 credit.")
    );

    const { POST } =
      await import("@/app/api/books/[id]/images/regenerate/route");
    const res = await POST(
      new NextRequest("http://localhost/api/books/book-1/images/regenerate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ spreadId: "spread-2", side: "left" }),
      }),
      { params: Promise.resolve({ id: "book-1" }) }
    );

    expect(res.status).toBe(402);
    expect(mockRegenerateBookSpreadPageImage).not.toHaveBeenCalled();
  });
});
