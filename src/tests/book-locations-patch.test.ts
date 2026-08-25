import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import type { BookProject } from "@/types/printBook";

const { mockAuth } = vi.hoisted(() => ({
  mockAuth: vi.fn(async () => ({ userId: "user-1" })),
}));

const mockDb = {
  bookProjects: {
    getById: vi.fn(),
    update: vi.fn(),
  },
};

vi.mock("@clerk/nextjs/server", () => ({
  auth: mockAuth,
}));

vi.mock("@/lib/db", () => ({
  db: mockDb,
}));

function createProject(): BookProject {
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
    createdAt: "2026-07-16T00:00:00.000Z",
    updatedAt: "2026-07-16T00:00:00.000Z",
    locationBible: {
      locations: [
        {
          id: "grandmas_lounge",
          name: "Grandma's House (Lounge)",
          place: "Grandma's House",
          area: "Lounge",
          summary: "A cosy lounge.",
          fixedElements: [],
          lighting: "",
          palette: "",
          doNotChange: [],
        },
      ],
      pageLocations: { 1: "grandmas_lounge" },
    },
  };
}

describe("PATCH /api/books/[id]/locations", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    mockAuth.mockResolvedValue({ userId: "user-1" });
    mockDb.bookProjects.getById.mockResolvedValue(createProject());
    mockDb.bookProjects.update.mockImplementation(async (_id, patch) => ({
      ...createProject(),
      ...patch,
    }));
  });

  it("persists saved-location establishing images from the review modal", async () => {
    const { PATCH } = await import("@/app/api/books/[id]/locations/route");
    const res = await PATCH(
      new NextRequest("http://localhost/api/books/book-1/locations", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          notes: { grandmas_lounge: "Green sofa under the window." },
          establishingImageUrls: {
            grandmas_lounge: "https://cdn.example/grandma-lounge.png",
          },
        }),
      }),
      { params: Promise.resolve({ id: "book-1" }) }
    );

    expect(res.status).toBe(200);
    expect(mockDb.bookProjects.update).toHaveBeenCalledWith("book-1", {
      locationBible: expect.objectContaining({
        locations: [
          expect.objectContaining({
            id: "grandmas_lounge",
            notes: "Green sofa under the window.",
            establishingImageUrl: "https://cdn.example/grandma-lounge.png",
          }),
        ],
      }),
    });
  });
});
