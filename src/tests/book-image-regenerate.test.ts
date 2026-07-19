import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import type { BookProject } from "@/types/printBook";

const {
  mockAuth,
  mockCaptureIllustratedBookCredits,
  mockChargeImageRegenerationCredit,
  mockDb,
  mockRefundImageRegenerationCredit,
  mockRefundIllustratedBookCredits,
  mockReserveIllustratedBookCredits,
  mockRegenerateBookSpreadPageImage,
} = vi.hoisted(() => ({
  mockAuth: vi.fn(async () => ({ userId: "user-1" })),
  mockCaptureIllustratedBookCredits: vi.fn(),
  mockChargeImageRegenerationCredit: vi.fn(),
  mockDb: {
    bookProjects: {
      getById: vi.fn(),
    },
  },
  mockRefundImageRegenerationCredit: vi.fn(),
  mockRefundIllustratedBookCredits: vi.fn(),
  mockReserveIllustratedBookCredits: vi.fn(),
  mockRegenerateBookSpreadPageImage: vi.fn(),
}));

vi.mock("@clerk/nextjs/server", () => ({
  auth: mockAuth,
}));

vi.mock("@/lib/credits", () => ({
  captureIllustratedBookCredits: mockCaptureIllustratedBookCredits,
  chargeImageRegenerationCredit: mockChargeImageRegenerationCredit,
  refundImageRegenerationCredit: mockRefundImageRegenerationCredit,
  refundIllustratedBookCredits: mockRefundIllustratedBookCredits,
  reserveIllustratedBookCredits: mockReserveIllustratedBookCredits,
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
    mockCaptureIllustratedBookCredits.mockImplementation(async (project) => ({
      ...project,
      billing: { ...project.billing, status: "captured" },
    }));
    mockReserveIllustratedBookCredits.mockImplementation(async (project) => ({
      ...project,
      billing: {
        product: "illustrated_book",
        status: "reserved",
        credits: 10,
        reservedAt: "2026-07-15T00:00:00.000Z",
      },
    }));
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
      billing: {
        product: "illustrated_book",
        status: "captured",
        credits: 10,
        reservedAt: "2026-07-15T00:00:00.000Z",
        capturedAt: "2026-07-15T00:01:00.000Z",
      },
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
    expect(mockReserveIllustratedBookCredits).not.toHaveBeenCalled();
    expect(mockRegenerateBookSpreadPageImage).toHaveBeenCalledWith({
      projectId: "book-1",
      userId: "user-1",
      spreadId: "spread-2",
      side: "right",
    });
  });

  it("re-reserves and captures book credits when retrying after a refunded full-book failure", async () => {
    const refundedProject = {
      ...createBookProject(),
      status: "failed" as const,
      errorCode: "illustrating:image_failed",
      billing: {
        product: "illustrated_book" as const,
        status: "refunded" as const,
        credits: 10,
        reservedAt: "2026-07-15T00:00:00.000Z",
        refundedAt: "2026-07-15T00:02:00.000Z",
      },
      spreads: [
        {
          id: "spread-2",
          bookProjectId: "book-1",
          sequence: 2,
          pageStart: 3,
          pageEnd: 4,
          layoutType: "hero" as const,
          leftPageText: "",
          rightPageText: "",
          sceneBrief: "Garden",
          illustrationPrompt: "Garden",
          rightPageImageError: "Generated image failed quality check",
        },
      ],
    };
    const readyProject = {
      ...refundedProject,
      status: "ready" as const,
      billing: {
        product: "illustrated_book" as const,
        status: "reserved" as const,
        credits: 10,
        reservedAt: "2026-07-15T00:03:00.000Z",
      },
    };
    mockDb.bookProjects.getById.mockResolvedValue(refundedProject);
    mockRegenerateBookSpreadPageImage.mockResolvedValue(readyProject);

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
    expect(mockReserveIllustratedBookCredits).toHaveBeenCalledWith(
      refundedProject
    );
    expect(mockCaptureIllustratedBookCredits).toHaveBeenCalledWith(
      readyProject
    );
  });

  it("refunds a newly reserved book charge if failed-image retry still fails", async () => {
    const refundedProject = {
      ...createBookProject(),
      status: "failed" as const,
      errorCode: "illustrating:image_failed",
      billing: {
        product: "illustrated_book" as const,
        status: "refunded" as const,
        credits: 10,
        reservedAt: "2026-07-15T00:00:00.000Z",
        refundedAt: "2026-07-15T00:02:00.000Z",
      },
      spreads: [
        {
          id: "spread-2",
          bookProjectId: "book-1",
          sequence: 2,
          pageStart: 3,
          pageEnd: 4,
          layoutType: "hero" as const,
          leftPageText: "",
          rightPageText: "",
          sceneBrief: "Garden",
          illustrationPrompt: "Garden",
          rightPageImageError: "Generated image failed quality check",
        },
      ],
    };
    const reservedProject = {
      ...refundedProject,
      billing: {
        product: "illustrated_book" as const,
        status: "reserved" as const,
        credits: 10,
        reservedAt: "2026-07-15T00:03:00.000Z",
      },
    };
    mockDb.bookProjects.getById.mockResolvedValue(refundedProject);
    mockReserveIllustratedBookCredits.mockResolvedValue(reservedProject);
    mockRegenerateBookSpreadPageImage.mockRejectedValue(
      new Error("Image provider failed")
    );

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

    expect(res.status).toBe(500);
    expect(mockRefundIllustratedBookCredits).toHaveBeenCalledWith(
      reservedProject
    );
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
