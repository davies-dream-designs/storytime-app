import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const { mockAuth } = vi.hoisted(() => ({
  mockAuth: vi.fn(async () => ({ userId: "user-1" })),
}));

const mockDb = {
  bookProjects: {
    getById: vi.fn(),
  },
  stories: {
    getById: vi.fn(),
  },
  profiles: {
    getById: vi.fn(),
  },
};

vi.mock("@clerk/nextjs/server", () => ({
  auth: mockAuth,
}));

vi.mock("@/lib/db", () => ({
  db: mockDb,
}));

describe("download routes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockAuth.mockResolvedValue({ userId: "user-1" });
  });

  it("serves inline book PDFs through an authenticated route", async () => {
    mockDb.bookProjects.getById.mockResolvedValue({
      id: "book-1",
      userId: "user-1",
      assets: {
        printPdfUrl: `data:application/pdf;base64,${Buffer.from("pdf").toString("base64")}`,
      },
    });

    const { GET } = await import("@/app/api/books/[id]/download/route");
    const res = await GET(
      new NextRequest(
        "http://localhost/api/books/book-1/download?asset=printPdf"
      ),
      { params: Promise.resolve({ id: "book-1" }) }
    );

    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("application/pdf");
    await expect(res.text()).resolves.toBe("pdf");
  });

  it("creates a text EPUB for a story", async () => {
    mockDb.stories.getById.mockResolvedValue({
      id: "story-1",
      userId: "user-1",
      title: "Moonlight Garden",
      profileId: "profile-1",
      profileName: "Mila",
      wordCount: 8,
      theme: "kindness",
      notes: "",
      createdAt: "2026-07-15T00:00:00.000Z",
      pages: [{ pageNumber: 1, text: "Mila found a lantern." }],
    });
    mockDb.profiles.getById.mockResolvedValue({
      id: "profile-1",
      userId: "user-1",
      name: "Mila",
    });

    const { GET } = await import("@/app/api/stories/[id]/epub/route");
    const res = await GET(
      new Request("http://localhost/api/stories/story-1/epub"),
      {
        params: Promise.resolve({ id: "story-1" }),
      }
    );

    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("application/epub+zip");
    expect((await res.arrayBuffer()).byteLength).toBeGreaterThan(100);
  });
});
