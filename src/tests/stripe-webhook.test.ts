import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import type Stripe from "stripe";
import type { BookProject, PrintFulfillment } from "@/types/printBook";

const { mockConstructEvent, mockRetrieveSession, mockSubmitPrintFulfillment } =
  vi.hoisted(() => ({
    mockConstructEvent: vi.fn(),
    mockRetrieveSession: vi.fn(),
    mockSubmitPrintFulfillment: vi.fn(),
  }));

const mockDb = {
  bookProjects: {
    getById: vi.fn(),
    update: vi.fn(),
  },
};

vi.mock("stripe", () => ({
  default: vi.fn().mockImplementation(() => ({
    webhooks: {
      constructEvent: mockConstructEvent,
    },
    checkout: {
      sessions: {
        retrieve: mockRetrieveSession,
      },
    },
    refunds: {
      create: vi.fn(),
    },
  })),
}));

vi.mock("@clerk/nextjs/server", () => ({
  clerkClient: vi.fn(),
}));

vi.mock("@/lib/db", () => ({
  db: mockDb,
}));

vi.mock("@/lib/print-books/fulfillment", () => ({
  submitPrintFulfillment: mockSubmitPrintFulfillment,
}));

function createProject(): BookProject {
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
      orderabilityState: "export_ready",
    },
    retryCount: 0,
    createdAt: "2026-07-20T00:00:00.000Z",
    updatedAt: "2026-07-20T00:00:00.000Z",
  };
}

function createCheckoutSession(
  overrides: Partial<Stripe.Checkout.Session> = {}
): Stripe.Checkout.Session {
  return {
    id: "cs_test_123",
    object: "checkout.session",
    metadata: {
      checkoutType: "print_book",
      userId: "user-1",
      projectId: "book-1",
      productKey: "softcover",
    },
    payment_intent: "pi_test_123",
    customer_details: {
      email: "buyer@example.com",
      name: "Buyer Parent",
      phone: null,
      tax_exempt: "none",
      tax_ids: [],
      address: {
        city: "Sydney",
        country: "AU",
        line1: "1 Billing St",
        line2: null,
        postal_code: "2000",
        state: "NSW",
      },
    },
    ...overrides,
  } as Stripe.Checkout.Session;
}

describe("Stripe checkout webhook", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    process.env.STRIPE_SECRET_KEY = "sk_test_123";
    process.env.STRIPE_WEBHOOK_SECRET = "whsec_test_123";
    mockDb.bookProjects.getById.mockResolvedValue(createProject());
    mockDb.bookProjects.update.mockResolvedValue(undefined);
    mockSubmitPrintFulfillment.mockResolvedValue({
      provider: "lulu",
      status: "submitted",
      externalOrderId: "ord_123",
      externalStatus: "received",
    } satisfies PrintFulfillment);
  });

  it("retrieves the completed Checkout Session when webhook shipping is missing", async () => {
    mockConstructEvent.mockReturnValue({
      type: "checkout.session.completed",
      data: {
        object: createCheckoutSession({
          customer_details: {
            business_name: null,
            email: "buyer@example.com",
            individual_name: null,
            name: "Buyer Parent",
            phone: null,
            tax_exempt: "none",
            tax_ids: [],
            address: null,
          },
        }),
      },
    });
    mockRetrieveSession.mockResolvedValue(
      createCheckoutSession({
        collected_information: {
          business_name: null,
          individual_name: null,
          shipping_details: {
            name: "Shipping Parent",
            address: {
              city: "Melbourne",
              country: "AU",
              line1: "7 Shipping Lane",
              line2: null,
              postal_code: "3000",
              state: "VIC",
            },
          },
        },
      })
    );

    const { POST } = await import("@/app/api/stripe/webhook/route");
    const res = await POST(
      new NextRequest("http://localhost/api/stripe/webhook", {
        method: "POST",
        headers: { "stripe-signature": "sig_test" },
        body: "{}",
      })
    );

    expect(res.status).toBe(200);
    expect(mockRetrieveSession).toHaveBeenCalledWith("cs_test_123");
    expect(mockSubmitPrintFulfillment).toHaveBeenCalledWith({
      project: expect.objectContaining({ id: "book-1" }),
      order: expect.objectContaining({
        shipping: expect.objectContaining({
          name: "Shipping Parent",
          line1: "7 Shipping Lane",
          city: "Melbourne",
          postalCode: "3000",
          countryCode: "AU",
        }),
      }),
    });
  });

  it("reads shipping from collected_information when it is already in the event", async () => {
    mockConstructEvent.mockReturnValue({
      type: "checkout.session.completed",
      data: {
        object: createCheckoutSession({
          collected_information: {
            business_name: null,
            individual_name: null,
            shipping_details: {
              name: "Collected Parent",
              address: {
                city: "Brisbane",
                country: "AU",
                line1: "2 Collected Ave",
                line2: null,
                postal_code: "4000",
                state: "QLD",
              },
            },
          },
        }),
      },
    });

    const { POST } = await import("@/app/api/stripe/webhook/route");
    const res = await POST(
      new NextRequest("http://localhost/api/stripe/webhook", {
        method: "POST",
        headers: { "stripe-signature": "sig_test" },
        body: "{}",
      })
    );

    expect(res.status).toBe(200);
    expect(mockRetrieveSession).not.toHaveBeenCalled();
    expect(mockSubmitPrintFulfillment).toHaveBeenCalledWith({
      project: expect.objectContaining({ id: "book-1" }),
      order: expect.objectContaining({
        billingCountry: "AU",
        shipping: expect.objectContaining({
          name: "Collected Parent",
          line1: "2 Collected Ave",
          city: "Brisbane",
          postalCode: "4000",
          countryCode: "AU",
        }),
      }),
    });
  });
});
