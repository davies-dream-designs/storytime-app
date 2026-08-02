import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import type { ChildProfile, StoryPerson } from "@/types";

const {
  mockAuth,
  mockCreateChildProfileAvatar,
  mockCreateStoryPersonAvatar,
  mockDb,
} = vi.hoisted(() => ({
  mockAuth: vi.fn(async () => ({ userId: "user-1" })),
  mockCreateChildProfileAvatar: vi.fn(),
  mockCreateStoryPersonAvatar: vi.fn(),
  mockDb: {
    profiles: {
      getByUserId: vi.fn(),
      getById: vi.fn(),
      update: vi.fn(),
    },
    storyPeople: {
      getByUserId: vi.fn(),
      getByProfileId: vi.fn(),
      getById: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
    },
  },
}));

vi.mock("@clerk/nextjs/server", () => ({
  auth: mockAuth,
}));

vi.mock("@/lib/db", () => ({
  db: mockDb,
}));

vi.mock("@/lib/storyPeopleAvatars", () => ({
  createChildProfileAvatar: mockCreateChildProfileAvatar,
  createStoryPersonAvatar: mockCreateStoryPersonAvatar,
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
    mockDb.profiles.getById.mockResolvedValue(undefined);
    mockDb.profiles.update.mockResolvedValue(undefined);
    mockDb.storyPeople.create.mockResolvedValue(undefined);
    mockDb.storyPeople.getById.mockResolvedValue(undefined);
    mockDb.storyPeople.update.mockResolvedValue(undefined);
    mockDb.storyPeople.getByUserId.mockResolvedValue([]);
    mockDb.storyPeople.getByProfileId.mockResolvedValue([]);
    mockCreateChildProfileAvatar.mockResolvedValue({
      avatarImageUrl: "https://assets.example.com/child-avatar.jpg",
      appearanceSummary: "Warm child storybook reference.",
      consistencyNote: "Soft curls and a bright smile.",
    });
    mockCreateStoryPersonAvatar.mockResolvedValue({
      avatarImageUrl: "https://assets.example.com/avatar.jpg",
      appearance: "Dark curls and a warm smile.",
      appearanceSummary: "Warm storybook reference.",
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
        profileIds: ["profile-1", "other-user-profile"],
        availableToAllProfiles: false,
      }),
    });

    const res = await POST(req);
    expect(res.status).toBe(201);
    const body = (await res.json()) as StoryPerson;
    expect(body.relationship).toBe("grandparent");
    expect(body.profileIds).toEqual(["profile-1"]);
    expect(mockDb.storyPeople.create).toHaveBeenCalledWith(
      expect.objectContaining({
        name: "Nanna",
        profileIds: ["profile-1"],
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

  it("creates an illustrated reference from a photo for an owned story person", async () => {
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
    mockDb.storyPeople.update.mockResolvedValue({
      ...person,
      avatarImageUrl: "https://assets.example.com/avatar.jpg",
      appearanceSummary: "Warm storybook reference.",
    });

    const { POST } = await import("@/app/api/story-people/[id]/avatar/route");
    const form = new FormData();
    form.append("photo", new File(["fake"], "mum.jpg", { type: "image/jpeg" }));
    form.append("photoConsent", "yes");
    const req = {
      formData: async () => form,
    } as NextRequest;

    const res = await POST(req, {
      params: Promise.resolve({ id: "person-1" }),
    });

    expect(res.status).toBe(200);
    expect(mockCreateStoryPersonAvatar).toHaveBeenCalledWith({
      person,
      file: expect.any(File),
    });
    expect(mockDb.storyPeople.update).toHaveBeenCalledWith("person-1", {
      avatarImageUrl: "https://assets.example.com/avatar.jpg",
      appearance: "Dark curls and a warm smile.",
      appearanceSummary: "Warm storybook reference.",
    });
  });

  it("creates an illustrated child profile reference from an owned profile photo", async () => {
    const profile: ChildProfile = {
      ...profiles[0],
      appearance: {
        hairStyles: [],
        featureEmphasis: [],
        distinguishingFeatures: [],
        expressionVibes: [],
      },
    };
    mockDb.profiles.getById.mockResolvedValue(profile);
    mockDb.profiles.update.mockResolvedValue({
      ...profile,
      avatarImageUrl: "https://assets.example.com/child-avatar.jpg",
      appearanceSummary: "Warm child storybook reference.",
      appearance: {
        ...profile.appearance,
        consistencyNote: "Soft curls and a bright smile.",
      },
    });

    const { POST } = await import("@/app/api/profiles/[id]/avatar/route");
    const form = new FormData();
    form.append(
      "photo",
      new File(["fake"], "mila.jpg", { type: "image/jpeg" })
    );
    form.append("photoConsent", "yes");
    const req = {
      formData: async () => form,
    } as NextRequest;

    const res = await POST(req, {
      params: Promise.resolve({ id: "profile-1" }),
    });

    expect(res.status).toBe(200);
    expect(mockCreateChildProfileAvatar).toHaveBeenCalledWith({
      profile,
      file: expect.any(File),
    });
    expect(mockDb.profiles.update).toHaveBeenCalledWith("profile-1", {
      avatarImageUrl: "https://assets.example.com/child-avatar.jpg",
      appearanceSummary: "Warm child storybook reference.",
      appearance: {
        hairStyles: [],
        featureEmphasis: [],
        distinguishingFeatures: [],
        expressionVibes: [],
        consistencyNote: "Soft curls and a bright smile.",
      },
    });
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
      formData: async () => form,
    } as NextRequest;

    const res = await POST(req, {
      params: Promise.resolve({ id: "person-1" }),
    });

    expect(res.status).toBe(400);
    expect(mockCreateStoryPersonAvatar).not.toHaveBeenCalled();
  });
});
