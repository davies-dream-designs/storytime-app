import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import type { BookProject } from "@/types/printBook";

const {
  mockAuth,
  mockAssertImageRegenerationAffordable,
  mockCaptureIllustratedBookCredits,
  mockChargeImageRegenerationCredit,
  mockDb,
  mockRefundIllustratedBookCredits,
  mockReserveIllustratedBookCredits,
  mockRegenerateBookSpreadPageImage,
  mockLogEvent,
} = vi.hoisted(() => ({
  mockAuth: vi.fn(async () => ({ userId: "user-1" })),
  mockAssertImageRegenerationAffordable: vi.fn(),
  mockCaptureIllustratedBookCredits: vi.fn(),
  mockChargeImageRegenerationCredit: vi.fn(),
  mockDb: {
    bookProjects: {
      getById: vi.fn(),
    },
  },
  mockRefundIllustratedBookCredits: vi.fn(),
  mockReserveIllustratedBookCredits: vi.fn(),
  mockRegenerateBookSpreadPageImage: vi.fn(),
  mockLogEvent: vi.fn(),
}));

vi.mock("@clerk/nextjs/server", () => ({
  auth: mockAuth,
}));

vi.mock("@/lib/credits", () => ({
  assertImageRegenerationAffordable: mockAssertImageRegenerationAffordable,
  captureIllustratedBookCredits: mockCaptureIllustratedBookCredits,
  chargeImageRegenerationCredit: mockChargeImageRegenerationCredit,
  refundIllustratedBookCredits: mockRefundIllustratedBookCredits,
  reserveIllustratedBookCredits: mockReserveIllustratedBookCredits,
}));

vi.mock("@/lib/logEvent", () => ({
  logEvent: mockLogEvent,
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
    mockAssertImageRegenerationAffordable.mockResolvedValue(undefined);
    mockLogEvent.mockResolvedValue(undefined);
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
    // Charge happens only after the image is delivered, never before.
    expect(
      mockAssertImageRegenerationAffordable
    ).toHaveBeenCalledWith("user-1");
  });

  it("does not charge a paid redo when generation fails (crash-safe ordering)", async () => {
    mockRegenerateBookSpreadPageImage.mockRejectedValue(
      new Error("image provider timed out")
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
    expect(mockAssertImageRegenerationAffordable).toHaveBeenCalledWith(
      "user-1"
    );
    // The credit is never taken because the image was never delivered, so
    // there is nothing to refund even if the process had been killed.
    expect(mockChargeImageRegenerationCredit).not.toHaveBeenCalled();
  });

  it("passes a user correction note to the image redo job", async () => {
    const { POST } =
      await import("@/app/api/books/[id]/images/regenerate/route");
    const res = await POST(
      new NextRequest("http://localhost/api/books/book-1/images/regenerate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          spreadId: "spread-2",
          side: "right",
          correctionNote: "Make the cape blue and remove the extra toy.",
        }),
      }),
      { params: Promise.resolve({ id: "book-1" }) }
    );

    expect(res.status).toBe(200);
    expect(mockRegenerateBookSpreadPageImage).toHaveBeenCalledWith({
      projectId: "book-1",
      userId: "user-1",
      spreadId: "spread-2",
      side: "right",
      correctionNote: "Make the cape blue and remove the extra toy.",
    });
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

  it("does not charge image-redo credits when replacing placeholder art", async () => {
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
          rightPageImageUrl: "data:image/svg+xml;base64,placeholder",
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
    mockAssertImageRegenerationAffordable.mockRejectedValue(
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
