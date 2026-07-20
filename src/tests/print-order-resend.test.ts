import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import type { BookProject, PrintFulfillment } from "@/types/printBook";

const {
  mockAuth,
  mockGetUser,
  mockRetrieveCheckoutShipping,
  mockSubmitPrintFulfillment,
} = vi.hoisted(() => ({
  mockAuth: vi.fn(async () => ({ userId: "admin-1" })),
  mockGetUser: vi.fn(async () => ({
    privateMetadata: { isAdmin: true },
  })),
  mockRetrieveCheckoutShipping: vi.fn(),
  mockSubmitPrintFulfillment: vi.fn(),
}));

const mockDb = {
  bookProjects: {
    getById: vi.fn(),
    update: vi.fn(),
  },
};

vi.mock("@clerk/nextjs/server", () => ({
  auth: mockAuth,
  clerkClient: vi.fn(async () => ({
    users: {
      getUser: mockGetUser,
    },
  })),
}));

vi.mock("@/lib/db", () => ({
  db: mockDb,
}));

vi.mock("@/lib/print-books/fulfillment", () => ({
  submitPrintFulfillment: mockSubmitPrintFulfillment,
}));

vi.mock("@/lib/stripe/checkoutShipping", () => ({
  retrieveCheckoutShipping: mockRetrieveCheckoutShipping,
}));

vi.mock("stripe", () => ({
  default: vi.fn().mockImplementation(() => ({})),
}));

function createPaidProject(): BookProject {
  return {
    id: "book-1",
    userId: "user-1",
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
    assets: {
      proofVersion: 1,
      printPdfUrl: "https://assets.example.com/book.pdf",
      coverPdfUrl: "https://assets.example.com/cover.pdf",
    },
    retryCount: 0,
    printOrder: {
      productKey: "softcover",
      productLabel: "Softcover",
      provider: "Prodigi",
      format: "21x21cm square softcover",
      status: "paid",
      amountAud: 29.95,
      pageCount: 24,
      checkoutSessionId: "cs_test_123",
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
        message: "Previous submission failed",
      },
    },
    createdAt: "2026-07-20T00:00:00.000Z",
    updatedAt: "2026-07-20T00:00:00.000Z",
  };
}

describe("POST /api/admin/print-orders/[id]/resend", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    mockAuth.mockResolvedValue({ userId: "admin-1" });
    mockGetUser.mockResolvedValue({ privateMetadata: { isAdmin: true } });
    process.env.STRIPE_SECRET_KEY = "sk_test_123";
    mockDb.bookProjects.getById.mockResolvedValue(createPaidProject());
    mockDb.bookProjects.update.mockImplementation(async (_id, updates) => ({
      ...createPaidProject(),
      ...updates,
    }));
    mockSubmitPrintFulfillment.mockResolvedValue({
      provider: "prodigi",
      status: "submitted",
      externalOrderId: "ord_123",
      externalStatus: "received",
    } satisfies PrintFulfillment);
    mockRetrieveCheckoutShipping.mockResolvedValue({
      billingCountry: "AU",
      shipping: {
        name: "Stripe Customer",
        email: "stripe@example.com",
        line1: "9 Stripe Rd",
        city: "Sydney",
        postalCode: "2000",
        countryCode: "AU",
      },
    });
  });

  it("hydrates missing shipping from the Stripe Checkout Session before resubmitting", async () => {
    mockDb.bookProjects.getById.mockResolvedValue({
      ...createPaidProject(),
      printOrder: {
        ...createPaidProject().printOrder!,
        shipping: undefined,
      },
    });

    const { POST } =
      await import("@/app/api/admin/print-orders/[id]/resend/route");
    const res = await POST(
      new NextRequest("http://localhost/api/admin/print-orders/book-1/resend", {
        method: "POST",
      }),
      { params: Promise.resolve({ id: "book-1" }) }
    );

    expect(res.status).toBe(200);
    expect(mockRetrieveCheckoutShipping).toHaveBeenCalledWith(
      expect.anything(),
      "cs_test_123"
    );
    expect(mockSubmitPrintFulfillment).toHaveBeenCalledWith({
      project: expect.objectContaining({ id: "book-1" }),
      order: expect.objectContaining({
        billingCountry: "AU",
        shipping: expect.objectContaining({
          name: "Stripe Customer",
          line1: "9 Stripe Rd",
        }),
      }),
    });
    expect(mockDb.bookProjects.update).toHaveBeenCalledWith(
      "book-1",
      expect.objectContaining({
        printOrder: expect.objectContaining({
          shipping: expect.objectContaining({
            name: "Stripe Customer",
          }),
          fulfillment: expect.objectContaining({
            status: "submitted",
          }),
        }),
      })
    );
  });

  it("resubmits a paid order that has not reached the printer", async () => {
    const { POST } =
      await import("@/app/api/admin/print-orders/[id]/resend/route");
    const res = await POST(
      new NextRequest("http://localhost/api/admin/print-orders/book-1/resend", {
        method: "POST",
      }),
      { params: Promise.resolve({ id: "book-1" }) }
    );

    expect(res.status).toBe(200);
    expect(mockSubmitPrintFulfillment).toHaveBeenCalledWith({
      project: expect.objectContaining({ id: "book-1" }),
      order: expect.objectContaining({
        productKey: "softcover",
        status: "paid",
      }),
    });
    expect(mockDb.bookProjects.update).toHaveBeenCalledWith(
      "book-1",
      expect.objectContaining({
        printOrder: expect.objectContaining({
          fulfillment: expect.objectContaining({
            status: "submitted",
            externalOrderId: "ord_123",
          }),
        }),
      })
    );
  });

  it("does not resubmit an order that already has a printer reference", async () => {
    mockDb.bookProjects.getById.mockResolvedValue({
      ...createPaidProject(),
      printOrder: {
        ...createPaidProject().printOrder!,
        fulfillment: {
          provider: "prodigi",
          status: "submitted",
          externalOrderId: "ord_existing",
        },
      },
    });

    const { POST } =
      await import("@/app/api/admin/print-orders/[id]/resend/route");
    const res = await POST(
      new NextRequest("http://localhost/api/admin/print-orders/book-1/resend", {
        method: "POST",
      }),
      { params: Promise.resolve({ id: "book-1" }) }
    );

    expect(res.status).toBe(409);
    expect(mockSubmitPrintFulfillment).not.toHaveBeenCalled();
  });

  it("requires an admin user", async () => {
    mockGetUser.mockResolvedValue({ privateMetadata: { isAdmin: false } });

    const { POST } =
      await import("@/app/api/admin/print-orders/[id]/resend/route");
    const res = await POST(
      new NextRequest("http://localhost/api/admin/print-orders/book-1/resend", {
        method: "POST",
      }),
      { params: Promise.resolve({ id: "book-1" }) }
    );

    expect(res.status).toBe(403);
    expect(mockSubmitPrintFulfillment).not.toHaveBeenCalled();
  });
});
