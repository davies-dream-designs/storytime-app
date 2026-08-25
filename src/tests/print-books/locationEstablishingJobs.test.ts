import { beforeEach, describe, expect, it, vi } from "vitest";
import type { LocationFixture } from "@/types/printBook";

const {
  mockDeleteBookAssetUrls,
  mockGenerateLocationEstablishingFromPhotos,
  mockInngestSend,
  fixtureStore,
} = vi.hoisted(() => ({
  mockDeleteBookAssetUrls: vi.fn(async () => 1),
  mockGenerateLocationEstablishingFromPhotos: vi.fn(async () => ({
    establishingImageUrl: "https://blob.example/location.jpg",
  })),
  mockInngestSend: vi.fn(async () => undefined),
  fixtureStore: new Map<string, LocationFixture>(),
}));

vi.mock("@/lib/inngest/client", () => ({
  inngest: { send: mockInngestSend },
  INNGEST_EVENTS: {
    locationEstablishingRequested: "storycot/location.establishing.requested",
  },
}));

vi.mock("@/lib/print-books/locationEstablishing", () => ({
  generateLocationEstablishingFromPhotos:
    mockGenerateLocationEstablishingFromPhotos,
}));

vi.mock("@/lib/print-books/storage", () => ({
  deleteBookAssetUrls: mockDeleteBookAssetUrls,
  storeBookAsset: vi.fn(async () => "data:image/png;base64,AAAA"),
}));

vi.mock("@/lib/db", () => ({
  db: {
    locationFixtures: {
      getById: vi.fn(async (id: string) => fixtureStore.get(id)),
      update: vi.fn(async (id: string, updates: Partial<LocationFixture>) => {
        const current = fixtureStore.get(id);
        if (!current) return undefined;
        const next = { ...current, ...updates };
        fixtureStore.set(id, next);
        return next;
      }),
    },
    bookProjects: {
      getById: vi.fn(),
      update: vi.fn(),
    },
  },
}));

function makeFixture(): LocationFixture {
  return {
    id: "fixture-1",
    userId: "user-1",
    place: "Home",
    area: "Nursery",
    summary: "A nursery",
    notes: "Bailey's bed on left, Levi's cot on right",
    fixedElements: [],
    doNotChange: [],
    createdAt: "2026-08-25T00:00:00.000Z",
    updatedAt: "2026-08-25T00:00:00.000Z",
    establishingImageStatus: "queued",
    establishingImageJobId: "job-1",
  };
}

describe("processLocationEstablishingJob", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    fixtureStore.clear();
    fixtureStore.set("fixture-1", makeFixture());
  });

  it("finishes a fixture job after the request is gone and deletes temporary photos", async () => {
    const { processLocationEstablishingJob } =
      await import("@/lib/print-books/locationEstablishingJobs");

    await expect(
      processLocationEstablishingJob({
        jobId: "job-1",
        userId: "user-1",
        target: { kind: "location_fixture", fixtureId: "fixture-1" },
        photoUrls: ["data:image/png;base64,AAAA"],
      })
    ).resolves.toEqual({ jobId: "job-1", status: "ready" });

    expect(mockGenerateLocationEstablishingFromPhotos).toHaveBeenCalledWith(
      expect.objectContaining({
        location: expect.objectContaining({ id: "fixture-1" }),
        files: expect.arrayContaining([expect.any(File)]),
        pathnamePrefix: "location-fixtures/user-1/fixture-1",
      })
    );
    expect(fixtureStore.get("fixture-1")).toMatchObject({
      establishingImageUrl: "https://blob.example/location.jpg",
      establishingImageStatus: "ready",
      establishingImageJobId: undefined,
      referenceImageUrl: undefined,
    });
    expect(mockDeleteBookAssetUrls).toHaveBeenCalledWith([
      "data:image/png;base64,AAAA",
    ]);
  });
});
