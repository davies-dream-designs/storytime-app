import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import type { BookProject } from "@/types/printBook";

// Trade titles are owned by the synthetic trade-system user, so the normal
// owner-scoped consumer reroll route can never reach them. These tests cover
// the admin-only equivalent: the API route that queues a worker job, and the
// wrapper that runs the actual regeneration once claimed.

vi.mock("@/lib/db", async () => {
  const { createMemoryDb } = await vi.importActual<
    typeof import("@/tests/helpers/memoryDb")
  >("@/tests/helpers/memoryDb");
  return { db: createMemoryDb() };
});
import { db as mockedDb } from "@/lib/db";
const memoryDb = mockedDb as typeof mockedDb & { _reset(): void };

const mockAdminIdentity = vi.fn();
vi.mock("@/lib/adminAuth", () => ({ getAdminIdentity: mockAdminIdentity }));

const mockRegenerateBookSpreadPageImage = vi.fn();
vi.mock("@/lib/print-books/jobs", () => ({
  regenerateBookSpreadPageImage: mockRegenerateBookSpreadPageImage,
}));

function makeProject(overrides: Partial<BookProject> = {}): BookProject {
  return {
    id: "project-1",
    userId: "trade-system",
    sourceStoryId: "story-1",
    profileId: "profile-1",
    ageBand: "preschool-story",
    status: "ready",
    trimSize: "storycot-dynamic-square",
    pageCount: 24,
    spreadCount: 1,
    completedSpreads: 1,
    totalSpreads: 1,
    currentStageLabel: "Ready",
    beats: [],
    spreads: [
      {
        id: "spread-1",
        bookProjectId: "project-1",
        sequence: 3,
        pageStart: 3,
        pageEnd: 3,
        layoutType: "hero",
        leftPageText: "",
        rightPageText: "",
        sceneBrief: "",
        illustrationPrompt: "",
        leftPageImageUrl: "https://blob.test/spread-3.png",
      },
    ],
    assets: { proofVersion: 0, imageProvider: "trade_cliproxy" },
    retryCount: 0,
    createdAt: "2026-09-17T00:00:00.000Z",
    updatedAt: "2026-09-17T00:00:00.000Z",
    ...overrides,
  };
}

beforeEach(() => {
  vi.resetModules();
  memoryDb._reset();
  mockAdminIdentity.mockReset();
  mockAdminIdentity.mockResolvedValue({
    userId: "admin-1",
    label: "admin@storycot.test",
  });
  mockRegenerateBookSpreadPageImage.mockReset();
  mockRegenerateBookSpreadPageImage.mockResolvedValue(undefined);
});

describe("admin trade spread reroll route", () => {
  it("requires an admin identity", async () => {
    mockAdminIdentity.mockResolvedValue(null);
    const { POST } = await import(
      "@/app/api/admin/books/[id]/spreads/[spreadId]/regenerate/route"
    );

    const response = await POST(
      new NextRequest(
        "http://localhost/api/admin/books/project-1/spreads/spread-1/regenerate",
        { method: "POST", body: "{}" }
      ),
      { params: Promise.resolve({ id: "project-1", spreadId: "spread-1" }) }
    );

    expect(response.status).toBe(403);
  });

  it("rejects a project that is not a trade catalogue book", async () => {
    await memoryDb.bookProjects.create(
      makeProject({ userId: "user-1", assets: { proofVersion: 0 } })
    );
    const { POST } = await import(
      "@/app/api/admin/books/[id]/spreads/[spreadId]/regenerate/route"
    );

    const response = await POST(
      new NextRequest(
        "http://localhost/api/admin/books/project-1/spreads/spread-1/regenerate",
        { method: "POST", body: "{}" }
      ),
      { params: Promise.resolve({ id: "project-1", spreadId: "spread-1" }) }
    );

    expect(response.status).toBe(400);
  });

  it("rejects an unknown spread id", async () => {
    await memoryDb.bookProjects.create(makeProject());
    const { POST } = await import(
      "@/app/api/admin/books/[id]/spreads/[spreadId]/regenerate/route"
    );

    const response = await POST(
      new NextRequest(
        "http://localhost/api/admin/books/project-1/spreads/does-not-exist/regenerate",
        { method: "POST", body: "{}" }
      ),
      {
        params: Promise.resolve({
          id: "project-1",
          spreadId: "does-not-exist",
        }),
      }
    );

    expect(response.status).toBe(404);
  });

  it("rejects when a build is already running", async () => {
    await memoryDb.bookProjects.create(
      makeProject({
        assets: {
          proofVersion: 0,
          imageProvider: "trade_cliproxy",
          activeJobStatus: "running",
        },
      })
    );
    const { POST } = await import(
      "@/app/api/admin/books/[id]/spreads/[spreadId]/regenerate/route"
    );

    const response = await POST(
      new NextRequest(
        "http://localhost/api/admin/books/project-1/spreads/spread-1/regenerate",
        { method: "POST", body: "{}" }
      ),
      { params: Promise.resolve({ id: "project-1", spreadId: "spread-1" }) }
    );

    expect(response.status).toBe(409);
  });

  it("queues a regenerate_trade_spread job with the correction note", async () => {
    await memoryDb.bookProjects.create(makeProject());
    const { POST } = await import(
      "@/app/api/admin/books/[id]/spreads/[spreadId]/regenerate/route"
    );

    const response = await POST(
      new NextRequest(
        "http://localhost/api/admin/books/project-1/spreads/spread-1/regenerate",
        {
          method: "POST",
          body: JSON.stringify({
            side: "left",
            correctionNote: "Face was hidden; make it visible.",
          }),
        }
      ),
      { params: Promise.resolve({ id: "project-1", spreadId: "spread-1" }) }
    );

    expect(response.status).toBe(202);
    const jobs = await memoryDb.tradeBookJobs.claimNext({
      leaseToken: "test-lease",
      now: new Date().toISOString(),
      leaseExpiresAt: new Date(Date.now() + 60_000).toISOString(),
    });
    expect(jobs?.kind).toBe("regenerate_trade_spread");
    expect(jobs?.payload).toEqual({
      bookProjectId: "project-1",
      spreadId: "spread-1",
      side: "left",
      correctionNote: "Face was hidden; make it visible.",
    });
  });
});

describe("regenerateTradeBookSpreadImage", () => {
  it("regenerates using the trade-system owner for a trade project", async () => {
    await memoryDb.bookProjects.create(makeProject());
    const { regenerateTradeBookSpreadImage } = await import(
      "@/lib/trade-books/regenerateSpread"
    );

    await regenerateTradeBookSpreadImage({
      bookProjectId: "project-1",
      spreadId: "spread-1",
      side: "left",
      correctionNote: "Fix the extra arm.",
    });

    expect(mockRegenerateBookSpreadPageImage).toHaveBeenCalledWith({
      projectId: "project-1",
      userId: "trade-system",
      spreadId: "spread-1",
      side: "left",
      correctionNote: "Fix the extra arm.",
    });
  });

  it("refuses to regenerate a non-trade project", async () => {
    await memoryDb.bookProjects.create(
      makeProject({ userId: "user-1", assets: { proofVersion: 0 } })
    );
    const { regenerateTradeBookSpreadImage } = await import(
      "@/lib/trade-books/regenerateSpread"
    );

    await expect(
      regenerateTradeBookSpreadImage({
        bookProjectId: "project-1",
        spreadId: "spread-1",
        side: "left",
      })
    ).rejects.toThrow("not a trade catalogue book");
    expect(mockRegenerateBookSpreadPageImage).not.toHaveBeenCalled();
  });
});
