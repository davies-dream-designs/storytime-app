import { beforeEach, describe, expect, it } from "vitest";
import { preparePrintFulfillment } from "@/lib/print-books/fulfillment";
import type { BookProject, PrintBookOrder } from "@/types/printBook";

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
      coverPdfUrl: "https://assets.storycot.test/book-1-cover.pdf",
      printPdfUrl: "https://assets.storycot.test/book-1-print.pdf",
      orderabilityState: "export_ready",
    },
    retryCount: 0,
    createdAt: "2026-07-17T00:00:00.000Z",
    updatedAt: "2026-07-17T00:00:00.000Z",
  };
}

function createOrder(): PrintBookOrder {
  return {
    productKey: "softcover",
    productLabel: "Softcover",
    provider: "Prodigi",
    format: "21x21cm square softcover",
    status: "paid",
    amountAud: 29.95,
    pageCount: 24,
    checkoutSessionId: "cs_test_123",
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
  };
}

describe("preparePrintFulfillment", () => {
  const previousEnv = process.env;

  beforeEach(() => {
    process.env = { ...previousEnv };
    delete process.env.STORYCOT_PRINT_PROVIDER;
    delete process.env.STORYCOT_PRODIGI_SOFTCOVER_SKU;
  });

  it("keeps paid orders safe when supplier SKUs are not configured", () => {
    const fulfillment = preparePrintFulfillment({
      project: createProject(),
      order: createOrder(),
    });

    expect(fulfillment.status).toBe("not_configured");
    expect(fulfillment.provider).toBe("prodigi");
    expect(fulfillment.message).toContain("Prodigi SKU is not configured");
  });

  it("prepares a Prodigi payload with public PDFs and page count", () => {
    process.env.STORYCOT_PRODIGI_SOFTCOVER_SKU = "BOOK-SQUARE-SOFT";

    const fulfillment = preparePrintFulfillment({
      project: createProject(),
      order: createOrder(),
    });

    expect(fulfillment.status).toBe("ready_for_manual_review");
    expect(fulfillment.payload).toMatchObject({
      merchantReference: "storycot-book-1",
      shippingMethod: "Standard",
      items: [
        {
          sku: "BOOK-SQUARE-SOFT",
          assets: [
            {
              printArea: "default",
              url: "https://assets.storycot.test/book-1-print.pdf",
              pageCount: 24,
            },
            {
              printArea: "cover",
              url: "https://assets.storycot.test/book-1-cover.pdf",
            },
          ],
        },
      ],
    });
  });
});
