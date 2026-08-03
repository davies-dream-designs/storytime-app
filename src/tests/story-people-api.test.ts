import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import type { ChildProfile, StoryPerson } from "@/types";

const {
  mockAuth,
  mockChargeReferenceRedoCredit,
  mockCreateChildProfileAvatar,
  mockCreateStoryPersonAvatar,
  mockDb,
  mockRefundReferenceRedoCredit,
  mockRedoChildProfileAvatar,
  mockRedoStoryPersonAvatar,
} = vi.hoisted(() => ({
  mockAuth: vi.fn(async () => ({ userId: "user-1" })),
  mockChargeReferenceRedoCredit: vi.fn(),
  mockCreateChildProfileAvatar: vi.fn(),
  mockCreateStoryPersonAvatar: vi.fn(),
  mockRefundReferenceRedoCredit: vi.fn(),
  mockRedoChildProfileAvatar: vi.fn(),
  mockRedoStoryPersonAvatar: vi.fn(),
  mockDb: {
    profiles: {
      getByUserId: vi.fn(),
      countAvatarReferencesByUserId: vi.fn(),
      getById: vi.fn(),
      update: vi.fn(),
    },
    storyPeople: {
      getByUserId: vi.fn(),
      countAvatarReferencesByUserId: vi.fn(),
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
  redoChildProfileAvatar: mockRedoChildProfileAvatar,
  redoStoryPersonAvatar: mockRedoStoryPersonAvatar,
}));

vi.mock("@/lib/credits", () => ({
  chargeReferenceRedoCredit: mockChargeReferenceRedoCredit,
  refundReferenceRedoCredit: mockRefundReferenceRedoCredit,
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
    mockChargeReferenceRedoCredit.mockResolvedValue({
      credits: 2,
      isAdmin: false,
      charged: true,
    });
    mockRefundReferenceRedoCredit.mockResolvedValue(undefined);
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
    mockRedoChildProfileAvatar.mockResolvedValue({
      avatarImageUrl: "https://assets.example.com/child-redo.jpg",
      appearanceSummary: "Adjusted child reference.",
      consistencyNote: "Remove text labels.",
    });
    mockRedoStoryPersonAvatar.mockResolvedValue({
      avatarImageUrl: "https://assets.example.com/redo.jpg",
      appearance: "Dark curls and a warm smile.",
      appearanceSummary: "Adjusted storybook reference.",
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
      adjustment: "",
    });
    expect(mockChargeReferenceRedoCredit).not.toHaveBeenCalled();
    expect(mockDb.storyPeople.update).toHaveBeenCalledWith("person-1", {
      avatarImageUrl: "https://assets.example.com/avatar.jpg",
      appearance: "Dark curls and a warm smile.",
      appearanceSummary: "Warm storybook reference.",
    });
  });

  it("charges one credit when redoing an existing story person reference", async () => {
    const person: StoryPerson = {
      id: "person-1",
      userId: "user-1",
      name: "Mum",
      relationship: "mum",
      description: "",
      personality: "",
      appearance: "",
      avatarImageUrl: "https://assets.example.com/old-avatar.jpg",
      availableToAllProfiles: true,
      profileIds: [],
      createdAt: "2026-07-15T00:00:00.000Z",
      updatedAt: "2026-07-15T00:00:00.000Z",
    };
    mockDb.storyPeople.getById.mockResolvedValue(person);
    mockDb.storyPeople.update.mockResolvedValue({
      ...person,
      avatarImageUrl: "https://assets.example.com/new-avatar.jpg",
    });

    const { POST } = await import("@/app/api/story-people/[id]/avatar/route");
    const form = new FormData();
    form.append("photo", new File(["fake"], "mum.jpg", { type: "image/jpeg" }));
    form.append("photoConsent", "yes");
    form.append("adjustment", "less broad");
    const req = {
      formData: async () => form,
    } as NextRequest;

    const res = await POST(req, {
      params: Promise.resolve({ id: "person-1" }),
    });

    expect(res.status).toBe(200);
    expect(mockChargeReferenceRedoCredit).toHaveBeenCalledWith("user-1");
    expect(mockCreateStoryPersonAvatar).toHaveBeenCalledWith({
      person,
      file: expect.any(File),
      adjustment: "less broad",
    });
  });

  it("charges one credit for a new story person reference after two free references", async () => {
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
    mockDb.storyPeople.countAvatarReferencesByUserId.mockResolvedValue(2);
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
    expect(mockChargeReferenceRedoCredit).toHaveBeenCalledWith("user-1");
    expect(mockCreateStoryPersonAvatar).toHaveBeenCalled();
  });

  it("redoes an existing story person reference without a new photo", async () => {
    const person: StoryPerson = {
      id: "person-1",
      userId: "user-1",
      name: "Mum",
      relationship: "mum",
      description: "",
      personality: "",
      appearance: "Dark curls.",
      appearanceSummary: "Warm storybook reference.",
      avatarImageUrl: "https://assets.example.com/old-avatar.jpg",
      availableToAllProfiles: true,
      profileIds: [],
      createdAt: "2026-07-15T00:00:00.000Z",
      updatedAt: "2026-07-15T00:00:00.000Z",
    };
    mockDb.storyPeople.getById.mockResolvedValue(person);
    mockDb.storyPeople.update.mockResolvedValue({
      ...person,
      avatarImageUrl: "https://assets.example.com/redo.jpg",
    });

    const { POST } = await import("@/app/api/story-people/[id]/avatar/route");
    const req = new NextRequest(
      "http://localhost/api/story-people/person-1/avatar",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ adjustment: "remove the text label" }),
      }
    );

    const res = await POST(req, {
      params: Promise.resolve({ id: "person-1" }),
    });

    expect(res.status).toBe(200);
    expect(mockChargeReferenceRedoCredit).toHaveBeenCalledWith("user-1");
    expect(mockRedoStoryPersonAvatar).toHaveBeenCalledWith({
      person,
      adjustment: "remove the text label",
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
      adjustment: "",
    });
    expect(mockChargeReferenceRedoCredit).not.toHaveBeenCalled();
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

  it("charges one credit when redoing an existing child profile reference", async () => {
    const profile: ChildProfile = {
      ...profiles[0],
      avatarImageUrl: "https://assets.example.com/old-child-avatar.jpg",
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
      avatarImageUrl: "https://assets.example.com/new-child-avatar.jpg",
      appearanceSummary: "Warm child storybook reference.",
    });

    const { POST } = await import("@/app/api/profiles/[id]/avatar/route");
    const form = new FormData();
    form.append(
      "photo",
      new File(["fake"], "mila.jpg", { type: "image/jpeg" })
    );
    form.append("photoConsent", "yes");
    form.append("adjustment", "closer to the photo");
    const req = {
      formData: async () => form,
    } as NextRequest;

    const res = await POST(req, {
      params: Promise.resolve({ id: "profile-1" }),
    });

    expect(res.status).toBe(200);
    expect(mockChargeReferenceRedoCredit).toHaveBeenCalledWith("user-1");
    expect(mockCreateChildProfileAvatar).toHaveBeenCalledWith({
      profile,
      file: expect.any(File),
      adjustment: "closer to the photo",
    });
  });

  it("charges one credit for a new child profile reference after two free child references", async () => {
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
    mockDb.profiles.countAvatarReferencesByUserId.mockResolvedValue(2);
    mockDb.profiles.update.mockResolvedValue({
      ...profile,
      avatarImageUrl: "https://assets.example.com/child-avatar.jpg",
      appearanceSummary: "Warm child storybook reference.",
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
    expect(mockChargeReferenceRedoCredit).toHaveBeenCalledWith("user-1");
    expect(mockCreateChildProfileAvatar).toHaveBeenCalled();
  });

  it("redoes an existing child reference without a new photo", async () => {
    const profile: ChildProfile = {
      ...profiles[0],
      avatarImageUrl: "https://assets.example.com/old-child-avatar.jpg",
      appearanceSummary: "Warm child storybook reference.",
    };
    mockDb.profiles.getById.mockResolvedValue(profile);
    mockDb.profiles.update.mockResolvedValue({
      ...profile,
      avatarImageUrl: "https://assets.example.com/child-redo.jpg",
      appearanceSummary: "Adjusted child reference.",
    });

    const { POST } = await import("@/app/api/profiles/[id]/avatar/route");
    const req = new NextRequest(
      "http://localhost/api/profiles/profile-1/avatar",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ adjustment: "remove the age label" }),
      }
    );

    const res = await POST(req, {
      params: Promise.resolve({ id: "profile-1" }),
    });

    expect(res.status).toBe(200);
    expect(mockChargeReferenceRedoCredit).toHaveBeenCalledWith("user-1");
    expect(mockRedoChildProfileAvatar).toHaveBeenCalledWith({
      profile,
      adjustment: "remove the age label",
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
