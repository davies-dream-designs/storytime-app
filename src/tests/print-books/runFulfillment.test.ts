import { beforeEach, describe, expect, it, vi } from "vitest";
import { createMemoryDb } from "@/tests/helpers/memoryDb";
import type {
  BookProject,
  PrintBookOrder,
  PrintOrderRecord,
} from "@/types/printBook";

const memoryDb = createMemoryDb();
const mockSubmit = vi.fn();
const mockRetrieveSession = vi.fn();

// vi.mock factories run lazily (on first import), so module-level vars are fine.
vi.mock("@/lib/db", () => ({ db: memoryDb }));
vi.mock("@/lib/print-books/fulfillment", () => ({
  submitPrintFulfillment: mockSubmit,
}));
// Mock only the Stripe network client; the real checkoutShipping parser runs
// against whatever raw session we return, so shipping extraction is covered.
vi.mock("stripe", () => ({
  default: vi.fn().mockImplementation(() => ({
    checkout: { sessions: { retrieve: mockRetrieveSession } },
  })),
}));

async function run(orderId: string) {
  const { runPublicPrintFulfillment } = await import(
    "@/lib/print-books/runFulfillment"
  );
  return runPublicPrintFulfillment(orderId);
}

async function runOwner(projectId: string) {
  const { runOwnerPrintFulfillment } = await import(
    "@/lib/print-books/runFulfillment"
  );
  return runOwnerPrintFulfillment(projectId);
}

function seedBookOrder(
  overrides: Partial<PrintBookOrder> = {}
): PrintBookOrder {
  return {
    productKey: "hardcover",
    productLabel: "Hardcover",
    provider: "Lulu",
    format: '8.5" square hardcover',
    status: "paid",
    amountAud: 29.95,
    subtotalAud: 24.95,
    shippingAmountAud: 5,
    pageCount: 24,
    quantity: 1,
    checkoutSessionId: "cs_owner_1",
    paidAt: "2026-07-17T00:00:00.000Z",
    ...overrides,
  };
}

function rawSessionWithShipping() {
  return {
    id: "cs_owner_1",
    collected_information: {
      shipping_details: {
        name: "Owner Parent",
        address: {
          city: "Perth",
          country: "AU",
          line1: "9 Owner Way",
          line2: null,
          postal_code: "6000",
          state: "WA",
        },
      },
    },
    customer_details: { email: "owner@example.com", name: "Owner Parent" },
  };
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
    process.env.STRIPE_SECRET_KEY = "sk_test_123";
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

describe("runOwnerPrintFulfillment", () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    process.env.STRIPE_SECRET_KEY = "sk_test_123";
    await memoryDb.bookProjects.create({
      ...seedProject(),
      printOrder: seedBookOrder(),
    });
    mockRetrieveSession.mockResolvedValue(rawSessionWithShipping());
  });

  it("re-fetches shipping from Stripe, submits, and never persists the address", async () => {
    mockSubmit.mockResolvedValue({
      provider: "lulu",
      status: "submitted",
      externalOrderId: "lulu-owner-1",
    });

    const result = await runOwner("book-1");

    expect(result.status).toBe("submitted");
    expect(mockRetrieveSession).toHaveBeenCalledWith("cs_owner_1");
    // The real checkoutShipping parser turned the raw session into a Lulu order.
    expect(mockSubmit).toHaveBeenCalledWith({
      project: expect.objectContaining({ id: "book-1" }),
      order: expect.objectContaining({
        shipping: expect.objectContaining({
          name: "Owner Parent",
          line1: "9 Owner Way",
          city: "Perth",
          postalCode: "6000",
          countryCode: "AU",
        }),
      }),
    });
    const stored = await memoryDb.bookProjects.getById("book-1");
    expect(stored?.printOrder?.fulfillment?.externalOrderId).toBe(
      "lulu-owner-1"
    );
    // Shipping must never be written back to our database.
    expect(stored?.printOrder).not.toHaveProperty("shipping");
  });

  it("is idempotent: never resubmits a printOrder that already has a Lulu id", async () => {
    await memoryDb.bookProjects.create({
      ...seedProject(),
      printOrder: seedBookOrder({
        fulfillment: {
          provider: "lulu",
          status: "submitted",
          externalOrderId: "lulu-existing",
        },
      }),
    });

    const result = await runOwner("book-1");

    expect(result.status).toBe("skipped");
    expect(result.reason).toBe("already submitted");
    expect(mockSubmit).not.toHaveBeenCalled();
    expect(mockRetrieveSession).not.toHaveBeenCalled();
  });

  it("fails without submitting when Stripe has no usable shipping address", async () => {
    mockRetrieveSession.mockResolvedValue({ id: "cs_owner_1" });

    const result = await runOwner("book-1");

    expect(result.status).toBe("failed");
    expect(mockSubmit).not.toHaveBeenCalled();
  });

  it("skips when the project has no paid print order", async () => {
    await memoryDb.bookProjects.create({
      ...seedProject(),
      printOrder: seedBookOrder({ status: "checkout_started" }),
    });

    const result = await runOwner("book-1");

    expect(result.status).toBe("skipped");
    expect(mockSubmit).not.toHaveBeenCalled();
  });
});
