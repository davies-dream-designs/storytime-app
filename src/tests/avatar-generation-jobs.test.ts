import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ChildProfile, StoryPerson } from "@/types";

const {
  mockInngestSend,
  mockAssertReferenceRedoAffordable,
  mockChargeReferenceRedoCredit,
  mockCreateChildProfileAvatar,
  mockCreateChildProfileAvatarFromDescription,
  mockCreateStoryPersonAvatar,
  mockCreateStoryPersonAvatarFromDescription,
  mockRedoChildProfileAvatar,
  mockRedoStoryPersonAvatar,
  mockStoreBookAsset,
  mockDeleteBookAssetUrls,
  mockLogEvent,
  mockDb,
} = vi.hoisted(() => ({
  mockInngestSend: vi.fn(async () => {}),
  mockAssertReferenceRedoAffordable: vi.fn(async () => {}),
  mockChargeReferenceRedoCredit: vi.fn(async () => ({ credits: 2, isAdmin: false, charged: true })),
  mockCreateChildProfileAvatar: vi.fn(),
  mockCreateChildProfileAvatarFromDescription: vi.fn(),
  mockCreateStoryPersonAvatar: vi.fn(),
  mockCreateStoryPersonAvatarFromDescription: vi.fn(),
  mockRedoChildProfileAvatar: vi.fn(),
  mockRedoStoryPersonAvatar: vi.fn(),
  mockStoreBookAsset: vi.fn(async () => "data:image/png;base64,AAAA"),
  mockDeleteBookAssetUrls: vi.fn(async () => 1),
  mockLogEvent: vi.fn(async () => {}),
  mockDb: {
    profiles: {
      getById: vi.fn(),
      countAvatarReferencesByUserId: vi.fn(async () => 0),
      markAvatarGeneration: vi.fn(),
      markAvatarGenerationIfCurrent: vi.fn(),
      completeAvatarGenerationIfCurrent: vi.fn(),
    },
    storyPeople: {
      getById: vi.fn(),
      countAvatarReferencesByUserId: vi.fn(async () => 0),
      markAvatarGeneration: vi.fn(),
      markAvatarGenerationIfCurrent: vi.fn(),
      completeAvatarGenerationIfCurrent: vi.fn(),
    },
  },
}));

vi.mock("@/lib/inngest/client", () => ({
  inngest: { send: mockInngestSend },
  INNGEST_EVENTS: { avatarGenerationRequested: "storycot/avatar.generation.requested" },
}));

vi.mock("@/lib/credits", () => ({
  assertReferenceRedoAffordable: mockAssertReferenceRedoAffordable,
  chargeReferenceRedoCredit: mockChargeReferenceRedoCredit,
}));

vi.mock("@/lib/storyPeopleAvatars", () => ({
  createChildProfileAvatar: mockCreateChildProfileAvatar,
  createChildProfileAvatarFromDescription: mockCreateChildProfileAvatarFromDescription,
  createStoryPersonAvatar: mockCreateStoryPersonAvatar,
  createStoryPersonAvatarFromDescription: mockCreateStoryPersonAvatarFromDescription,
  redoChildProfileAvatar: mockRedoChildProfileAvatar,
  redoStoryPersonAvatar: mockRedoStoryPersonAvatar,
}));

vi.mock("@/lib/print-books/storage", () => ({
  storeBookAsset: mockStoreBookAsset,
  deleteBookAssetUrls: mockDeleteBookAssetUrls,
}));

vi.mock("@/lib/logEvent", () => ({
  logEvent: mockLogEvent,
}));

vi.mock("@/lib/db", () => ({ db: mockDb }));

function makeProfile(overrides?: Partial<ChildProfile>): ChildProfile {
  return {
    id: "profile-1",
    userId: "user-1",
    name: "Mila",
    age: 4,
    favouriteCharacters: [],
    favouriteActivities: [],
    favouriteAnimals: [],
    favouritePlaces: [],
    lessons: [],
    createdAt: "2026-07-15T00:00:00.000Z",
    ...overrides,
  };
}

function makePerson(overrides?: Partial<StoryPerson>): StoryPerson {
  return {
    id: "person-1",
    userId: "user-1",
    name: "Mum",
    relationship: "mum",
    description: "",
    personality: "",
    appearance: "",
    availableToAllProfiles: true,
    profileIds: [],
    createdAt: "2026-07-15T00:00:00.000Z",
    updatedAt: "2026-07-15T00:00:00.000Z",
    ...overrides,
  };
}

describe("enqueueChildProfileAvatarGeneration", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    mockDb.profiles.markAvatarGeneration.mockResolvedValue(makeProfile());
    mockDb.profiles.markAvatarGenerationIfCurrent.mockResolvedValue(makeProfile());
    mockDb.profiles.completeAvatarGenerationIfCurrent.mockResolvedValue(makeProfile());
    mockDb.storyPeople.markAvatarGeneration.mockResolvedValue(makePerson());
    mockDb.storyPeople.markAvatarGenerationIfCurrent.mockResolvedValue(makePerson());
    mockDb.storyPeople.completeAvatarGenerationIfCurrent.mockResolvedValue(makePerson());
  });

  it("enqueues a description avatar job and returns queued status", async () => {
    const { enqueueChildProfileAvatarGeneration } = await import("@/lib/avatarGenerationJobs");
    const profile = makeProfile();
    const result = await enqueueChildProfileAvatarGeneration({
      profile,
      source: "description",
    });
    expect(result.status).toBe("queued");
    expect(result.existing).toBe(false);
    expect(mockInngestSend).toHaveBeenCalledWith(
      expect.objectContaining({ name: "storycot/avatar.generation.requested" })
    );
    expect(mockAssertReferenceRedoAffordable).not.toHaveBeenCalled();
  });

  it("checks affordability for redo before enqueueing", async () => {
    const { enqueueChildProfileAvatarGeneration } = await import("@/lib/avatarGenerationJobs");
    const profile = makeProfile({ avatarImageUrl: "https://example.com/old.jpg" });
    await enqueueChildProfileAvatarGeneration({
      profile,
      source: "redo",
      adjustment: "remove the label",
    });
    expect(mockAssertReferenceRedoAffordable).toHaveBeenCalledWith("user-1");
  });

  it("returns existing=true when a queued job already exists for the target", async () => {
    const { enqueueChildProfileAvatarGeneration } = await import("@/lib/avatarGenerationJobs");
    const profile = makeProfile({
      avatarGenerationStatus: "queued",
      avatarGenerationJobId: "existing-job-id",
      avatarGenerationAttemptKey: "existing-key",
    });
    const result = await enqueueChildProfileAvatarGeneration({
      profile,
      source: "description",
      attemptKey: "new-key",
    });
    expect(result.existing).toBe(true);
    expect(result.jobId).toBe("existing-job-id");
    expect(mockInngestSend).not.toHaveBeenCalled();
  });

  it("throws if redo adjustment is empty", async () => {
    const { enqueueChildProfileAvatarGeneration } = await import("@/lib/avatarGenerationJobs");
    const profile = makeProfile({ avatarImageUrl: "https://example.com/avatar.jpg" });
    await expect(
      enqueueChildProfileAvatarGeneration({ profile, source: "redo", adjustment: "" })
    ).rejects.toThrow(/what should change/i);
  });
});

describe("processAvatarGenerationJob — profile", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    mockDb.profiles.getById.mockResolvedValue(
      makeProfile({ avatarGenerationJobId: "job-1" })
    );
    mockDb.profiles.markAvatarGenerationIfCurrent.mockResolvedValue(
      makeProfile({ avatarGenerationStatus: "running", avatarGenerationJobId: "job-1" })
    );
    mockDb.profiles.completeAvatarGenerationIfCurrent.mockResolvedValue(
      makeProfile({ avatarImageUrl: "https://blob.example/new.jpg", avatarGenerationStatus: "ready" })
    );
    mockCreateChildProfileAvatarFromDescription.mockResolvedValue({
      avatarImageUrl: "https://blob.example/new.jpg",
      appearanceSummary: "A reference.",
      consistencyNote: undefined,
    });
  });

  it("marks profile ready and charges after successful generation", async () => {
    const { processAvatarGenerationJob } = await import("@/lib/avatarGenerationJobs");
    const result = await processAvatarGenerationJob({
      jobId: "job-1",
      userId: "user-1",
      target: { kind: "profile", id: "profile-1" },
      source: "description",
      adjustment: "",
      attemptKey: "key-1",
      shouldCharge: true,
    });
    expect(result.status).toBe("ready");
    expect(mockDb.profiles.completeAvatarGenerationIfCurrent).toHaveBeenCalled();
    expect(mockChargeReferenceRedoCredit).toHaveBeenCalledWith("user-1");
  });

  it("does not charge when shouldCharge is false", async () => {
    const { processAvatarGenerationJob } = await import("@/lib/avatarGenerationJobs");
    await processAvatarGenerationJob({
      jobId: "job-1",
      userId: "user-1",
      target: { kind: "profile", id: "profile-1" },
      source: "description",
      adjustment: "",
      attemptKey: "key-1",
      shouldCharge: false,
    });
    expect(mockChargeReferenceRedoCredit).not.toHaveBeenCalled();
  });

  it("returns stale when commit fails because a newer attempt won", async () => {
    mockDb.profiles.completeAvatarGenerationIfCurrent.mockResolvedValue(undefined);
    const { processAvatarGenerationJob } = await import("@/lib/avatarGenerationJobs");
    const result = await processAvatarGenerationJob({
      jobId: "job-1",
      userId: "user-1",
      target: { kind: "profile", id: "profile-1" },
      source: "description",
      adjustment: "",
      attemptKey: "key-1",
      shouldCharge: false,
    });
    expect(result.status).toBe("stale");
    expect(mockChargeReferenceRedoCredit).not.toHaveBeenCalled();
  });

  it("marks failed and does not charge when image generation throws", async () => {
    mockCreateChildProfileAvatarFromDescription.mockRejectedValue(
      new Error("provider timeout")
    );
    mockDb.profiles.markAvatarGenerationIfCurrent.mockResolvedValue(undefined);
    const { processAvatarGenerationJob } = await import("@/lib/avatarGenerationJobs");
    const result = await processAvatarGenerationJob({
      jobId: "job-1",
      userId: "user-1",
      target: { kind: "profile", id: "profile-1" },
      source: "description",
      adjustment: "",
      attemptKey: "key-1",
      shouldCharge: true,
    });
    expect(result.status).toBe("failed");
    expect(mockChargeReferenceRedoCredit).not.toHaveBeenCalled();
    expect(mockLogEvent).toHaveBeenCalled();
  });

  it("deletes old blob only after commit, not before", async () => {
    const oldUrl = "https://blob.example/old.jpg";
    mockDb.profiles.getById.mockResolvedValue(
      makeProfile({ avatarImageUrl: oldUrl, avatarGenerationJobId: "job-1" })
    );
    const { processAvatarGenerationJob } = await import("@/lib/avatarGenerationJobs");
    await processAvatarGenerationJob({
      jobId: "job-1",
      userId: "user-1",
      target: { kind: "profile", id: "profile-1" },
      source: "description",
      adjustment: "",
      attemptKey: "key-1",
      shouldCharge: false,
    });
    const callOrder = [
      mockDb.profiles.completeAvatarGenerationIfCurrent.mock.invocationCallOrder[0],
      mockDeleteBookAssetUrls.mock.invocationCallOrder[0],
    ];
    expect(callOrder[1]).toBeGreaterThan(callOrder[0]!);
  });
});

describe("processAvatarGenerationJob — story person", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    mockDb.storyPeople.getById.mockResolvedValue(
      makePerson({ avatarGenerationJobId: "job-2" })
    );
    mockDb.storyPeople.markAvatarGenerationIfCurrent.mockResolvedValue(
      makePerson({ avatarGenerationStatus: "running", avatarGenerationJobId: "job-2" })
    );
    mockDb.storyPeople.completeAvatarGenerationIfCurrent.mockResolvedValue(
      makePerson({ avatarImageUrl: "https://blob.example/person-new.jpg", avatarGenerationStatus: "ready" })
    );
    mockRedoStoryPersonAvatar.mockResolvedValue({
      avatarImageUrl: "https://blob.example/person-new.jpg",
      appearance: "Dark curls.",
      appearanceSummary: "A reference.",
    });
  });

  it("processes redo job and charges after commit", async () => {
    const { processAvatarGenerationJob } = await import("@/lib/avatarGenerationJobs");
    const result = await processAvatarGenerationJob({
      jobId: "job-2",
      userId: "user-1",
      target: { kind: "story_person", id: "person-1" },
      source: "redo",
      adjustment: "remove the label",
      attemptKey: "key-2",
      shouldCharge: true,
    });
    expect(result.status).toBe("ready");
    expect(mockRedoStoryPersonAvatar).toHaveBeenCalledWith({
      person: expect.objectContaining({ id: "person-1" }),
      adjustment: "remove the label",
    });
    expect(mockChargeReferenceRedoCredit).toHaveBeenCalledWith("user-1");
  });
});
