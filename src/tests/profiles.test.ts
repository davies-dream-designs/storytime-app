import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

const mockDb = {
  profiles: {
    getAll: vi.fn(() => []),
    getByUserId: vi.fn(() => []),
    create: vi.fn(),
    getById: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(() => false),
  },
  stories: {
    getByProfileId: vi.fn(
      async (): Promise<Array<{ id: string; userId: string }>> => []
    ),
    delete: vi.fn(async () => true),
  },
};

vi.mock("@/lib/db", () => ({ db: mockDb }));
vi.mock("@clerk/nextjs/server", () => ({
  auth: vi.fn(async () => ({ userId: "user-1" })),
}));

async function importRoute() {
  const { GET, POST } = await import("@/app/api/profiles/route");
  return { GET, POST };
}

async function importProfileRoute() {
  const { PUT } = await import("@/app/api/profiles/[id]/route");
  return { PUT };
}

describe("GET /api/profiles", () => {
  beforeEach(() => {
    vi.resetModules();
    mockDb.profiles.getAll.mockReturnValue([]);
    mockDb.profiles.getByUserId.mockReturnValue([]);
  });

  it("returns an empty array when no profiles exist", async () => {
    const { GET } = await importRoute();
    const res = await GET();
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual([]);
  });
});

describe("POST /api/profiles", () => {
  beforeEach(() => {
    vi.resetModules();
    mockDb.profiles.create.mockImplementation(() => {});
  });

  it("creates a valid profile", async () => {
    const { POST } = await importRoute();
    const req = new NextRequest("http://localhost/api/profiles", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: "Max",
        age: 3,
        gender: "girl",
        ipConfirmationAccepted: true,
        favouriteAnimals: ["Fox"],
        appearance: {
          skinTone: "medium",
          hairColor: "dark_brown",
          hairTexture: "curly",
          hairStyles: ["pigtails"],
          featureEmphasis: [
            "round_cheeks",
            "wide_eyes",
            "button_nose",
            "other",
          ],
          consistencyNote:
            "Round cheeks, dark curls, red glasses, tiny gap in front teeth that should definitely stay consistent forever",
        },
      }),
    });
    const res = await POST(req);
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.name).toBe("Max");
    expect(body.age).toBe(3);
    expect(body.gender).toBe("girl");
    expect(body.userId).toBe("user-1");
    expect(body.appearance.skinTone).toBe("medium");
    expect(body.appearance.hairStyles).toEqual(["pigtails"]);
    expect(body.appearance.featureEmphasis).toEqual([
      "round_cheeks",
      "wide_eyes",
      "button_nose",
    ]);
    expect(body.appearance.consistencyNote.length).toBeLessThanOrEqual(140);
  });

  it("rejects a profile without a name", async () => {
    const { POST } = await importRoute();
    const req = new NextRequest("http://localhost/api/profiles", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ age: 3 }),
    });
    const res = await POST(req);
    expect(res.status).toBe(400);
  });

  it("accepts a profile with dateOfBirth instead of age", async () => {
    const { POST } = await importRoute();
    const req = new NextRequest("http://localhost/api/profiles", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: "Max",
        dateOfBirth: "2023-06-01",
        ipConfirmationAccepted: true,
      }),
    });
    const res = await POST(req);
    expect(res.status).toBe(201);
  });

  it("rejects a profile without protected IP confirmation", async () => {
    const { POST } = await importRoute();
    const req = new NextRequest("http://localhost/api/profiles", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "Max", age: 3 }),
    });
    const res = await POST(req);
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({
      error: expect.stringContaining("branded characters"),
    });
  });
});

describe("PUT /api/profiles/[id]", () => {
  beforeEach(() => {
    vi.resetModules();
    mockDb.profiles.getById.mockResolvedValue({
      id: "profile-1",
      userId: "user-1",
      name: "Max",
      age: 3,
      favouriteCharacters: [],
      favouriteActivities: [],
      favouriteAnimals: [],
      favouritePlaces: [],
      lessons: [],
      createdAt: "2026-07-28T00:00:00.000Z",
    });
    mockDb.profiles.update.mockResolvedValue({
      id: "profile-1",
      userId: "user-1",
      name: "Max",
      age: 4,
      favouriteCharacters: [],
      favouriteActivities: [],
      favouriteAnimals: [],
      favouritePlaces: [],
      lessons: [],
      createdAt: "2026-07-28T00:00:00.000Z",
    });
  });

  it("requires protected IP confirmation before updating a profile", async () => {
    const { PUT } = await importProfileRoute();
    const req = new NextRequest("http://localhost/api/profiles/profile-1", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "Max", age: 4 }),
    });
    const res = await PUT(req, {
      params: Promise.resolve({ id: "profile-1" }),
    });
    expect(res.status).toBe(400);
    expect(mockDb.profiles.update).not.toHaveBeenCalled();
  });

  it("updates a profile after protected IP confirmation", async () => {
    const { PUT } = await importProfileRoute();
    const req = new NextRequest("http://localhost/api/profiles/profile-1", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: "Max",
        age: 4,
        gender: "boy",
        ipConfirmationAccepted: true,
      }),
    });
    const res = await PUT(req, {
      params: Promise.resolve({ id: "profile-1" }),
    });
    expect(res.status).toBe(200);
    expect(mockDb.profiles.update).toHaveBeenCalledWith(
      "profile-1",
      expect.objectContaining({
        name: "Max",
        age: 4,
        gender: "boy",
      })
    );
  });

  it("ignores attempts to reassign ownership or generation state", async () => {
    const { PUT } = await importProfileRoute();
    const req = new NextRequest("http://localhost/api/profiles/profile-1", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: "Max",
        ipConfirmationAccepted: true,
        id: "someone-elses-id",
        userId: "attacker",
        avatarGenerationStatus: "ready",
        avatarImageUrl: "https://evil.example.com/x.png",
      }),
    });
    const res = await PUT(req, {
      params: Promise.resolve({ id: "profile-1" }),
    });
    expect(res.status).toBe(200);
    const [, updates] = mockDb.profiles.update.mock.calls.at(-1)!;
    expect(updates).not.toHaveProperty("id");
    expect(updates).not.toHaveProperty("userId");
    expect(updates).not.toHaveProperty("avatarGenerationStatus");
    // A foreign avatar URL is rejected by the media allowlist.
    expect(updates).not.toHaveProperty("avatarImageUrl");
  });
});

describe("DELETE /api/profiles/[id]", () => {
  beforeEach(() => {
    vi.resetModules();
    mockDb.profiles.getById.mockResolvedValue({
      id: "profile-1",
      userId: "user-1",
      name: "Max",
      age: 3,
      favouriteCharacters: [],
      favouriteActivities: [],
      favouriteAnimals: [],
      favouritePlaces: [],
      lessons: [],
      createdAt: "2026-07-28T00:00:00.000Z",
    });
    mockDb.profiles.delete.mockResolvedValue(true);
  });

  it("cascades deletion to the child's stories", async () => {
    mockDb.stories.getByProfileId.mockResolvedValue([
      { id: "story-1", userId: "user-1" },
      { id: "story-2", userId: "user-1" },
    ]);
    const { DELETE } = await import("@/app/api/profiles/[id]/route");
    const res = await DELETE(
      new NextRequest("http://localhost/api/profiles/profile-1", {
        method: "DELETE",
      }),
      { params: Promise.resolve({ id: "profile-1" }) }
    );
    expect(res.status).toBe(200);
    expect(mockDb.stories.delete).toHaveBeenCalledWith("story-1");
    expect(mockDb.stories.delete).toHaveBeenCalledWith("story-2");
    expect(mockDb.profiles.delete).toHaveBeenCalledWith("profile-1");
  });
});
