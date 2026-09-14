import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import type { BookProject, PrintOrderRecord } from "@/types/printBook";

const mockDb = {
  bookProjects: {
    getById: vi.fn(),
    update: vi.fn(async () => undefined),
  },
  printOrders: {
    getByProjectId: vi.fn(async (): Promise<PrintOrderRecord[]> => []),
    update: vi.fn(async () => undefined),
  },
  stories: {
    getById: vi.fn(async () => ({ id: "story-1", title: "Adventure" })),
  },
};

const { mockSendShippedEmail, mockGetUser } = vi.hoisted(() => ({
  mockSendShippedEmail: vi.fn(async () => undefined),
  mockGetUser: vi.fn(async () => ({
    primaryEmailAddress: { emailAddress: "owner@example.com" },
    emailAddresses: [{ emailAddress: "owner@example.com" }],
  })),
}));

vi.mock("@/lib/db", () => ({ db: mockDb }));
vi.mock("@/lib/email", () => ({
  sendShippedEmail: mockSendShippedEmail,
  sendViaOutbox: vi.fn(
    async (
      _meta: { dedupeKey: string; kind: string; recipient: string },
      send: () => Promise<void>
    ) => {
      await send();
      return true;
    }
  ),
}));
vi.mock("@/lib/logEvent", () => ({ logEvent: vi.fn(async () => undefined) }));
vi.mock("@clerk/nextjs/server", () => ({
  clerkClient: vi.fn(async () => ({ users: { getUser: mockGetUser } })),
}));

function ownerProject(): BookProject {
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
    assets: { proofVersion: 1 },
    retryCount: 0,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    printOrder: {
      productKey: "hardcover",
      productLabel: "Hardcover",
      provider: "Lulu",
      format: "square",
      status: "paid",
      amountAud: 59.5,
      pageCount: 24,
      fulfillment: {
        provider: "lulu",
        status: "submitted",
        externalOrderId: "lulu-owner-1",
      },
    },
  };
}

function publicOrder(overrides: Partial<PrintOrderRecord> = {}): PrintOrderRecord {
  return {
    id: "po-1",
    type: "public_purchase",
    projectId: "book-1",
    storyId: "story-1",
    buyerUserId: "buyer-1",
    buyerEmail: "buyer@example.com",
    productKey: "hardcover",
    productLabel: "Hardcover",
    status: "fulfillment_pending",
    amountAudCents: 5950,
    shippingAudCents: 1500,
    pageCount: 24,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    fulfillment: {
      provider: "lulu",
      status: "submitted",
      externalOrderId: "lulu-public-1",
    },
    ...overrides,
  } as PrintOrderRecord;
}

function callback(body: Record<string, unknown>) {
  return new NextRequest("http://localhost/api/lulu/webhook", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

describe("Lulu webhook handler order resolution", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    mockDb.printOrders.getByProjectId.mockResolvedValue([]);
    mockDb.stories.getById.mockResolvedValue({
      id: "story-1",
      title: "Adventure",
    });
  });

  it("updates the public order matched by Lulu job id, not the owner order", async () => {
    mockDb.bookProjects.getById.mockResolvedValue(ownerProject());
    mockDb.printOrders.getByProjectId.mockResolvedValue([publicOrder()]);

    const { POST } = await import("@/app/api/lulu/webhook/route");
    const res = await POST(
      callback({
        event: "print_job.status.changed",
        data: {
          id: "lulu-public-1",
          external_id: "storycot-book-1",
          status: { name: "SHIPPED" },
          line_items: [{ tracking_urls: ["https://track/abc"] }],
        },
      })
    );

    expect(res.status).toBe(200);
    // Public order updated; owner order untouched.
    expect(mockDb.printOrders.update).toHaveBeenCalledWith(
      "po-1",
      expect.objectContaining({
        fulfillment: expect.objectContaining({ status: "shipped" }),
      })
    );
    expect(mockDb.bookProjects.update).not.toHaveBeenCalled();
  });

  it("updates the owner order matched by Lulu job id", async () => {
    mockDb.bookProjects.getById.mockResolvedValue(ownerProject());
    mockDb.printOrders.getByProjectId.mockResolvedValue([publicOrder()]);

    const { POST } = await import("@/app/api/lulu/webhook/route");
    const res = await POST(
      callback({
        event: "print_job.status.changed",
        data: {
          id: "lulu-owner-1",
          external_id: "storycot-book-1",
          status: { name: "IN_PRODUCTION" },
        },
      })
    );

    expect(res.status).toBe(200);
    expect(mockDb.bookProjects.update).toHaveBeenCalledWith(
      "book-1",
      expect.objectContaining({
        printOrder: expect.objectContaining({
          fulfillment: expect.objectContaining({ status: "submitted" }),
        }),
      })
    );
    expect(mockDb.printOrders.update).not.toHaveBeenCalled();
  });

  it("sends the owner shipped email to the account's Clerk email when it ships", async () => {
    mockDb.bookProjects.getById.mockResolvedValue(ownerProject());
    mockDb.printOrders.getByProjectId.mockResolvedValue([]);

    const { POST } = await import("@/app/api/lulu/webhook/route");
    await POST(
      callback({
        event: "print_job.status.changed",
        data: {
          id: "lulu-owner-1",
          external_id: "storycot-book-1",
          status: { name: "SHIPPED" },
          line_items: [{ tracking_urls: ["https://track/owner"] }],
        },
      })
    );

    expect(mockGetUser).toHaveBeenCalledWith("owner-1");
    expect(mockSendShippedEmail).toHaveBeenCalledWith(
      expect.objectContaining({ toEmail: "owner@example.com" })
    );
  });

  it("does not update any order when no job id matches and there are multiple candidates", async () => {
    mockDb.bookProjects.getById.mockResolvedValue(ownerProject());
    mockDb.printOrders.getByProjectId.mockResolvedValue([publicOrder()]);

    const { POST } = await import("@/app/api/lulu/webhook/route");
    const res = await POST(
      callback({
        event: "print_job.status.changed",
        data: {
          id: "unknown-job",
          external_id: "storycot-book-1",
          status: { name: "SHIPPED" },
        },
      })
    );

    expect(res.status).toBe(200);
    expect(mockDb.bookProjects.update).not.toHaveBeenCalled();
    expect(mockDb.printOrders.update).not.toHaveBeenCalled();
  });
});

describe("Lulu webhook handler authentication", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    delete process.env.LULU_WEBHOOK_TOKEN;
  });

  function statusChanged() {
    return {
      event: "print_job.status.changed",
      data: {
        id: "lulu-job-1",
        external_id: "storycot-project-1",
        status: { name: "SHIPPED" },
      },
    };
  }

  it("rejects a callback with no token when LULU_WEBHOOK_TOKEN is set", async () => {
    process.env.LULU_WEBHOOK_TOKEN = "s3cret";
    const { POST } = await import("@/app/api/lulu/webhook/route");
    const res = await POST(callback(statusChanged()));
    expect(res.status).toBe(401);
    expect(mockDb.bookProjects.update).not.toHaveBeenCalled();
  });

  it("rejects a callback with a wrong token", async () => {
    process.env.LULU_WEBHOOK_TOKEN = "s3cret";
    const { POST } = await import("@/app/api/lulu/webhook/route");
    const req = new NextRequest(
      "http://localhost/api/lulu/webhook?token=nope",
      { method: "POST", body: JSON.stringify(statusChanged()) }
    );
    const res = await POST(req);
    expect(res.status).toBe(401);
  });

  it("accepts a callback with the matching token", async () => {
    process.env.LULU_WEBHOOK_TOKEN = "s3cret";
    mockDb.bookProjects.getById.mockResolvedValue(undefined);
    const { POST } = await import("@/app/api/lulu/webhook/route");
    const req = new NextRequest(
      "http://localhost/api/lulu/webhook?token=s3cret",
      { method: "POST", body: JSON.stringify(statusChanged()) }
    );
    const res = await POST(req);
    expect(res.status).toBe(200);
  });

  it("accepts a callback when no token is configured (backwards compatible)", async () => {
    mockDb.bookProjects.getById.mockResolvedValue(undefined);
    const { POST } = await import("@/app/api/lulu/webhook/route");
    const res = await POST(callback(statusChanged()));
    expect(res.status).toBe(200);
  });
});
