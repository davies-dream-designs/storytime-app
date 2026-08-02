import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import type { ChildProfile, StoryPerson } from "@/types";

const { mockAuth, mockDb } = vi.hoisted(() => ({
  mockAuth: vi.fn(async () => ({ userId: "user-1" })),
  mockDb: {
    profiles: {
      getByUserId: vi.fn(),
    },
    storyPeople: {
      getByUserId: vi.fn(),
      getByProfileId: vi.fn(),
      create: vi.fn(),
    },
  },
}));

vi.mock("@clerk/nextjs/server", () => ({
  auth: mockAuth,
}));

vi.mock("@/lib/db", () => ({
  db: mockDb,
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
    mockDb.storyPeople.create.mockResolvedValue(undefined);
    mockDb.storyPeople.getByUserId.mockResolvedValue([]);
    mockDb.storyPeople.getByProfileId.mockResolvedValue([]);
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
});
