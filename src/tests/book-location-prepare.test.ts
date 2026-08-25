import { describe, expect, it, beforeEach, vi } from "vitest";
import { NextRequest } from "next/server";
import type { Story } from "@/types";
import type {
  BookProject,
  LocationBible,
  LocationFixture,
} from "@/types/printBook";

const { mockAuth, mockGenerateLocationBible } = vi.hoisted(() => ({
  mockAuth: vi.fn(async () => ({ userId: "user-1" })),
  mockGenerateLocationBible: vi.fn(),
}));

const mockDb = {
  bookProjects: {
    getById: vi.fn(),
    update: vi.fn(),
  },
  stories: {
    getById: vi.fn(),
  },
  locationFixtures: {
    getById: vi.fn(),
  },
};

vi.mock("@clerk/nextjs/server", () => ({
  auth: mockAuth,
}));

vi.mock("@/lib/db", () => ({
  db: mockDb,
}));

vi.mock("@/lib/print-books/locationBible", () => ({
  generateLocationBible: mockGenerateLocationBible,
}));

function createProject(overrides: Partial<BookProject> = {}): BookProject {
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
    ...overrides,
  };
}

function createStory(overrides: Partial<Story> = {}): Story {
  return {
    id: "story-1",
    userId: "user-1",
    title: "Grandma's Lounge Adventure",
    profileId: "profile-1",
    profileName: "Bailey",
    wordCount: 120,
    theme: "kindness",
    notes: "",
    createdAt: "2026-07-15T00:00:00.000Z",
    pages: [],
    ...overrides,
  };
}

function createFixture(): LocationFixture {
  return {
    id: "fixture-1",
    userId: "user-1",
    place: "Grandma's House",
    area: "Lounge",
    summary: "A cosy lounge with a green sofa.",
    notes: "Green sofa under the window.",
    establishingImageUrl: "https://cdn.example/grandma-lounge.png",
    fixedElements: ["green sofa under the window"],
    doNotChange: ["sofa placement"],
    lighting: "warm lamp from the left",
    palette: "greens and golds",
    createdAt: "2026-07-15T00:00:00.000Z",
    updatedAt: "2026-07-15T00:00:00.000Z",
  };
}

function createBible(): LocationBible {
  return {
    locations: [
      {
        id: "grandmas_lounge",
        name: "Grandma's House (Lounge)",
        place: "Grandma's House",
        area: "Lounge",
        summary: "A cosy lounge with a green sofa.",
        fixedElements: ["green sofa under the window"],
        lighting: "warm lamp from the left",
        palette: "greens and golds",
        doNotChange: ["sofa placement"],
        establishingImageUrl: "https://cdn.example/grandma-lounge.png",
      },
    ],
    pageLocations: { 1: "grandmas_lounge" },
  };
}

describe("POST /api/books/[id]/locations/prepare", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    mockAuth.mockResolvedValue({ userId: "user-1" });
    mockDb.bookProjects.getById.mockResolvedValue(createProject());
    mockDb.stories.getById.mockResolvedValue(createStory());
    mockDb.locationFixtures.getById.mockResolvedValue(undefined);
    mockGenerateLocationBible.mockResolvedValue(createBible());
    mockDb.bookProjects.update.mockImplementation(async (_id, patch) => ({
      ...createProject(),
      ...patch,
    }));
  });

  it("applies a builder-selected saved location and does not require the review popup", async () => {
    const fixture = createFixture();
    const story = createStory({ locationFixtureId: fixture.id });
    mockDb.stories.getById.mockResolvedValue(story);
    mockDb.locationFixtures.getById.mockResolvedValue(fixture);

    const { POST } =
      await import("@/app/api/books/[id]/locations/prepare/route");
    const res = await POST(
      new NextRequest("http://localhost/api/books/book-1/locations/prepare", {
        method: "POST",
      }),
      { params: Promise.resolve({ id: "book-1" }) }
    );

    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ reviewRequired: false });
    expect(mockGenerateLocationBible).toHaveBeenCalledWith({
      story,
      preferredFixture: fixture,
    });
  });

  it("still requires review when there was no saved builder location", async () => {
    const { POST } =
      await import("@/app/api/books/[id]/locations/prepare/route");
    const res = await POST(
      new NextRequest("http://localhost/api/books/book-1/locations/prepare", {
        method: "POST",
      }),
      { params: Promise.resolve({ id: "book-1" }) }
    );

    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ reviewRequired: true });
    expect(mockGenerateLocationBible).toHaveBeenCalledWith({
      story: expect.objectContaining({ id: "story-1" }),
      preferredFixture: undefined,
    });
  });
});
