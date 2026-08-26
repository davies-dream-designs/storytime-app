import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import type { ChildProfile, StoryPerson } from "@/types";

const {
  mockAuth,
  mockEnqueueChildProfileAvatarGeneration,
  mockEnqueueStoryPersonAvatarGeneration,
  mockDb,
  mockLogEvent,
} = vi.hoisted(() => ({
  mockAuth: vi.fn(async () => ({ userId: "user-1" })),
  mockEnqueueChildProfileAvatarGeneration: vi.fn(),
  mockEnqueueStoryPersonAvatarGeneration: vi.fn(),
  mockLogEvent: vi.fn(),
  mockDb: {
    profiles: {
      getByUserId: vi.fn(),
      countAvatarReferencesByUserId: vi.fn(),
      getById: vi.fn(),
      update: vi.fn(),
      markAvatarGeneration: vi.fn(),
      markAvatarGenerationIfCurrent: vi.fn(),
      completeAvatarGenerationIfCurrent: vi.fn(),
    },
    storyPeople: {
      getByUserId: vi.fn(),
      countAvatarReferencesByUserId: vi.fn(),
      getByProfileId: vi.fn(),
      getById: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      markAvatarGeneration: vi.fn(),
      markAvatarGenerationIfCurrent: vi.fn(),
      completeAvatarGenerationIfCurrent: vi.fn(),
    },
  },
}));

vi.mock("@clerk/nextjs/server", () => ({
  auth: mockAuth,
}));

vi.mock("@/lib/db", () => ({
  db: mockDb,
}));

vi.mock("@/lib/avatarGenerationJobs", () => ({
  enqueueChildProfileAvatarGeneration: mockEnqueueChildProfileAvatarGeneration,
  enqueueStoryPersonAvatarGeneration: mockEnqueueStoryPersonAvatarGeneration,
}));

vi.mock("@/lib/logEvent", () => ({
  logEvent: mockLogEvent,
}));

const profiles: ChildProfile[] = [
  {
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
  },
];

describe("/api/story-people", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    mockAuth.mockResolvedValue({ userId: "user-1" });
    mockDb.profiles.getByUserId.mockResolvedValue(profiles);
    mockDb.profiles.countAvatarReferencesByUserId.mockResolvedValue(0);
    mockDb.profiles.getById.mockResolvedValue(undefined);
    mockDb.profiles.update.mockResolvedValue(undefined);
    mockDb.storyPeople.create.mockResolvedValue(undefined);
    mockDb.storyPeople.getById.mockResolvedValue(undefined);
    mockDb.storyPeople.update.mockResolvedValue(undefined);
    mockDb.storyPeople.getByUserId.mockResolvedValue([]);
    mockDb.storyPeople.countAvatarReferencesByUserId.mockResolvedValue(0);
    mockDb.storyPeople.getByProfileId.mockResolvedValue([]);
    mockLogEvent.mockResolvedValue(undefined);
    mockEnqueueChildProfileAvatarGeneration.mockResolvedValue({
      jobId: "job-1",
      status: "queued",
      attemptKey: "key-1",
      existing: false,
    });
    mockEnqueueStoryPersonAvatarGeneration.mockResolvedValue({
      jobId: "job-2",
      status: "queued",
      attemptKey: "key-2",
      existing: false,
    });
  });

  it("creates a reusable story person linked only to owned profiles", async () => {
    const { POST } = await import("@/app/api/story-people/route");
    const req = new NextRequest("http://localhost/api/story-people", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: "Nanna",
        relationship: "grandparent",
        bodyBuild: "large",
        ageGroup: "older_adult",
        height: "short",
        profileIds: ["profile-1", "other-user-profile"],
        availableToAllProfiles: false,
      }),
    });

    const res = await POST(req);
    expect(res.status).toBe(201);
    const body = (await res.json()) as StoryPerson;
    expect(body.relationship).toBe("grandparent");
    expect(body.bodyBuild).toBe("large");
    expect(body.ageGroup).toBe("older_adult");
    expect(body.height).toBe("short");
    expect(body.profileIds).toEqual(["profile-1"]);
    expect(mockDb.storyPeople.create).toHaveBeenCalledWith(
      expect.objectContaining({
        name: "Nanna",
        bodyBuild: "large",
        ageGroup: "older_adult",
        height: "short",
        profileIds: ["profile-1"],
      })
    );
  });

  it("preserves and updates physical context labels on story people", async () => {
    const person: StoryPerson = {
      id: "person-1",
      userId: "user-1",
      name: "Grandad",
      relationship: "grandparent",
      bodyBuild: "large",
      ageGroup: "adult",
      height: "average",
      description: "",
      personality: "",
      appearance: "",
      availableToAllProfiles: true,
      profileIds: [],
      createdAt: "2026-07-15T00:00:00.000Z",
      updatedAt: "2026-07-15T00:00:00.000Z",
    };
    mockDb.storyPeople.getById.mockResolvedValue(person);
    mockDb.storyPeople.update.mockResolvedValue({
      ...person,
      bodyBuild: "very_large",
      ageGroup: "older_adult",
      height: "tall",
    });

    const { PUT } = await import("@/app/api/story-people/[id]/route");
    const req = new NextRequest("http://localhost/api/story-people/person-1", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        bodyBuild: "very_large",
        ageGroup: "older_adult",
        height: "tall",
      }),
    });

    const res = await PUT(req, {
      params: Promise.resolve({ id: "person-1" }),
    });

    expect(res.status).toBe(200);
    expect(mockDb.storyPeople.update).toHaveBeenCalledWith(
      "person-1",
      expect.objectContaining({
        bodyBuild: "very_large",
        ageGroup: "older_adult",
        height: "tall",
      })
    );
  });

  it("stores custom relationship labels for other relationships", async () => {
    const { POST } = await import("@/app/api/story-people/route");
    const req = new NextRequest("http://localhost/api/story-people", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: "Ava",
        relationship: "other",
        customRelationship: "Godmother",
        availableToAllProfiles: true,
      }),
    });

    const res = await POST(req);
    expect(res.status).toBe(201);
    const body = (await res.json()) as StoryPerson;
    expect(body.relationship).toBe("other");
    expect(body.customRelationship).toBe("Godmother");
    expect(mockDb.storyPeople.create).toHaveBeenCalledWith(
      expect.objectContaining({
        relationship: "other",
        customRelationship: "Godmother",
      })
    );
  });

  it("clears custom relationship labels when changing away from other", async () => {
    const person: StoryPerson = {
      id: "person-1",
      userId: "user-1",
      name: "Ava",
      relationship: "other",
      customRelationship: "Godmother",
      description: "",
      personality: "",
      appearance: "",
      availableToAllProfiles: true,
      profileIds: [],
      createdAt: "2026-07-15T00:00:00.000Z",
      updatedAt: "2026-07-15T00:00:00.000Z",
    };
    mockDb.storyPeople.getById.mockResolvedValue(person);
    mockDb.storyPeople.update.mockResolvedValue({
      ...person,
      relationship: "auntie",
      customRelationship: undefined,
    });

    const { PUT } = await import("@/app/api/story-people/[id]/route");
    const req = new NextRequest("http://localhost/api/story-people/person-1", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        relationship: "auntie",
      }),
    });

    const res = await PUT(req, {
      params: Promise.resolve({ id: "person-1" }),
    });
    expect(res.status).toBe(200);
    expect(mockDb.storyPeople.update).toHaveBeenCalledWith(
      "person-1",
      expect.objectContaining({
        relationship: "auntie",
        customRelationship: undefined,
      })
    );
  });

  it("rejects a child-limited person without a valid owned profile", async () => {
    const { POST } = await import("@/app/api/story-people/route");
    const req = new NextRequest("http://localhost/api/story-people", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: "Nanna",
        profileIds: ["other-user-profile"],
        availableToAllProfiles: false,
      }),
    });

    const res = await POST(req);
    expect(res.status).toBe(400);
    expect(mockDb.storyPeople.create).not.toHaveBeenCalled();
  });

  it("returns profile-specific people when profileId is supplied", async () => {
    const { GET } = await import("@/app/api/story-people/route");
    const req = new NextRequest(
      "http://localhost/api/story-people?profileId=profile-1"
    );

    await GET(req);

    expect(mockDb.storyPeople.getByProfileId).toHaveBeenCalledWith(
      "profile-1",
      "user-1"
    );
  });

  it("enqueues a photo avatar job for an owned story person and returns 202", async () => {
    const person: StoryPerson = {
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
    };
    mockDb.storyPeople.getById.mockResolvedValue(person);

    const { POST } = await import("@/app/api/story-people/[id]/avatar/route");
    const form = new FormData();
    form.append("photo", new File(["fake"], "mum.jpg", { type: "image/jpeg" }));
    form.append("photoConsent", "yes");
    const req = {
      headers: { get: () => null },
      formData: async () => form,
    } as unknown as NextRequest;

    const res = await POST(req, { params: Promise.resolve({ id: "person-1" }) });
    expect(res.status).toBe(202);
    const body = await res.json();
    expect(body.jobId).toBe("job-2");
    expect(body.status).toBe("queued");
    expect(mockEnqueueStoryPersonAvatarGeneration).toHaveBeenCalledWith(
      expect.objectContaining({ person, source: "photo" })
    );
  });

  it("enqueues a description avatar job for a story person and returns 202", async () => {
    const person: StoryPerson = {
      id: "person-1",
      userId: "user-1",
      name: "Grandma",
      relationship: "grandparent",
      description: "Kind bedtime helper",
      personality: "gentle",
      appearance: "Short grey hair.",
      availableToAllProfiles: true,
      profileIds: [],
      createdAt: "2026-07-15T00:00:00.000Z",
      updatedAt: "2026-07-15T00:00:00.000Z",
    };
    mockDb.storyPeople.getById.mockResolvedValue(person);

    const { POST } = await import("@/app/api/story-people/[id]/avatar/route");
    const req = new NextRequest("http://localhost/api/story-people/person-1/avatar", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ source: "description" }),
    });

    const res = await POST(req, { params: Promise.resolve({ id: "person-1" }) });
    expect(res.status).toBe(202);
    const body = await res.json();
    expect(body.jobId).toBe("job-2");
    expect(mockEnqueueStoryPersonAvatarGeneration).toHaveBeenCalledWith(
      expect.objectContaining({ person, source: "description" })
    );
  });

  it("returns 200 when an identical queued job already exists (idempotent)", async () => {
    const person: StoryPerson = {
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
    };
    mockDb.storyPeople.getById.mockResolvedValue(person);
    mockEnqueueStoryPersonAvatarGeneration.mockResolvedValue({
      jobId: "existing-job",
      status: "queued",
      attemptKey: "key-x",
      existing: true,
    });

    const { POST } = await import("@/app/api/story-people/[id]/avatar/route");
    const req = new NextRequest("http://localhost/api/story-people/person-1/avatar", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ source: "description" }),
    });

    const res = await POST(req, { params: Promise.resolve({ id: "person-1" }) });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.existing).toBe(true);
  });

  it("enqueues a photo avatar job for a child profile and returns 202", async () => {
    const profile: ChildProfile = { ...profiles[0] };
    mockDb.profiles.getById.mockResolvedValue(profile);

    const { POST } = await import("@/app/api/profiles/[id]/avatar/route");
    const form = new FormData();
    form.append("photo", new File(["fake"], "mila.jpg", { type: "image/jpeg" }));
    form.append("photoConsent", "yes");
    const req = {
      headers: { get: () => null },
      formData: async () => form,
    } as unknown as NextRequest;

    const res = await POST(req, { params: Promise.resolve({ id: "profile-1" }) });
    expect(res.status).toBe(202);
    const body = await res.json();
    expect(body.jobId).toBe("job-1");
    expect(mockEnqueueChildProfileAvatarGeneration).toHaveBeenCalledWith(
      expect.objectContaining({ profile, source: "photo" })
    );
  });

  it("enqueues a redo avatar job for a child profile and returns 202", async () => {
    const profile: ChildProfile = {
      ...profiles[0],
      avatarImageUrl: "https://example.com/old.jpg",
    };
    mockDb.profiles.getById.mockResolvedValue(profile);

    const { POST } = await import("@/app/api/profiles/[id]/avatar/route");
    const req = new NextRequest("http://localhost/api/profiles/profile-1/avatar", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ adjustment: "remove the label" }),
    });

    const res = await POST(req, { params: Promise.resolve({ id: "profile-1" }) });
    expect(res.status).toBe(202);
    expect(mockEnqueueChildProfileAvatarGeneration).toHaveBeenCalledWith(
      expect.objectContaining({ source: "redo", adjustment: "remove the label" })
    );
  });

  it("returns 402 when affordability check throws for a story person redo", async () => {
    const person: StoryPerson = {
      id: "person-1",
      userId: "user-1",
      name: "Mum",
      relationship: "mum",
      description: "",
      personality: "",
      appearance: "",
      avatarImageUrl: "https://example.com/old.jpg",
      availableToAllProfiles: true,
      profileIds: [],
      createdAt: "2026-07-15T00:00:00.000Z",
      updatedAt: "2026-07-15T00:00:00.000Z",
    };
    mockDb.storyPeople.getById.mockResolvedValue(person);
    mockEnqueueStoryPersonAvatarGeneration.mockRejectedValue(
      new Error("Insufficient credits. Creating or redoing an illustrated reference costs 1 credit.")
    );

    const { POST } = await import("@/app/api/story-people/[id]/avatar/route");
    const req = new NextRequest("http://localhost/api/story-people/person-1/avatar", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ adjustment: "less broad" }),
    });

    const res = await POST(req, { params: Promise.resolve({ id: "person-1" }) });
    expect(res.status).toBe(402);
  });

  it("requires photo permission before creating a story person reference", async () => {
    const person: StoryPerson = {
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
    };
    mockDb.storyPeople.getById.mockResolvedValue(person);

    const { POST } = await import("@/app/api/story-people/[id]/avatar/route");
    const form = new FormData();
    form.append("photo", new File(["fake"], "mum.jpg", { type: "image/jpeg" }));
    const req = {
      headers: { get: () => null },
      formData: async () => form,
    } as unknown as NextRequest;

    const res = await POST(req, {
      params: Promise.resolve({ id: "person-1" }),
    });

    expect(res.status).toBe(400);
    expect(mockEnqueueStoryPersonAvatarGeneration).not.toHaveBeenCalled();
  });
});
