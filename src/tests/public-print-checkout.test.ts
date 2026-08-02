import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import type { BookProject } from "@/types/printBook";

const { mockAuth, mockCreateSession, mockGetUser } = vi.hoisted(() => ({
  mockAuth: vi.fn(async () => ({ userId: "buyer-1" })),
  mockCreateSession: vi.fn(async () => ({
    id: "cs_public_123",
    url: "https://checkout.stripe.test/public",
  })),
  mockGetUser: vi.fn(),
}));

const { mockQuoteLuluPrintJob } = vi.hoisted(() => ({
  mockQuoteLuluPrintJob: vi.fn(),
}));

const mockDb = vi.hoisted(() => ({
  stories: {
    getById: vi.fn(),
  },
  bookProjects: {
    getById: vi.fn(),
    getPublicPrintReadinessByStoryIds: vi.fn(),
  },
  printOrders: {
    create: vi.fn(),
  },
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

function createReadyProject(): BookProject {
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
    assets: {
      proofVersion: 1,
      proofingPassed: true,
      orderabilityState: "order_ready",
      luluCoverPdfUrl: "https://assets.example.com/cover.pdf",
      luluPrintPdfUrl: "https://assets.example.com/interior.pdf",
      luluPrintPdfPageCount: 24,
    },
    retryCount: 0,
    createdAt: "2026-07-28T00:00:00.000Z",
    updatedAt: "2026-07-28T00:00:00.000Z",
  };
}

function createExportReadyProject(): BookProject {
  const project = createReadyProject();
  return {
    ...project,
    assets: {
      ...project.assets,
      proofingPassed: false,
      orderabilityState: "export_ready",
    },
  };
}

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
  db: mockDb,
}));

describe("public print checkout", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    process.env.STRIPE_SECRET_KEY = "sk_test_123";
    process.env.STORYCOT_PRINT_PROVIDER = "lulu";
    delete process.env.PRINT_MIN_MARGIN_AUD;
    delete process.env.PRINT_SUPPORT_BUFFER_AUD;
    mockGetUser.mockResolvedValue({
      primaryEmailAddress: { emailAddress: "buyer@example.com" },
    });
    mockDb.stories.getById.mockResolvedValue({
      id: "story-1",
      userId: "owner-1",
      title: "Bailey and the Moon",
      visibility: "public",
      publicReviewStatus: "approved",
      status: "ready",
      shareToken: "share-1",
      ipPolicy: { riskLevel: "clear", printAllowed: true, reasons: [] },
    });
    mockDb.bookProjects.getPublicPrintReadinessByStoryIds.mockResolvedValue({
      "story-1": {
        bookProjectId: "book-1",
        ready: true,
        label: "Print-ready",
        detail: "Lulu-ready files are available.",
      },
    });
    mockDb.bookProjects.getById.mockResolvedValue(createReadyProject());
    mockDb.printOrders.create.mockResolvedValue(undefined);
    mockQuoteLuluPrintJob.mockResolvedValue({
      currency: "AUD",
      shipping_cost: { total_cost_incl_tax: "12.00" },
      total_cost_incl_tax: "30.00",
    });
  });

  it("creates Stripe checkout and a public print order record", async () => {
    const { POST } =
      await import("@/app/api/public-stories/[id]/checkout/route");

    const res = await POST(
      new NextRequest(
        "https://dev.storycot.com/api/public-stories/story-1/checkout",
        {
          method: "POST",
          headers: {
            "content-type": "application/json",
            origin: "https://dev.storycot.com",
            referer: "https://dev.storycot.com/en/s/share-1",
          },
          body: JSON.stringify({
            productKey: "hardcover",
            quantity: 1,
            shipping: printShipping,
          }),
        }
      ),
      { params: Promise.resolve({ id: "story-1" }) }
    );

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      url: "https://checkout.stripe.test/public",
    });
    expect(mockCreateSession).toHaveBeenCalledWith(
      expect.objectContaining({
        customer_email: "buyer@example.com",
        success_url: "https://dev.storycot.com/en/s/share-1?print_success=1",
        cancel_url: "https://dev.storycot.com/en/s/share-1?print_canceled=1",
        metadata: expect.objectContaining({
          checkoutType: "public_print_book",
          buyerUserId: "buyer-1",
          ownerUserId: "owner-1",
          storyId: "story-1",
          projectId: "book-1",
          amountAud: "51.95",
          luluCostAud: "30.00",
        }),
      })
    );
    expect(mockDb.printOrders.create).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "public_purchase",
        projectId: "book-1",
        storyId: "story-1",
        ownerUserId: "owner-1",
        buyerUserId: "buyer-1",
        amountAudCents: 5195,
        subtotalAudCents: 3995,
        shippingAudCents: 1200,
        luluCostAudCents: 3000,
        checkoutSessionId: "cs_public_123",
      })
    );
  });

  it("raises the subtotal to the configured margin floor when live cost is high", async () => {
    process.env.PRINT_MIN_MARGIN_AUD = "6";
    process.env.PRINT_SUPPORT_BUFFER_AUD = "2";
    mockQuoteLuluPrintJob.mockResolvedValue({
      currency: "AUD",
      shipping_cost: { total_cost_incl_tax: "12.00" },
      total_cost_incl_tax: "48.00",
    });
    const { POST } =
      await import("@/app/api/public-stories/[id]/checkout/route");

    const res = await POST(
      new NextRequest(
        "https://dev.storycot.com/api/public-stories/story-1/checkout",
        {
          method: "POST",
          headers: {
            "content-type": "application/json",
            origin: "https://dev.storycot.com",
            referer: "https://dev.storycot.com/en/s/share-1",
          },
          body: JSON.stringify({
            productKey: "hardcover",
            quantity: 1,
            shipping: printShipping,
          }),
        }
      ),
      { params: Promise.resolve({ id: "story-1" }) }
    );

    expect(res.status).toBe(200);
    expect(mockCreateSession).toHaveBeenCalledWith(
      expect.objectContaining({
        line_items: expect.arrayContaining([
          expect.objectContaining({
            price_data: expect.objectContaining({
              unit_amount: expect.any(Number),
            }),
          }),
        ]),
      })
    );
    const sessionInput = (
      mockCreateSession.mock.calls as unknown as [
        [{ line_items: { price_data: { unit_amount: number } }[] }],
      ]
    )[0][0];
    expect(sessionInput.line_items[0].price_data.unit_amount).toBeGreaterThan(
      3995
    );
    expect(mockDb.printOrders.create).toHaveBeenCalledWith(
      expect.objectContaining({
        luluCostAudCents: 4800,
        marginAudCents: expect.any(Number),
      })
    );
  });

  it("allows public checkout for export-ready Lulu books", async () => {
    mockDb.bookProjects.getById.mockResolvedValue(createExportReadyProject());
    const { POST } =
      await import("@/app/api/public-stories/[id]/checkout/route");

    const res = await POST(
      new NextRequest(
        "https://dev.storycot.com/api/public-stories/story-1/checkout",
        {
          method: "POST",
          headers: {
            "content-type": "application/json",
            origin: "https://dev.storycot.com",
            referer: "https://dev.storycot.com/en/s/share-1",
          },
          body: JSON.stringify({
            productKey: "hardcover",
            quantity: 1,
            shipping: printShipping,
          }),
        }
      ),
      { params: Promise.resolve({ id: "story-1" }) }
    );

    expect(res.status).toBe(200);
    expect(mockCreateSession).toHaveBeenCalled();
    expect(mockDb.printOrders.create).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "public_purchase",
        projectId: "book-1",
      })
    );
  });

  it("rejects non-approved public stories", async () => {
    mockDb.stories.getById.mockResolvedValue({
      id: "story-1",
      userId: "owner-1",
      visibility: "private",
      publicReviewStatus: "not_submitted",
      status: "ready",
    });
    const { POST } =
      await import("@/app/api/public-stories/[id]/checkout/route");

    const res = await POST(
      new NextRequest(
        "https://dev.storycot.com/api/public-stories/story-1/checkout",
        {
          method: "POST",
          body: JSON.stringify({
            productKey: "hardcover",
            shipping: printShipping,
          }),
        }
      ),
      { params: Promise.resolve({ id: "story-1" }) }
    );

    expect(res.status).toBe(404);
    expect(mockCreateSession).not.toHaveBeenCalled();
  });
});
