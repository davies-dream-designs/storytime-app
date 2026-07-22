import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const { mockAuth, mockCreateSession } = vi.hoisted(() => ({
  mockAuth: vi.fn(async () => ({ userId: "user-1" })),
  mockCreateSession: vi.fn(async () => ({
    id: "cs_test_123",
    url: "https://checkout.stripe.test/session",
  })),
}));

const { mockGetBookProjectById, mockUpdateBookProject } = vi.hoisted(() => ({
  mockGetBookProjectById: vi.fn(),
  mockUpdateBookProject: vi.fn(),
}));

const { mockGetStoryById } = vi.hoisted(() => ({
  mockGetStoryById: vi.fn(),
}));

vi.mock("@clerk/nextjs/server", () => ({
  auth: mockAuth,
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

vi.mock("@/lib/db", () => ({
  db: {
    stories: {
      getById: mockGetStoryById,
    },
    bookProjects: {
      getById: mockGetBookProjectById,
      update: mockUpdateBookProject,
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
    mockGetBookProjectById.mockResolvedValue(undefined);
    mockGetStoryById.mockResolvedValue({
      id: "story-1",
      userId: "user-1",
      ipPolicy: { riskLevel: "clear", printAllowed: true, reasons: [] },
    });
    mockUpdateBookProject.mockResolvedValue(undefined);
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
          // no origin header — iOS Safari omits it for same-origin fetches
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
        shipping_address_collection: {
          allowed_countries: ["AU"],
        },
        line_items: [
          expect.objectContaining({
            price_data: expect.objectContaining({
              currency: "aud",
              unit_amount: 4435,
            }),
          }),
        ],
        metadata: expect.objectContaining({
          checkoutType: "print_book",
          projectId: "book-1",
          productKey: "hardcover",
          amountAud: "44.35",
        }),
      })
    );
    expect(mockUpdateBookProject).toHaveBeenCalledWith(
      "book-1",
      expect.objectContaining({
        printOrder: expect.objectContaining({
          status: "checkout_started",
          productKey: "hardcover",
          amountAud: 44.35,
          checkoutSessionId: "cs_test_123",
        }),
      })
    );
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
        ],
        metadata: expect.objectContaining({
          productKey: "softcover",
          amountAud: "30.15",
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
