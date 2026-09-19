import { beforeEach, describe, expect, it, vi } from "vitest";
import type { BookBuildJob } from "@/types/printBook";

const {
  mockCreateFunction,
  mockGetJobById,
  mockProcessBookBuildJob,
  mockRefreshLuluPriceCache,
  mockLogEvent,
} = vi.hoisted(() => ({
  mockCreateFunction: vi.fn((_config: unknown, handler: unknown) => ({
    id: "inngest-function",
    handler,
  })),
  mockGetJobById: vi.fn(),
  mockProcessBookBuildJob: vi.fn(),
  mockRefreshLuluPriceCache: vi.fn(),
  mockLogEvent: vi.fn(),
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

vi.mock("@/lib/print-books/liveLuluPricing", () => ({
  refreshLuluPriceCache: mockRefreshLuluPriceCache,
}));

vi.mock("@/lib/logEvent", () => ({
  logEvent: mockLogEvent,
}));

// Fake `step.run` that just invokes the callback directly, matching how
// Inngest executes a step during a real run.
const fakeStep = { run: (_name: string, fn: () => unknown) => fn() };

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

describe("pollLuluPricing", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
  });

  it("refreshes every print product's cached price", async () => {
    mockRefreshLuluPriceCache.mockResolvedValue({
      sampleLowPageCount: 24,
      sampleLowCostAudCents: 2464,
      sampleHighPageCount: 40,
      sampleHighCostAudCents: 2726,
    });

    const { pollLuluPricing } = await import("@/lib/inngest/functions");
    const handler = (
      pollLuluPricing as unknown as { handler: (args: unknown) => unknown }
    ).handler;

    const result = await (
      handler as (args: { step: typeof fakeStep }) => Promise<
        Record<string, "ok" | "failed">
      >
    )({ step: fakeStep });

    expect(mockRefreshLuluPriceCache).toHaveBeenCalledWith("hardcover");
    expect(mockRefreshLuluPriceCache).toHaveBeenCalledWith("paperback");
    expect(mockRefreshLuluPriceCache).toHaveBeenCalledWith("coil");
    expect(result).toEqual({ hardcover: "ok", paperback: "ok", coil: "ok" });
    expect(mockLogEvent).not.toHaveBeenCalled();
  });

  it("isolates one product's failure from the others rather than aborting the whole run", async () => {
    mockRefreshLuluPriceCache.mockImplementation(
      async (productKey: string) => {
        if (productKey === "paperback") {
          throw new Error("Lulu quote failed");
        }
        return {
          sampleLowPageCount: 24,
          sampleLowCostAudCents: 2464,
          sampleHighPageCount: 40,
          sampleHighCostAudCents: 2726,
        };
      }
    );

    const { pollLuluPricing } = await import("@/lib/inngest/functions");
    const handler = (
      pollLuluPricing as unknown as { handler: (args: unknown) => unknown }
    ).handler;

    const result = await (
      handler as (args: { step: typeof fakeStep }) => Promise<
        Record<string, "ok" | "failed">
      >
    )({ step: fakeStep });

    expect(result.hardcover).toBe("ok");
    expect(result.paperback).toBe("failed");
    expect(result.coil).toBe("ok");
    expect(mockLogEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        code: "print.price_poll_failed",
        context: { productKey: "paperback" },
      })
    );
  });
});
