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

const { mockGetUser, mockUpdateUserMetadata } = vi.hoisted(() => ({
  mockGetUser: vi.fn(),
  mockUpdateUserMetadata: vi.fn(),
}));

const { mockSendGiftCreditsEmail, mockSendPrintOrderConfirmedEmail } =
  vi.hoisted(() => ({
    mockSendGiftCreditsEmail: vi.fn(),
    mockSendPrintOrderConfirmedEmail: vi.fn(),
  }));

const { mockInngestSend } = vi.hoisted(() => ({
  mockInngestSend: vi.fn(),
}));

const mockDb = {
  bookProjects: {
    getById: vi.fn(),
    update: vi.fn(),
  },
  giftOrders: {
    claimPaid: vi.fn(),
    getByToken: vi.fn(),
    update: vi.fn(),
  },
  printOrders: {
    getByCheckoutSessionId: vi.fn(),
    update: vi.fn(),
  },
  stories: {
    getById: vi.fn(),
  },
  processedWebhookEvents: {
    claim: vi.fn(),
    release: vi.fn(),
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
  clerkClient: vi.fn(async () => ({
    users: {
      getUser: mockGetUser,
      updateUserMetadata: mockUpdateUserMetadata,
    },
  })),
}));

vi.mock("@/lib/db", () => ({
  db: mockDb,
}));

vi.mock("@/lib/print-books/fulfillment", () => ({
  submitPrintFulfillment: mockSubmitPrintFulfillment,
}));

vi.mock("@/lib/inngest/client", () => ({
  inngest: { send: mockInngestSend },
  INNGEST_EVENTS: {
    printFulfillmentRequested: "storycot/print.fulfillment.requested",
  },
}));

vi.mock("@/lib/email", () => ({
  sendGiftCreditsEmail: mockSendGiftCreditsEmail,
  sendPrintOrderConfirmedEmail: mockSendPrintOrderConfirmedEmail,
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
      productKey: "hardcover",
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
    process.env.NEXT_PUBLIC_APP_URL = "https://storycot.com";
    mockDb.bookProjects.getById.mockResolvedValue(createProject());
    mockDb.bookProjects.update.mockResolvedValue(undefined);
    mockDb.giftOrders.claimPaid.mockResolvedValue(undefined);
    mockDb.giftOrders.getByToken.mockResolvedValue(undefined);
    mockDb.giftOrders.update.mockImplementation(async (_id, updates) => ({
      id: "gift-1",
      token: "gift-token",
      purchaserUserId: "user-1",
      recipientEmail: "recipient@example.com",
      packId: "starter",
      credits: 10,
      amountAud: 499,
      status: "paid",
      referralReferrerUserId: "user-referrer",
      createdAt: "2026-07-20T00:00:00.000Z",
      updatedAt: "2026-07-20T00:00:00.000Z",
      ...updates,
    }));
    mockDb.printOrders.getByCheckoutSessionId.mockResolvedValue(undefined);
    mockDb.printOrders.update.mockResolvedValue(undefined);
    mockDb.processedWebhookEvents.claim.mockResolvedValue(true);
    mockDb.processedWebhookEvents.release.mockResolvedValue(undefined);
    mockDb.stories.getById.mockResolvedValue({ title: "Moonlight Garden" });
    mockGetUser.mockResolvedValue({
      firstName: "Buyer",
      primaryEmailAddress: { emailAddress: "buyer@example.com" },
      privateMetadata: { credits: 4 },
    });
    mockUpdateUserMetadata.mockResolvedValue(undefined);
    mockSendGiftCreditsEmail.mockResolvedValue(undefined);
    mockSendPrintOrderConfirmedEmail.mockResolvedValue(undefined);
    mockInngestSend.mockResolvedValue(undefined);
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

  it("uses Stripe shipping for fulfillment while keeping stored checkout totals", async () => {
    mockDb.bookProjects.getById.mockResolvedValue({
      ...createProject(),
      printOrder: {
        productKey: "hardcover",
        productLabel: "Hardcover",
        provider: "Lulu",
        format: '8.5" square hardcover casewrap',
        status: "checkout_started",
        amountAud: 59.5,
        subtotalAud: 44.35,
        shippingAmountAud: 15.15,
        pageCount: 24,
        checkoutSessionId: "cs_test_123",
      },
    });
    mockConstructEvent.mockReturnValue({
      type: "checkout.session.completed",
      data: {
        object: createCheckoutSession(),
      },
    });
    mockRetrieveSession.mockResolvedValue(createCheckoutSession());

    const { POST } = await import("@/app/api/stripe/webhook/route");
    const res = await POST(
      new NextRequest("http://localhost/api/stripe/webhook", {
        method: "POST",
        headers: { "stripe-signature": "sig_test" },
        body: "{}",
      })
    );

    expect(res.status).toBe(200);
    expect(mockSubmitPrintFulfillment).toHaveBeenCalledWith({
      project: expect.objectContaining({ id: "book-1" }),
      order: expect.objectContaining({
        amountAud: 59.5,
        subtotalAud: 44.35,
        shippingAmountAud: 15.15,
        shipping: expect.objectContaining({
          name: "Buyer Parent",
          line1: "1 Billing St",
          city: "Sydney",
          postalCode: "2000",
        }),
      }),
    });
    const persistedPrintOrder = mockDb.bookProjects.update.mock.calls[0]?.[1]
      ?.printOrder as Record<string, unknown>;
    expect(persistedPrintOrder).not.toHaveProperty("shipping");
    expect(persistedPrintOrder).toMatchObject({
      amountAud: 59.5,
      subtotalAud: 44.35,
      shippingAmountAud: 15.15,
    });
  });

  it("marks gift credits paid and grants a referral reward without crediting the buyer", async () => {
    mockDb.giftOrders.claimPaid.mockResolvedValue({
      id: "gift-1",
      token: "gift-token",
      purchaserUserId: "user-1",
      purchaserEmail: "buyer@example.com",
      recipientEmail: "recipient@example.com",
      recipientName: "Nana",
      message: "Enjoy bedtime.",
      packId: "starter",
      credits: 10,
      amountAud: 499,
      status: "checkout_started",
      checkoutSessionId: "cs_test_123",
      referralReferrerUserId: "user-referrer",
      createdAt: "2026-07-20T00:00:00.000Z",
      updatedAt: "2026-07-20T00:00:00.000Z",
    });
    mockGetUser.mockResolvedValueOnce({
      privateMetadata: { credits: 2 },
    });
    mockGetUser.mockResolvedValueOnce({
      firstName: "Buyer",
      primaryEmailAddress: { emailAddress: "buyer@example.com" },
      privateMetadata: { credits: 4 },
    });
    mockConstructEvent.mockReturnValue({
      type: "checkout.session.completed",
      data: {
        object: createCheckoutSession({
          metadata: {
            checkoutType: "gift_credits",
            userId: "user-1",
            giftToken: "gift-token",
            credits: "10",
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
    expect(mockDb.giftOrders.claimPaid).toHaveBeenCalledWith(
      "gift-token",
      "user-1",
      expect.any(String),
      "cs_test_123",
      "pi_test_123"
    );
    expect(mockUpdateUserMetadata).toHaveBeenCalledWith("user-referrer", {
      privateMetadata: { credits: 3 },
    });
    expect(mockUpdateUserMetadata).not.toHaveBeenCalledWith(
      "user-1",
      expect.anything()
    );
    expect(mockSendGiftCreditsEmail).toHaveBeenCalledTimes(1);
  });

  it("marks public print orders paid and submits Lulu fulfillment", async () => {
    mockDb.printOrders.getByCheckoutSessionId.mockResolvedValue({
      id: "print-order-1",
      type: "public_purchase",
      projectId: "book-1",
      storyId: "story-1",
      ownerUserId: "owner-1",
      buyerUserId: "buyer-1",
      buyerEmail: "buyer@example.com",
      productKey: "hardcover",
      productLabel: "Hardcover",
      provider: "lulu",
      format: '8.5" square hardcover casewrap',
      status: "checkout_started",
      amountAudCents: 5195,
      subtotalAudCents: 3995,
      shippingAudCents: 1200,
      luluCostAudCents: 3000,
      marginAudCents: 1800,
      pageCount: 24,
      quantity: 1,
      checkoutSessionId: "cs_test_123",
      createdAt: "2026-07-28T00:00:00.000Z",
      updatedAt: "2026-07-28T00:00:00.000Z",
    });
    mockDb.bookProjects.getById.mockResolvedValue({
      ...createProject(),
      userId: "owner-1",
    });
    mockDb.stories.getById.mockResolvedValue({
      title: "Moonlight Garden",
      shareToken: "share-1",
    });
    mockConstructEvent.mockReturnValue({
      type: "checkout.session.completed",
      data: {
        object: createCheckoutSession({
          metadata: {
            checkoutType: "public_print_book",
            userId: "buyer-1",
            buyerUserId: "buyer-1",
            ownerUserId: "owner-1",
            storyId: "story-1",
            projectId: "book-1",
            productKey: "hardcover",
          },
          collected_information: {
            business_name: null,
            individual_name: null,
            shipping_details: {
              name: "Public Buyer",
              address: {
                city: "Adelaide",
                country: "AU",
                line1: "8 Public Road",
                line2: null,
                postal_code: "5000",
                state: "SA",
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
    // The webhook records the paid order (with shipping) and enqueues the Lulu
    // submission durably, instead of calling Lulu inline.
    expect(mockSubmitPrintFulfillment).not.toHaveBeenCalled();
    expect(mockDb.printOrders.update).toHaveBeenCalledWith(
      "print-order-1",
      expect.objectContaining({
        status: "fulfillment_pending",
        paymentIntentId: "pi_test_123",
        paidAt: expect.any(String),
        shipping: expect.objectContaining({
          name: "Public Buyer",
          city: "Adelaide",
        }),
      })
    );
    expect(mockInngestSend).toHaveBeenCalledWith({
      name: "storycot/print.fulfillment.requested",
      data: { orderId: "print-order-1" },
    });
    expect(mockDb.bookProjects.update).not.toHaveBeenCalled();
    expect(mockSendPrintOrderConfirmedEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        toEmail: "buyer@example.com",
        storyTitle: "Moonlight Garden",
        trackUrl: "https://storycot.com/s/share-1",
      })
    );
  });

  it("does not repeat gift referral or email side effects for duplicate checkout webhooks", async () => {
    mockDb.giftOrders.claimPaid.mockResolvedValue(undefined);
    mockConstructEvent.mockReturnValue({
      type: "checkout.session.completed",
      data: {
        object: createCheckoutSession({
          metadata: {
            checkoutType: "gift_credits",
            userId: "user-1",
            giftToken: "gift-token",
            credits: "10",
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
    expect(mockUpdateUserMetadata).not.toHaveBeenCalled();
    expect(mockSendGiftCreditsEmail).not.toHaveBeenCalled();
  });

  it("treats a redelivered event id as a no-op via the processed-event ledger", async () => {
    mockDb.processedWebhookEvents.claim.mockResolvedValue(false);
    mockConstructEvent.mockReturnValue({
      id: "evt_dupe_1",
      type: "checkout.session.completed",
      data: { object: createCheckoutSession() },
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
    expect(await res.json()).toMatchObject({ duplicate: true });
    expect(mockSubmitPrintFulfillment).not.toHaveBeenCalled();
    expect(mockDb.bookProjects.update).not.toHaveBeenCalled();
  });

  it("does not resubmit private print fulfillment when one is already submitted", async () => {
    mockDb.bookProjects.getById.mockResolvedValue({
      ...createProject(),
      printOrder: {
        productKey: "hardcover",
        productLabel: "Hardcover",
        provider: "Lulu",
        format: '8.5" square hardcover casewrap',
        status: "paid",
        amountAud: 59.5,
        pageCount: 24,
        fulfillment: {
          provider: "lulu",
          status: "submitted",
          externalOrderId: "ord_existing",
        },
      },
    });
    mockConstructEvent.mockReturnValue({
      id: "evt_private_print_retry",
      type: "checkout.session.completed",
      data: { object: createCheckoutSession() },
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
    expect(await res.json()).toMatchObject({ alreadySubmitted: true });
    expect(mockSubmitPrintFulfillment).not.toHaveBeenCalled();
    expect(mockDb.bookProjects.update).not.toHaveBeenCalled();
  });

  it("releases the processed-event claim when handling throws so Stripe can retry", async () => {
    mockSubmitPrintFulfillment.mockRejectedValue(new Error("lulu down"));
    mockConstructEvent.mockReturnValue({
      id: "evt_fail_1",
      type: "checkout.session.completed",
      data: { object: createCheckoutSession() },
    });

    const { POST } = await import("@/app/api/stripe/webhook/route");
    const res = await POST(
      new NextRequest("http://localhost/api/stripe/webhook", {
        method: "POST",
        headers: { "stripe-signature": "sig_test" },
        body: "{}",
      })
    );

    expect(res.status).toBe(500);
    expect(mockDb.processedWebhookEvents.release).toHaveBeenCalledWith(
      "evt_fail_1"
    );
  });
});
