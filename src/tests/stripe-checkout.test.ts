import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const { mockAuth, mockCreateSession, mockGetUser } = vi.hoisted(() => ({
  mockAuth: vi.fn(async () => ({ userId: "user-1" })),
  mockCreateSession: vi.fn(async () => ({
    id: "cs_test_123",
    url: "https://checkout.stripe.test/session",
  })),
  mockGetUser: vi.fn(),
}));

const { mockGetBookProjectById, mockUpdateBookProject, mockCreateGiftOrder } =
  vi.hoisted(() => ({
    mockGetBookProjectById: vi.fn(),
    mockUpdateBookProject: vi.fn(),
    mockCreateGiftOrder: vi.fn(),
  }));

const { mockGetStoryById } = vi.hoisted(() => ({
  mockGetStoryById: vi.fn(),
}));

const { mockQuoteLuluPrintJob } = vi.hoisted(() => ({
  mockQuoteLuluPrintJob: vi.fn(),
}));

const printShipping = {
  name: "Print Reader",
  email: "reader@example.com",
  phone: "+61 2 5555 0100",
  line1: "1 Story Street",
  city: "Sydney",
  state: "NSW",
  postalCode: "2000",
  countryCode: "AU",
};

vi.mock("@clerk/nextjs/server", () => ({
  auth: mockAuth,
  clerkClient: vi.fn(async () => ({
    users: {
      getUser: mockGetUser,
    },
  })),
}));

vi.mock("stripe", () => ({
  default: vi.fn().mockImplementation(() => ({
    checkout: {
      sessions: {
        create: mockCreateSession,
      },
    },
  })),
}));

vi.mock("@/lib/print-books/lulu", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("@/lib/print-books/lulu")>();
  return {
    ...actual,
    quoteLuluPrintJob: mockQuoteLuluPrintJob,
  };
});

vi.mock("@/lib/db", () => ({
  db: {
    stories: {
      getById: mockGetStoryById,
    },
    bookProjects: {
      getById: mockGetBookProjectById,
      update: mockUpdateBookProject,
    },
    giftOrders: {
      create: mockCreateGiftOrder,
    },
  },
}));

describe("stripe checkout", () => {
  const previousEnv = process.env;

  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
    process.env = { ...previousEnv };
    process.env.STRIPE_SECRET_KEY = "sk_test_123";
    process.env.NEXT_PUBLIC_APP_URL = "https://storycot.com";
    delete process.env.PRINT_BOOK_ORDERING_ENABLED;
    delete process.env.NEXT_PUBLIC_PRINT_BOOK_ORDERING_ENABLED;
    delete process.env.VERCEL_ENV;
    mockGetUser.mockResolvedValue({ privateMetadata: { isAdmin: false } });
    mockGetBookProjectById.mockResolvedValue(undefined);
    mockGetStoryById.mockResolvedValue({
      id: "story-1",
      userId: "user-1",
      ipPolicy: { riskLevel: "clear", printAllowed: true, reasons: [] },
    });
    mockUpdateBookProject.mockResolvedValue(undefined);
    mockCreateGiftOrder.mockResolvedValue(undefined);
    mockQuoteLuluPrintJob.mockResolvedValue({
      currency: "AUD",
      shipping_cost: {
        total_cost_incl_tax: "12.34",
      },
    });
  });

  it("returns users to the current request origin and locale instead of configured production URL", async () => {
    const { POST } = await import("@/app/api/stripe/checkout/route");

    const res = await POST(
      new NextRequest("https://dev.storycot.com/api/stripe/checkout", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          origin: "https://dev.storycot.com",
          referer: "https://dev.storycot.com/en/account",
        },
        body: JSON.stringify({ pack: "starter" }),
      })
    );

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      url: "https://checkout.stripe.test/session",
    });
    expect(mockCreateSession).toHaveBeenCalledWith(
      expect.objectContaining({
        locale: "en",
        success_url: "https://dev.storycot.com/en/account?success=1",
        cancel_url: "https://dev.storycot.com/en/account?canceled=1",
      })
    );
  });

  it("falls back to referer origin when Origin header is absent (iOS Safari behaviour)", async () => {
    const { POST } = await import("@/app/api/stripe/checkout/route");

    await POST(
      new NextRequest("https://dev.storycot.com/api/stripe/checkout", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          // no origin header - iOS Safari omits it for same-origin fetches
          referer: "https://dev.storycot.com/en/account",
        },
        body: JSON.stringify({ pack: "starter" }),
      })
    );

    expect(mockCreateSession).toHaveBeenCalledWith(
      expect.objectContaining({
        success_url: "https://dev.storycot.com/en/account?success=1",
        cancel_url: "https://dev.storycot.com/en/account?canceled=1",
      })
    );
  });

  it("passes the current app locale to Stripe Checkout when supported", async () => {
    const { POST } = await import("@/app/api/stripe/checkout/route");

    await POST(
      new NextRequest("https://dev.storycot.com/api/stripe/checkout", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          origin: "https://dev.storycot.com",
          referer: "https://dev.storycot.com/fr/account",
        },
        body: JSON.stringify({ pack: "family" }),
      })
    );

    expect(mockCreateSession).toHaveBeenCalledWith(
      expect.objectContaining({
        locale: "fr",
        success_url: "https://dev.storycot.com/fr/account?success=1",
        cancel_url: "https://dev.storycot.com/fr/account?canceled=1",
      })
    );
  });

  it("lets Stripe auto-detect the locale when the current app locale is missing", async () => {
    const { POST } = await import("@/app/api/stripe/checkout/route");

    await POST(
      new NextRequest("https://dev.storycot.com/api/stripe/checkout", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          origin: "https://dev.storycot.com",
          referer: "https://dev.storycot.com/account",
        },
        body: JSON.stringify({ pack: "pro" }),
      })
    );

    expect(mockCreateSession).toHaveBeenCalledWith(
      expect.objectContaining({
        locale: "auto",
        success_url: "https://dev.storycot.com/account?success=1",
        cancel_url: "https://dev.storycot.com/account?canceled=1",
      })
    );
  });

  it("creates a gift credit checkout and stores the gift token for redemption", async () => {
    mockGetUser.mockResolvedValue({
      privateMetadata: { isAdmin: false },
      primaryEmailAddress: { emailAddress: "buyer@example.com" },
    });
    const { POST } = await import("@/app/api/stripe/checkout/route");

    const res = await POST(
      new NextRequest("https://dev.storycot.com/api/stripe/checkout", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          origin: "https://dev.storycot.com",
          referer: "https://dev.storycot.com/en/account",
          cookie: "storycot_ref=user_referrer1",
        },
        body: JSON.stringify({
          type: "gift_credits",
          pack: "starter",
          recipientEmail: "Grandma@Example.com",
          recipientName: "Grandma",
          message: "For bedtime.",
        }),
      })
    );

    expect(res.status).toBe(200);
    expect(mockCreateSession).toHaveBeenCalledWith(
      expect.objectContaining({
        customer_email: "buyer@example.com",
        success_url: expect.stringMatching(
          /^https:\/\/dev\.storycot\.com\/en\/gift\/[A-Za-z0-9_-]+\?gift_success=1$/
        ),
        cancel_url: "https://dev.storycot.com/en/account?gift_canceled=1",
        metadata: expect.objectContaining({
          checkoutType: "gift_credits",
          credits: "10",
          recipientEmail: "grandma@example.com",
          recipientName: "Grandma",
          referralReferrerUserId: "user_referrer1",
        }),
      })
    );
    expect(mockCreateGiftOrder).toHaveBeenCalledWith(
      expect.objectContaining({
        purchaserUserId: "user-1",
        purchaserEmail: "buyer@example.com",
        recipientEmail: "grandma@example.com",
        recipientName: "Grandma",
        message: "For bedtime.",
        packId: "starter",
        credits: 10,
        amountAud: 499,
        status: "checkout_started",
        checkoutSessionId: "cs_test_123",
        referralReferrerUserId: "user_referrer1",
      })
    );
  });

  it("creates a dynamic print book checkout from the stored project price", async () => {
    mockGetBookProjectById.mockResolvedValue({
      id: "book-1",
      userId: "user-1",
      status: "ready",
      sourceStoryId: "story-1",
      pageCount: 32,
      spreadCount: 16,
      assets: {
        coverPdfUrl: "https://example.com/cover.pdf",
        printPdfUrl: "https://example.com/print.pdf",
        orderabilityState: "export_ready",
      },
    });

    const { POST } = await import("@/app/api/stripe/checkout/route");

    const res = await POST(
      new NextRequest("https://dev.storycot.com/api/stripe/checkout", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          origin: "https://dev.storycot.com",
          referer: "https://dev.storycot.com/en/books/book-1",
        },
        body: JSON.stringify({
          type: "print_book",
          projectId: "book-1",
          productKey: "hardcover",
          shipping: printShipping,
        }),
      })
    );

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      url: "https://checkout.stripe.test/session",
    });
    expect(mockCreateSession).toHaveBeenCalledWith(
      expect.objectContaining({
        mode: "payment",
        success_url: "https://dev.storycot.com/en/books/book-1?print_success=1",
        cancel_url: "https://dev.storycot.com/en/books/book-1?print_canceled=1",
        line_items: [
          expect.objectContaining({
            price_data: expect.objectContaining({
              currency: "aud",
              unit_amount: 4435,
            }),
          }),
          expect.objectContaining({
            price_data: expect.objectContaining({
              currency: "aud",
              unit_amount: 1515,
            }),
            quantity: 1,
          }),
        ],
        metadata: expect.objectContaining({
          checkoutType: "print_book",
          projectId: "book-1",
          productKey: "hardcover",
          amountAud: "59.50",
          subtotalAud: "44.35",
          shippingAmountAud: "15.15",
        }),
      })
    );
    const checkoutParams = (
      mockCreateSession as unknown as {
        mock: { calls: Array<[Record<string, unknown>]> };
      }
    ).mock.calls[0]?.[0];
    expect(checkoutParams).not.toHaveProperty("shipping_address_collection");
    expect(mockUpdateBookProject).toHaveBeenCalledWith(
      "book-1",
      expect.objectContaining({
        printOrder: expect.objectContaining({
          status: "checkout_started",
          productKey: "hardcover",
          amountAud: 59.5,
          subtotalAud: 44.35,
          shippingAmountAud: 15.15,
          shipping: expect.objectContaining({
            line1: "1 Story Street",
            countryCode: "AU",
          }),
          checkoutSessionId: "cs_test_123",
        }),
      })
    );
  });

  it("rejects print checkout until an Australian shipping address is supplied", async () => {
    mockGetBookProjectById.mockResolvedValue({
      id: "book-1",
      userId: "user-1",
      status: "ready",
      sourceStoryId: "story-1",
      pageCount: 32,
      spreadCount: 16,
      assets: {
        coverPdfUrl: "https://example.com/cover.pdf",
        printPdfUrl: "https://example.com/print.pdf",
        orderabilityState: "export_ready",
      },
    });

    const { POST } = await import("@/app/api/stripe/checkout/route");

    const res = await POST(
      new NextRequest("https://dev.storycot.com/api/stripe/checkout", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          origin: "https://dev.storycot.com",
          referer: "https://dev.storycot.com/en/books/book-1",
        },
        body: JSON.stringify({
          type: "print_book",
          projectId: "book-1",
          productKey: "hardcover",
        }),
      })
    );

    expect(res.status).toBe(400);
    await expect(res.json()).resolves.toEqual({
      error: "Australian shipping address is required before checkout.",
    });
    expect(mockCreateSession).not.toHaveBeenCalled();
  });

  it("allows public print checkout in production when ordering is enabled", async () => {
    process.env.VERCEL_ENV = "production";
    mockGetBookProjectById.mockResolvedValue({
      id: "book-1",
      userId: "user-1",
      status: "ready",
      sourceStoryId: "story-1",
      pageCount: 32,
      spreadCount: 16,
      assets: {
        coverPdfUrl: "https://example.com/cover.pdf",
        printPdfUrl: "https://example.com/print.pdf",
        luluCoverPdfUrl: "https://example.com/lulu-cover.pdf",
        luluPrintPdfUrl: "https://example.com/lulu-print.pdf",
        orderabilityState: "export_ready",
        proofVersion: 1,
      },
    });

    const { POST } = await import("@/app/api/stripe/checkout/route");

    const res = await POST(
      new NextRequest("https://storycot.com/api/stripe/checkout", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          origin: "https://storycot.com",
          referer: "https://storycot.com/en/books/book-1",
        },
        body: JSON.stringify({
          type: "print_book",
          projectId: "book-1",
          productKey: "hardcover",
          shipping: printShipping,
        }),
      })
    );

    expect(res.status).toBe(200);
    expect(mockCreateSession).toHaveBeenCalled();
  });

  it("allows admin print checkout in production for testing", async () => {
    process.env.VERCEL_ENV = "production";
    mockGetUser.mockResolvedValue({ privateMetadata: { isAdmin: true } });
    mockGetBookProjectById.mockResolvedValue({
      id: "book-1",
      userId: "user-1",
      status: "ready",
      sourceStoryId: "story-1",
      pageCount: 32,
      spreadCount: 16,
      assets: {
        coverPdfUrl: "https://example.com/cover.pdf",
        printPdfUrl: "https://example.com/print.pdf",
        orderabilityState: "export_ready",
      },
    });

    const { POST } = await import("@/app/api/stripe/checkout/route");

    const res = await POST(
      new NextRequest("https://storycot.com/api/stripe/checkout", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          origin: "https://storycot.com",
          referer: "https://storycot.com/en/books/book-1",
        },
        body: JSON.stringify({
          type: "print_book",
          projectId: "book-1",
          productKey: "hardcover",
          shipping: printShipping,
        }),
      })
    );

    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({
      url: "https://checkout.stripe.test/session",
    });
  });

  it("creates a Lulu softcover checkout when Lulu print files are ready", async () => {
    process.env.STORYCOT_PRINT_PROVIDER = "lulu";
    mockGetBookProjectById.mockResolvedValue({
      id: "book-1",
      userId: "user-1",
      status: "ready",
      sourceStoryId: "story-1",
      pageCount: 32,
      spreadCount: 16,
      assets: {
        coverPdfUrl: "https://example.com/cover.pdf",
        printPdfUrl: "https://example.com/print.pdf",
        luluCoverPdfUrl: "https://example.com/lulu-cover.pdf",
        luluPrintPdfUrl: "https://example.com/lulu-print.pdf",
        luluPrintPdfPageCount: 24,
        orderabilityState: "export_ready",
      },
    });

    const { POST } = await import("@/app/api/stripe/checkout/route");

    const res = await POST(
      new NextRequest("https://dev.storycot.com/api/stripe/checkout", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          origin: "https://dev.storycot.com",
          referer: "https://dev.storycot.com/en/books/book-1",
        },
        body: JSON.stringify({
          type: "print_book",
          projectId: "book-1",
          productKey: "softcover",
          shipping: printShipping,
        }),
      })
    );

    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({
      url: "https://checkout.stripe.test/session",
    });
    expect(mockCreateSession).toHaveBeenCalledWith(
      expect.objectContaining({
        line_items: [
          expect.objectContaining({
            price_data: expect.objectContaining({
              currency: "aud",
              unit_amount: 3015,
            }),
          }),
          expect.objectContaining({
            price_data: expect.objectContaining({
              currency: "aud",
              unit_amount: 1234,
            }),
            quantity: 1,
          }),
        ],
        metadata: expect.objectContaining({
          productKey: "softcover",
          amountAud: "42.49",
          subtotalAud: "30.15",
          shippingAmountAud: "12.34",
        }),
      })
    );
    expect(mockQuoteLuluPrintJob).toHaveBeenCalledWith(
      expect.objectContaining({
        pageCount: 32,
        productKey: "softcover",
        quantity: 1,
        shipping: expect.objectContaining({
          postalCode: "2000",
          countryCode: "AU",
        }),
      })
    );
  });

  it("rejects Lulu checkout until Lulu-sized print files exist", async () => {
    process.env.STORYCOT_PRINT_PROVIDER = "lulu";
    mockGetBookProjectById.mockResolvedValue({
      id: "book-1",
      userId: "user-1",
      status: "ready",
      sourceStoryId: "story-1",
      pageCount: 20,
      spreadCount: 10,
      assets: {
        coverPdfUrl: "https://example.com/cover.pdf",
        printPdfUrl: "https://example.com/print.pdf",
        orderabilityState: "export_ready",
      },
    });

    const { POST } = await import("@/app/api/stripe/checkout/route");

    const res = await POST(
      new NextRequest("https://dev.storycot.com/api/stripe/checkout", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          origin: "https://dev.storycot.com",
          referer: "https://dev.storycot.com/en/books/book-1",
        },
        body: JSON.stringify({
          type: "print_book",
          projectId: "book-1",
          productKey: "hardcover",
          shipping: printShipping,
        }),
      })
    );

    expect(res.status).toBe(409);
    await expect(res.json()).resolves.toEqual({
      error: "Lulu print files are not ready yet.",
    });
    expect(mockCreateSession).not.toHaveBeenCalled();
  });

  it("rejects print checkout for stories marked as print restricted by IP policy", async () => {
    mockGetBookProjectById.mockResolvedValue({
      id: "book-1",
      userId: "user-1",
      sourceStoryId: "story-1",
      status: "ready",
      pageCount: 32,
      spreadCount: 16,
      assets: {
        coverPdfUrl: "https://example.com/cover.pdf",
        printPdfUrl: "https://example.com/print.pdf",
        orderabilityState: "export_ready",
      },
    });
    mockGetStoryById.mockResolvedValue({
      id: "story-1",
      userId: "user-1",
      ipPolicy: {
        riskLevel: "restricted",
        printAllowed: false,
        reasons: ["protected_reference"],
      },
    });

    const { POST } = await import("@/app/api/stripe/checkout/route");

    const res = await POST(
      new NextRequest("https://dev.storycot.com/api/stripe/checkout", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          origin: "https://dev.storycot.com",
          referer: "https://dev.storycot.com/en/books/book-1",
        },
        body: JSON.stringify({
          type: "print_book",
          projectId: "book-1",
          productKey: "hardcover",
          shipping: printShipping,
        }),
      })
    );

    expect(res.status).toBe(409);
    await expect(res.json()).resolves.toEqual({
      error:
        "This story can be downloaded for personal review, but it cannot be ordered as a printed book because it may include protected characters, brands, or source material.",
    });
    expect(mockCreateSession).not.toHaveBeenCalled();
  });
});
