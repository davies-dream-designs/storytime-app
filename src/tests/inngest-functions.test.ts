import { beforeEach, describe, expect, it, vi } from "vitest";
import type { BookBuildJob } from "@/types/printBook";

const {
  mockCreateFunction,
  mockGetJobById,
  mockProcessBookBuildJob,
  mockProcessLocationEstablishingJob,
} = vi.hoisted(() => ({
  mockCreateFunction: vi.fn(() => ({ id: "inngest-function" })),
  mockGetJobById: vi.fn(),
  mockProcessBookBuildJob: vi.fn(),
  mockProcessLocationEstablishingJob: vi.fn(),
}));

vi.mock("@/lib/inngest/client", () => ({
  inngest: { createFunction: mockCreateFunction },
  INNGEST_EVENTS: {
    bookBuildRequested: "storycot/book.build.requested",
    locationEstablishingRequested: "storycot/location.establishing.requested",
  },
}));

vi.mock("@/lib/db", () => ({
  db: {
    bookBuildJobs: {
      getById: mockGetJobById,
    },
  },
}));

vi.mock("@/lib/print-books/jobs", () => ({
  processBookBuildJob: mockProcessBookBuildJob,
}));

vi.mock("@/lib/print-books/locationEstablishingJobs", () => ({
  processLocationEstablishingJob: mockProcessLocationEstablishingJob,
}));

function createJob(status: BookBuildJob["status"] = "queued"): BookBuildJob {
  return {
    id: "job-1",
    projectId: "book-1",
    userId: "user-1",
    mode: "exports",
    status,
    step: 0,
    token: "job-token",
    baseUrl: "http://localhost",
    createdAt: "2026-07-29T00:00:00.000Z",
    updatedAt: "2026-07-29T00:00:00.000Z",
  };
}

describe("advanceBookBuildEventStep", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
  });

  it("treats missing jobs as stale Inngest events", async () => {
    mockGetJobById.mockResolvedValue(undefined);

    const { advanceBookBuildEventStep } =
      await import("@/lib/inngest/functions");

    await expect(advanceBookBuildEventStep("missing-job")).resolves.toEqual({
      shouldContinue: false,
      status: "missing-job",
    });
    expect(mockProcessBookBuildJob).not.toHaveBeenCalled();
  });

  it("treats jobs deleted during processing as stale Inngest events", async () => {
    mockGetJobById.mockResolvedValue(createJob());
    mockProcessBookBuildJob.mockRejectedValue(new Error("Job not found"));

    const { advanceBookBuildEventStep } =
      await import("@/lib/inngest/functions");

    await expect(advanceBookBuildEventStep("job-1")).resolves.toEqual({
      shouldContinue: false,
      status: "missing-job",
    });
  });

  it("still throws real processing failures", async () => {
    mockGetJobById.mockResolvedValue(createJob());
    mockProcessBookBuildJob.mockRejectedValue(new Error("PDF render failed"));

    const { advanceBookBuildEventStep } =
      await import("@/lib/inngest/functions");

    await expect(advanceBookBuildEventStep("job-1")).rejects.toThrow(
      "PDF render failed"
    );
  });
});
