import { beforeEach, describe, expect, it, vi } from "vitest";
import type { LocationFixture } from "@/types/printBook";

const {
  mockDeleteTemporaryPrivateAssets,
  mockReadTemporaryPrivateAsset,
  mockStoreTemporaryPrivateAsset,
  mockGenerateLocationEstablishingFromPhotos,
  mockInngestSend,
  fixtureStore,
} = vi.hoisted(() => ({
  mockDeleteTemporaryPrivateAssets: vi.fn(async () => undefined),
  mockReadTemporaryPrivateAsset: vi.fn(async () => ({
    buffer: Buffer.from([1, 2, 3, 4]),
    contentType: "image/png",
  })),
  mockStoreTemporaryPrivateAsset: vi.fn(
    async (input: { pathname: string }) => ({
      ref: input.pathname,
      isInline: false,
    })
  ),
  mockGenerateLocationEstablishingFromPhotos: vi.fn(async () => ({
    establishingImageUrl: "https://acct.blob.vercel-storage.com/location.jpg",
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
  deleteTemporaryPrivateAssets: mockDeleteTemporaryPrivateAssets,
  readTemporaryPrivateAsset: mockReadTemporaryPrivateAsset,
  storeTemporaryPrivateAsset: mockStoreTemporaryPrivateAsset,
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
      updateIfJob: vi.fn(
        async (
          id: string,
          expectedJobId: string,
          userId: string,
          updates: Partial<LocationFixture>
        ) => {
          const current = fixtureStore.get(id);
          if (
            !current ||
            current.userId !== userId ||
            current.establishingImageJobId !== expectedJobId
          ) {
            return undefined;
          }
          const next = { ...current, ...updates };
          fixtureStore.set(id, next);
          return next;
        }
      ),
    },
    bookProjects: { getById: vi.fn(), update: vi.fn() },
  },
}));

function makeFixture(overrides: Partial<LocationFixture> = {}): LocationFixture {
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
    ...overrides,
  };
}

describe("processLocationEstablishingJob", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    fixtureStore.clear();
    fixtureStore.set("fixture-1", makeFixture());
  });

  it("finishes a fixture job, publishes the primary view, and deletes private photos", async () => {
    const { processLocationEstablishingJob } = await import(
      "@/lib/print-books/locationEstablishingJobs"
    );

    await expect(
      processLocationEstablishingJob({
        jobId: "job-1",
        userId: "user-1",
        target: { kind: "location_fixture", fixtureId: "fixture-1" },
        photoRefs: ["tmp/location-establishing/user-1/job-1/fixture-1.png"],
      })
    ).resolves.toEqual({ jobId: "job-1", status: "ready" });

    const saved = fixtureStore.get("fixture-1")!;
    expect(saved.establishingImageUrl).toBe(
      "https://acct.blob.vercel-storage.com/location.jpg"
    );
    expect(saved.establishingImageStatus).toBe("ready");
    expect(saved.establishingImageJobId).toBeUndefined();
    expect(saved.views).toHaveLength(1);
    expect(saved.views?.[0]).toMatchObject({
      isPrimary: true,
      imageUrl: "https://acct.blob.vercel-storage.com/location.jpg",
    });
    expect(mockDeleteTemporaryPrivateAssets).toHaveBeenCalledWith([
      "tmp/location-establishing/user-1/job-1/fixture-1.png",
    ]);
  });

  it("does NOT overwrite a fixture claimed by a newer job (CAS loses)", async () => {
    // A newer upload changed the job id after this job was queued.
    fixtureStore.set(
      "fixture-1",
      makeFixture({ establishingImageJobId: "job-2" })
    );
    const { processLocationEstablishingJob } = await import(
      "@/lib/print-books/locationEstablishingJobs"
    );

    const result = await processLocationEstablishingJob({
      jobId: "job-1",
      userId: "user-1",
      target: { kind: "location_fixture", fixtureId: "fixture-1" },
      photoRefs: ["tmp/x.png"],
    });

    // Superseded before drawing: reported stale, newer job's state untouched.
    expect(result.status).toBe("stale");
    const saved = fixtureStore.get("fixture-1")!;
    expect(saved.establishingImageJobId).toBe("job-2");
    expect(saved.establishingImageUrl).toBeUndefined();
  });

  it("rethrows a transient failure so the scheduler retries, keeping photos", async () => {
    mockGenerateLocationEstablishingFromPhotos.mockRejectedValueOnce(
      new Error("network timeout while drawing")
    );
    const { processLocationEstablishingJob } = await import(
      "@/lib/print-books/locationEstablishingJobs"
    );

    await expect(
      processLocationEstablishingJob({
        jobId: "job-1",
        userId: "user-1",
        target: { kind: "location_fixture", fixtureId: "fixture-1" },
        photoRefs: ["tmp/keep.png"],
      })
    ).rejects.toThrow(/timeout/i);

    // Inputs are NOT deleted on a retryable failure.
    expect(mockDeleteTemporaryPrivateAssets).not.toHaveBeenCalled();
  });

  it("records terminal failure and cleans up on a non-retryable error", async () => {
    mockGenerateLocationEstablishingFromPhotos.mockRejectedValueOnce(
      new Error("content policy violation")
    );
    const { processLocationEstablishingJob } = await import(
      "@/lib/print-books/locationEstablishingJobs"
    );

    const result = await processLocationEstablishingJob({
      jobId: "job-1",
      userId: "user-1",
      target: { kind: "location_fixture", fixtureId: "fixture-1" },
      photoRefs: ["tmp/gone.png"],
    });

    expect(result.status).toBe("failed");
    expect(fixtureStore.get("fixture-1")!.establishingImageStatus).toBe(
      "failed"
    );
    expect(mockDeleteTemporaryPrivateAssets).toHaveBeenCalledWith(["tmp/gone.png"]);
  });

  it("adds a second perspective as an extra view while keeping the primary", async () => {
    fixtureStore.set(
      "fixture-1",
      makeFixture({
        establishingImageJobId: "job-2",
        establishingImageUrl: "https://acct.blob.vercel-storage.com/wide.jpg",
        views: [
          {
            id: "primary",
            label: "Wide",
            imageUrl: "https://acct.blob.vercel-storage.com/wide.jpg",
            isPrimary: true,
            status: "ready",
          },
        ],
      })
    );
    mockGenerateLocationEstablishingFromPhotos.mockResolvedValueOnce({
      establishingImageUrl: "https://acct.blob.vercel-storage.com/cot.jpg",
    });
    const { processLocationEstablishingJob } = await import(
      "@/lib/print-books/locationEstablishingJobs"
    );

    await processLocationEstablishingJob({
      jobId: "job-2",
      userId: "user-1",
      target: { kind: "location_fixture", fixtureId: "fixture-1" },
      photoRefs: ["tmp/cot.png"],
      viewId: "cot-corner",
      viewLabel: "Cot corner",
    });

    const saved = fixtureStore.get("fixture-1")!;
    expect(saved.views).toHaveLength(2);
    // Primary is unchanged; the new angle is a non-primary extra view.
    expect(saved.establishingImageUrl).toBe(
      "https://acct.blob.vercel-storage.com/wide.jpg"
    );
    const cot = saved.views?.find((v) => v.id === "cot-corner");
    expect(cot).toMatchObject({
      label: "Cot corner",
      imageUrl: "https://acct.blob.vercel-storage.com/cot.jpg",
      isPrimary: false,
    });
  });

  it("renders one perspective per photo when several are uploaded (fan-out)", async () => {
    // Each generate call returns a distinct URL so we can assert separate renders.
    let n = 0;
    mockGenerateLocationEstablishingFromPhotos.mockImplementation(async () => ({
      establishingImageUrl: `https://acct.blob.vercel-storage.com/render-${++n}.jpg`,
    }));
    fixtureStore.set(
      "fixture-1",
      makeFixture({ establishingImageJobId: "job-fan", views: [] })
    );

    const { processLocationEstablishingJob } = await import(
      "@/lib/print-books/locationEstablishingJobs"
    );
    const result = await processLocationEstablishingJob({
      jobId: "job-fan",
      userId: "user-1",
      target: { kind: "location_fixture", fixtureId: "fixture-1" },
      photoRefs: ["ref-a", "ref-b", "ref-c"],
    });

    expect(result.status).toBe("ready");
    // Three photos → three separate renders, not one merged image.
    expect(mockGenerateLocationEstablishingFromPhotos).toHaveBeenCalledTimes(3);

    const saved = fixtureStore.get("fixture-1")!;
    expect(saved.views).toHaveLength(3);
    const urls = saved.views?.map((v) => v.imageUrl).sort();
    expect(urls).toEqual([
      "https://acct.blob.vercel-storage.com/render-1.jpg",
      "https://acct.blob.vercel-storage.com/render-2.jpg",
      "https://acct.blob.vercel-storage.com/render-3.jpg",
    ]);
    // Exactly one primary, and it drives the book anchor.
    expect(saved.views?.filter((v) => v.isPrimary)).toHaveLength(1);
    expect(saved.establishingImageUrl).toBe(saved.views?.[0].imageUrl);
  });

  it("keeps successful angles when one photo fails to render", async () => {
    let n = 0;
    mockGenerateLocationEstablishingFromPhotos.mockImplementation(async () => {
      n += 1;
      if (n === 2) throw new Error("content policy violation");
      return {
        establishingImageUrl: `https://acct.blob.vercel-storage.com/ok-${n}.jpg`,
      };
    });
    fixtureStore.set(
      "fixture-1",
      makeFixture({ establishingImageJobId: "job-partial", views: [] })
    );

    const { processLocationEstablishingJob } = await import(
      "@/lib/print-books/locationEstablishingJobs"
    );
    const result = await processLocationEstablishingJob({
      jobId: "job-partial",
      userId: "user-1",
      target: { kind: "location_fixture", fixtureId: "fixture-1" },
      photoRefs: ["ref-a", "ref-b"],
    });

    expect(result.status).toBe("ready");
    const saved = fixtureStore.get("fixture-1")!;
    expect(saved.views).toHaveLength(2);
    expect(saved.views?.filter((v) => v.status === "ready")).toHaveLength(1);
    expect(saved.views?.filter((v) => v.status === "failed")).toHaveLength(1);
  });
});
