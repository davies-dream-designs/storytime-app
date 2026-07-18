import { beforeEach, describe, expect, it, vi } from "vitest";
import type { BookProject } from "@/types/printBook";

const { mockGetUser, mockUpdateUserMetadata, mockBookProjectUpdate } =
  vi.hoisted(() => ({
    mockGetUser: vi.fn(),
    mockUpdateUserMetadata: vi.fn(),
    mockBookProjectUpdate: vi.fn(),
  }));

vi.mock("@clerk/nextjs/server", () => ({
  clerkClient: vi.fn(async () => ({
    users: {
      getUser: mockGetUser,
      updateUserMetadata: mockUpdateUserMetadata,
    },
  })),
}));

vi.mock("@/lib/db", () => ({
  db: {
    bookProjects: {
      update: mockBookProjectUpdate,
    },
  },
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
    pageCount: 24,
    spreadCount: 12,
    completedSpreads: 0,
    totalSpreads: 12,
    currentStageLabel: "Queued",
    beats: [],
    spreads: [],
    assets: { proofVersion: 0 },
    retryCount: 0,
    createdAt: "2026-07-15T00:00:00.000Z",
    updatedAt: "2026-07-15T00:00:00.000Z",
    ...overrides,
  };
}

describe("illustrated book credits", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    mockGetUser.mockResolvedValue({
      privateMetadata: { credits: 10 },
    });
    mockBookProjectUpdate.mockImplementation(
      async (id: string, updates: Partial<BookProject>) => ({
        ...createProject({ id }),
        ...updates,
      })
    );
  });

  it("reserves illustrated book credits before generation", async () => {
    const { reserveIllustratedBookCredits } = await import("@/lib/credits");
    const project = await reserveIllustratedBookCredits(createProject());

    expect(mockUpdateUserMetadata).toHaveBeenCalledWith("user-1", {
      privateMetadata: { credits: 2 },
    });
    expect(project.billing).toMatchObject({
      product: "illustrated_book",
      status: "reserved",
      credits: 8,
    });
  });

  it("blocks reservations when credits are insufficient", async () => {
    mockGetUser.mockResolvedValue({
      privateMetadata: { credits: 7 },
    });

    const { reserveIllustratedBookCredits } = await import("@/lib/credits");
    await expect(
      reserveIllustratedBookCredits(createProject())
    ).rejects.toThrow("Insufficient credits");
    expect(mockUpdateUserMetadata).not.toHaveBeenCalled();
  });

  it("captures reserved credits on successful output", async () => {
    const { captureIllustratedBookCredits } = await import("@/lib/credits");
    const project = await captureIllustratedBookCredits(
      createProject({
        billing: {
          product: "illustrated_book",
          status: "reserved",
          credits: 8,
          reservedAt: "2026-07-16T00:00:00.000Z",
        },
      })
    );

    expect(project.billing?.status).toBe("captured");
    expect(mockUpdateUserMetadata).not.toHaveBeenCalled();
  });

  it("refunds reserved credits after failed generation", async () => {
    mockGetUser.mockResolvedValue({
      privateMetadata: { credits: 2 },
    });

    const { refundIllustratedBookCredits } = await import("@/lib/credits");
    const project = await refundIllustratedBookCredits(
      createProject({
        billing: {
          product: "illustrated_book",
          status: "reserved",
          credits: 8,
          reservedAt: "2026-07-16T00:00:00.000Z",
        },
      })
    );

    expect(mockUpdateUserMetadata).toHaveBeenCalledWith("user-1", {
      privateMetadata: { credits: 10 },
    });
    expect(project.billing?.status).toBe("refunded");
  });
});
