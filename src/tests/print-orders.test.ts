import { beforeEach, describe, expect, it } from "vitest";
import { createMemoryDb } from "@/tests/helpers/memoryDb";
import type { PrintOrderRecord } from "@/types/printBook";

function createPrintOrder(
  overrides: Partial<PrintOrderRecord> = {}
): PrintOrderRecord {
  const now = "2026-07-28T00:00:00.000Z";
  return {
    id: "order-1",
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
    amountAudCents: 4995,
    subtotalAudCents: 3995,
    shippingAudCents: 1000,
    luluCostAudCents: 3200,
    marginAudCents: 795,
    pageCount: 24,
    quantity: 1,
    checkoutSessionId: "cs_test_1",
    billingCountry: "AU",
    shipping: {
      name: "Test Buyer",
      email: "buyer@example.com",
      phone: "0400000000",
      line1: "1 Test Street",
      city: "Sydney",
      state: "NSW",
      postalCode: "2000",
      countryCode: "AU",
    },
    checkoutStartedAt: now,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

describe("print order records", () => {
  let db: ReturnType<typeof createMemoryDb>;

  beforeEach(() => {
    db = createMemoryDb();
  });

  it("stores multiple public purchases for the same story and project", async () => {
    await db.printOrders.create(createPrintOrder());
    await db.printOrders.create(
      createPrintOrder({
        id: "order-2",
        buyerUserId: "buyer-2",
        buyerEmail: "other@example.com",
        checkoutSessionId: "cs_test_2",
        createdAt: "2026-07-28T00:01:00.000Z",
        updatedAt: "2026-07-28T00:01:00.000Z",
      })
    );

    const projectOrders = await db.printOrders.getByProjectId("book-1");
    const storyOrders = await db.printOrders.getByStoryId("story-1");

    expect(projectOrders.map((order) => order.id)).toEqual([
      "order-2",
      "order-1",
    ]);
    expect(storyOrders).toHaveLength(2);
  });

  it("finds an order by Stripe checkout session and updates payment state", async () => {
    await db.printOrders.create(createPrintOrder());

    const found = await db.printOrders.getByCheckoutSessionId("cs_test_1");
    expect(found?.id).toBe("order-1");

    const paid = await db.printOrders.update("order-1", {
      status: "paid",
      paymentIntentId: "pi_test_1",
      paidAt: "2026-07-28T00:02:00.000Z",
      updatedAt: "2026-07-28T00:02:00.000Z",
    });

    expect(paid).toMatchObject({
      status: "paid",
      paymentIntentId: "pi_test_1",
      paidAt: "2026-07-28T00:02:00.000Z",
      updatedAt: "2026-07-28T00:02:00.000Z",
    });
  });

  it("lists owner and buyer order histories separately", async () => {
    await db.printOrders.create(createPrintOrder());
    await db.printOrders.create(
      createPrintOrder({
        id: "order-2",
        storyId: "story-2",
        projectId: "book-2",
        ownerUserId: "owner-2",
        buyerUserId: "buyer-1",
        checkoutSessionId: "cs_test_2",
        createdAt: "2026-07-28T00:03:00.000Z",
      })
    );

    const ownerOrders = await db.printOrders.getByOwnerUserId("owner-1");
    const buyerOrders = await db.printOrders.getByBuyerUserId("buyer-1");

    expect(ownerOrders.map((order) => order.id)).toEqual(["order-1"]);
    expect(buyerOrders.map((order) => order.id)).toEqual([
      "order-2",
      "order-1",
    ]);
  });
});
