import { beforeEach, describe, expect, it, vi } from "vitest";
import { createMemoryDb } from "@/tests/helpers/memoryDb";
import type { BookProject, PrintOrderRecord } from "@/types/printBook";

const memoryDb = createMemoryDb();
const mockSubmit = vi.fn();

// vi.mock factories run lazily (on first import), so module-level vars are fine.
vi.mock("@/lib/db", () => ({ db: memoryDb }));
vi.mock("@/lib/print-books/fulfillment", () => ({
  submitPrintFulfillment: mockSubmit,
}));

async function run(orderId: string) {
  const { runPublicPrintFulfillment } = await import(
    "@/lib/print-books/runFulfillment"
  );
  return runPublicPrintFulfillment(orderId);
}

function seedProject(): BookProject {
  return {
    id: "book-1",
    userId: "owner-1",
    sourceStoryId: "story-1",
    profileId: "profile-1",
    ageBand: "3-5",
    status: "ready",
    trimSize: "storycot-dynamic-square",
    pageCount: 24,
    spreadCount: 12,
    completedSpreads: 12,
    totalSpreads: 12,
    currentStageLabel: "Ready",
    beats: [],
    spreads: [],
    assets: { proofVersion: 1, orderabilityState: "export_ready" },
    retryCount: 0,
    createdAt: "2026-07-17T00:00:00.000Z",
    updatedAt: "2026-07-17T00:00:00.000Z",
  };
}

function seedOrder(overrides: Partial<PrintOrderRecord> = {}): PrintOrderRecord {
  return {
    id: "order-1",
    type: "public_purchase",
    projectId: "book-1",
    storyId: "story-1",
    ownerUserId: "owner-1",
    buyerEmail: "buyer@example.com",
    productKey: "hardcover",
    productLabel: "Hardcover",
    provider: "lulu",
    format: '8.5" square hardcover',
    status: "fulfillment_pending",
    amountAudCents: 2995,
    subtotalAudCents: 2495,
    shippingAudCents: 500,
    pageCount: 24,
    quantity: 1,
    checkoutSessionId: "cs_test_1",
    shipping: {
      name: "Mila Reader",
      email: "mila@example.com",
      line1: "1 Story Lane",
      city: "Sydney",
      state: "NSW",
      postalCode: "2000",
      countryCode: "AU",
    },
    paidAt: "2026-07-17T00:00:00.000Z",
    createdAt: "2026-07-17T00:00:00.000Z",
    updatedAt: "2026-07-17T00:00:00.000Z",
    ...overrides,
  };
}

describe("runPublicPrintFulfillment", () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    await memoryDb.bookProjects.create(seedProject());
  });

  it("submits a paid order and persists the submitted status", async () => {
    await memoryDb.printOrders.create(seedOrder());
    mockSubmit.mockResolvedValue({
      provider: "lulu",
      status: "submitted",
      externalOrderId: "lulu-999",
      submittedAt: "2026-07-17T01:00:00.000Z",
    });

    const result = await run("order-1");

    expect(result.status).toBe("submitted");
    expect(mockSubmit).toHaveBeenCalledTimes(1);
    const stored = await memoryDb.printOrders.getById("order-1");
    expect(stored?.status).toBe("fulfillment_submitted");
    expect(stored?.fulfillment?.externalOrderId).toBe("lulu-999");
  });

  it("is idempotent: never resubmits an order that already has a Lulu id", async () => {
    await memoryDb.printOrders.create(
      seedOrder({
        status: "fulfillment_submitted",
        fulfillment: {
          provider: "lulu",
          status: "submitted",
          externalOrderId: "lulu-existing",
        },
      })
    );

    const result = await run("order-1");

    expect(result.status).toBe("skipped");
    expect(result.reason).toBe("already submitted");
    expect(mockSubmit).not.toHaveBeenCalled();
  });

  it("skips when the order does not exist", async () => {
    const result = await run("missing");
    expect(result.status).toBe("skipped");
    expect(mockSubmit).not.toHaveBeenCalled();
  });

  it("surfaces a failed Lulu submission so the caller can retry", async () => {
    await memoryDb.printOrders.create(seedOrder());
    mockSubmit.mockResolvedValue({
      provider: "lulu",
      status: "failed",
      message: "Lulu 503",
    });

    const result = await run("order-1");

    expect(result.status).toBe("failed");
    const stored = await memoryDb.printOrders.getById("order-1");
    expect(stored?.status).toBe("failed");
  });
});
