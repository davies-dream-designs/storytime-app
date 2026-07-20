import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import type { ChildProfile, Story } from "@/types";
import type { BookProject } from "@/types/printBook";

const {
  mockAuth,
  mockAfter,
  mockDispatchBookBuildJob,
  mockIsBookBuildJobStale,
} = vi.hoisted(() => ({
  mockAuth: vi.fn(async () => ({ userId: "user-1" })),
  mockAfter: vi.fn(async (callback: () => Promise<void> | void) => {
    await callback();
  }),
  mockDispatchBookBuildJob: vi.fn(),
  mockIsBookBuildJobStale: vi.fn(() => false),
}));

const mockDb = {
  stories: {
    getById: vi.fn(),
  },
  profiles: {
    getById: vi.fn(),
  },
  bookBuildJobs: {
    getById: vi.fn(),
    getCurrentByProjectId: vi.fn(),
  },
  bookProjects: {
    getById: vi.fn(),
    getByUserId: vi.fn(),
    getByStoryId: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
  },
};

vi.mock("@clerk/nextjs/server", () => ({
  auth: mockAuth,
}));

vi.mock("next/server", async () => {
  const actual =
    await vi.importActual<typeof import("next/server")>("next/server");
  return {
    ...actual,
    after: mockAfter,
  };
});

vi.mock("@/lib/db", () => ({
  db: mockDb,
}));

vi.mock("@/lib/print-books/jobs", () => ({
  dispatchBookBuildJob: mockDispatchBookBuildJob,
  isBookBuildJobStale: mockIsBookBuildJobStale,
}));

function createStory(): Story {
  return {
    id: "story-1",
    userId: "user-1",
    title: "Moonlight Garden",
    profileId: "profile-1",
    profileName: "Mila",
    wordCount: 120,
    theme: "kindness",
    notes: "",
    createdAt: "2026-07-15T00:00:00.000Z",
    pages: [],
  };
}

function createProfile(): ChildProfile {
  return {
    id: "profile-1",
    userId: "user-1",
    name: "Mila",
    age: 4,
    favouriteCharacters: [],
    favouriteActivities: [],
    favouriteAnimals: [],
    favouritePlaces: [],
    lessons: [],
    createdAt: "2026-07-15T00:00:00.000Z",
  };
}

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

describe("/api/books", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    mockAuth.mockResolvedValue({ userId: "user-1" });
    mockDb.stories.getById.mockResolvedValue(createStory());
    mockDb.profiles.getById.mockResolvedValue(createProfile());
    mockDb.bookBuildJobs.getById.mockResolvedValue(undefined);
    mockDb.bookBuildJobs.getCurrentByProjectId.mockResolvedValue(undefined);
    mockDispatchBookBuildJob.mockReset();
    mockIsBookBuildJobStale.mockReset();
    mockIsBookBuildJobStale.mockReturnValue(false);
    mockDb.bookProjects.getByUserId.mockResolvedValue([]);
    mockDb.bookProjects.getByStoryId.mockResolvedValue([]);
    mockDb.bookProjects.create.mockResolvedValue(undefined);
  });

  it("creates a queued book project from a source story", async () => {
    const { POST } = await import("@/app/api/books/route");
    const req = new NextRequest("http://localhost/api/books", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sourceStoryId: "story-1" }),
    });

    const res = await POST(req);
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.sourceStoryId).toBe("story-1");
    expect(body.status).toBe("queued");
    expect(mockDb.bookProjects.create).toHaveBeenCalledTimes(1);
  });

  it("returns the existing book project for the same story instead of creating another", async () => {
    const existingProject = createBookProject();
    mockDb.bookProjects.getByStoryId = vi
      .fn()
      .mockResolvedValue([existingProject]);

    const { POST } = await import("@/app/api/books/route");
    const req = new NextRequest("http://localhost/api/books", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sourceStoryId: "story-1" }),
    });

    const res = await POST(req);
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ id: "book-1" });
    expect(mockDb.bookProjects.create).not.toHaveBeenCalled();
  });

  it("lists book projects for the current user", async () => {
    const project = createBookProject();
    mockDb.bookProjects.getByUserId.mockResolvedValue([project]);

    const { GET } = await import("@/app/api/books/route");
    const res = await GET();
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual([project]);
  });
});

describe("/api/books/[id] and /status", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    mockAuth.mockResolvedValue({ userId: "user-1" });
    mockDb.bookBuildJobs.getById.mockResolvedValue(undefined);
    mockDb.bookBuildJobs.getCurrentByProjectId.mockResolvedValue(undefined);
    mockDispatchBookBuildJob.mockReset();
    mockIsBookBuildJobStale.mockReset();
    mockIsBookBuildJobStale.mockReturnValue(false);
    mockDb.bookProjects.getById.mockResolvedValue(createBookProject());
    mockDb.bookProjects.getByStoryId.mockResolvedValue([]);
    mockDb.bookProjects.update.mockResolvedValue(undefined);
    mockDb.bookProjects.delete.mockResolvedValue(true);
  });

  it("returns a full book project payload", async () => {
    const { GET } = await import("@/app/api/books/[id]/route");
    const res = await GET(
      new NextRequest("http://localhost/api/books/book-1"),
      {
        params: Promise.resolve({ id: "book-1" }),
      }
    );

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.id).toBe("book-1");
  });

  it("deletes a book project owned by the current user", async () => {
    const { DELETE } = await import("@/app/api/books/[id]/route");
    const res = await DELETE(
      new NextRequest("http://localhost/api/books/book-1"),
      {
        params: Promise.resolve({ id: "book-1" }),
      }
    );

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ success: true });
    expect(mockDb.bookProjects.delete).toHaveBeenCalledWith("book-1");
  });

  it("returns a lightweight status payload", async () => {
    const { GET } = await import("@/app/api/books/[id]/status/route");
    const res = await GET(
      new NextRequest("http://localhost/api/books/book-1/status"),
      {
        params: Promise.resolve({ id: "book-1" }),
      }
    );

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toMatchObject({
      id: "book-1",
      status: "queued",
      completedSpreads: 0,
      totalSpreads: 16,
    });
  });

  it("returns sanitized print order status without shipping details", async () => {
    mockDb.bookProjects.getById.mockResolvedValue({
      ...createBookProject(),
      printOrder: {
        productKey: "softcover",
        productLabel: "Softcover",
        provider: "Prodigi",
        format: "21x21cm square softcover",
        status: "paid",
        amountAud: 29.95,
        pageCount: 24,
        paidAt: "2026-07-20T01:24:00.000Z",
        shipping: {
          name: "Test Customer",
          email: "test@example.com",
          line1: "1 Test St",
          city: "Sydney",
          postalCode: "2000",
          countryCode: "AU",
        },
        fulfillment: {
          provider: "prodigi",
          status: "failed",
          message: "Prodigi order submission failed",
        },
      },
    });

    const { GET } = await import("@/app/api/books/[id]/status/route");
    const res = await GET(
      new NextRequest("http://localhost/api/books/book-1/status"),
      {
        params: Promise.resolve({ id: "book-1" }),
      }
    );

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.printOrder).toMatchObject({
      productKey: "softcover",
      status: "paid",
      fulfillment: {
        provider: "prodigi",
        status: "failed",
      },
    });
    expect(JSON.stringify(body.printOrder)).not.toContain("Test Customer");
    expect(JSON.stringify(body.printOrder)).not.toContain("test@example.com");
  });

  it("nudges queued jobs during status polling", async () => {
    mockDb.bookProjects.getById.mockResolvedValue({
      ...createBookProject(),
      assets: {
        proofVersion: 0,
        activeJobId: "job-1",
        activeJobStatus: "queued",
      },
    });
    mockDb.bookBuildJobs.getById.mockResolvedValue({
      id: "job-1",
      projectId: "book-1",
      userId: "user-1",
      mode: "full",
      status: "queued",
      step: 0,
      token: "token",
      baseUrl: "http://localhost",
      createdAt: "2026-07-16T00:00:00.000Z",
      updatedAt: "2026-07-16T00:00:00.000Z",
    });

    const { GET } = await import("@/app/api/books/[id]/status/route");
    const res = await GET(
      new NextRequest("http://localhost/api/books/book-1/status"),
      {
        params: Promise.resolve({ id: "book-1" }),
      }
    );

    expect(res.status).toBe(200);
    expect(mockDispatchBookBuildJob).toHaveBeenCalledWith(
      expect.objectContaining({ id: "job-1" })
    );
    expect(mockAfter).not.toHaveBeenCalled();
  });
});
