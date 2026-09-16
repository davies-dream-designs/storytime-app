import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { createMemoryDb } from "@/tests/helpers/memoryDb";
import type { TradeTitle } from "@/types/tradeBook";

const memoryDb = createMemoryDb();
const mockAdminIdentity = vi.fn();

vi.mock("@/lib/db", () => ({ db: memoryDb }));
vi.mock("@/lib/adminAuth", () => ({ getAdminIdentity: mockAdminIdentity }));

function makeTitle(overrides: Partial<TradeTitle> = {}): TradeTitle {
  return {
    id: "trade-title-1",
    status: "draft",
    seedBrief: {
      theme: "Helping neighbours",
      premise: "A child helps restore a community garden.",
      notes: "Warm and gentle.",
      storyPreset: "preschool-story",
      locale: "en",
      protagonist: { name: "Mia", age: 5, gender: "girl" },
    },
    createdAt: "2026-09-16T00:00:00.000Z",
    updatedAt: "2026-09-16T00:00:00.000Z",
    ...overrides,
  };
}

beforeEach(() => {
  vi.resetModules();
  memoryDb._reset();
  mockAdminIdentity.mockReset();
  mockAdminIdentity.mockResolvedValue({
    userId: "admin-1",
    label: "admin@storycot.test",
  });
});

describe("admin Trade Titles API", () => {
  it("requires an admin identity", async () => {
    mockAdminIdentity.mockResolvedValue(null);
    const { GET } = await import("@/app/api/admin/trade-titles/route");

    const response = await GET();

    expect(response.status).toBe(403);
  });

  it("creates a queued title and enqueues a deduplicated generation job", async () => {
    const { POST } = await import("@/app/api/admin/trade-titles/route");
    const response = await POST(
      new NextRequest("http://localhost/api/admin/trade-titles", {
        method: "POST",
        body: JSON.stringify({
          theme: "Helping neighbours",
          premise: "A child helps restore a community garden.",
          notes: "Warm and gentle.",
          storyPreset: "preschool-story",
          locale: "en",
          protagonist: { name: "Mia", age: 5, gender: "girl" },
        }),
      })
    );

    expect(response.status).toBe(201);
    const { title } = (await response.json()) as { title: TradeTitle };
    expect(title).toMatchObject({
      status: "queued",
      seedBrief: {
        theme: "Helping neighbours",
        protagonist: { name: "Mia", age: 5, gender: "girl" },
      },
    });
    expect(await memoryDb.tradeTitles.getById(title.id)).toMatchObject({
      status: "queued",
    });

    const job = await memoryDb.tradeBookJobs.claimNext({
      leaseToken: "test-lease",
      now: "2099-01-01T00:00:00.000Z",
      leaseExpiresAt: "2099-01-01T00:30:00.000Z",
    });
    expect(job).toMatchObject({
      kind: "generate_title",
      dedupeKey: `generate-title:${title.id}:v1`,
      payload: { tradeTitleId: title.id },
    });
  });

  it("lists active Trade Titles for admins", async () => {
    await memoryDb.tradeTitles.create(makeTitle({ id: "draft-title" }));
    await memoryDb.tradeTitles.create(
      makeTitle({ id: "published-title", status: "published" })
    );
    const { GET } = await import("@/app/api/admin/trade-titles/route");

    const response = await GET();

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      titles: [expect.objectContaining({ id: "draft-title" })],
    });
  });

  it("records an admin review only when a title is a draft", async () => {
    await memoryDb.tradeTitles.create(makeTitle());
    const { POST } =
      await import("@/app/api/admin/trade-titles/[id]/action/route");

    const response = await POST(
      new NextRequest(
        "http://localhost/api/admin/trade-titles/trade-title-1/action",
        {
          method: "POST",
          body: JSON.stringify({ decision: "approved", note: "Ready." }),
        }
      ),
      { params: Promise.resolve({ id: "trade-title-1" }) }
    );

    expect(response.status).toBe(200);
    expect(await memoryDb.tradeTitles.getById("trade-title-1")).toMatchObject({
      status: "approved",
      reviewedBy: "admin@storycot.test",
      reviewNote: "Ready.",
      reviewedAt: expect.any(String),
    });
  });

  it("does not review titles outside the draft state", async () => {
    await memoryDb.tradeTitles.create(makeTitle({ status: "queued" }));
    const { POST } =
      await import("@/app/api/admin/trade-titles/[id]/action/route");

    const response = await POST(
      new NextRequest(
        "http://localhost/api/admin/trade-titles/trade-title-1/action",
        { method: "POST", body: JSON.stringify({ decision: "rejected" }) }
      ),
      { params: Promise.resolve({ id: "trade-title-1" }) }
    );

    expect(response.status).toBe(400);
    expect(await memoryDb.tradeTitles.getById("trade-title-1")).toMatchObject({
      status: "queued",
    });
  });
});
