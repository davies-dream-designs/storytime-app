import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import JSZip from "jszip";

const { mockAuth } = vi.hoisted(() => ({
  mockAuth: vi.fn(async () => ({ userId: "user-1" })),
}));

const mockDb = {
  bookProjects: {
    getById: vi.fn(),
    getByStoryId: vi.fn(),
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

  it("serves Lulu print PDFs through the authenticated route", async () => {
    mockDb.bookProjects.getById.mockResolvedValue({
      id: "book-1",
      userId: "user-1",
      sourceStoryId: "story-1",
      assets: {
        luluPrintPdfUrl: `data:application/pdf;base64,${Buffer.from("lulu interior").toString("base64")}`,
        luluCoverPdfUrl: `data:application/pdf;base64,${Buffer.from("lulu cover").toString("base64")}`,
      },
    });
    mockDb.stories.getById.mockResolvedValue({
      id: "story-1",
      userId: "user-1",
      title: "Moonlight Garden",
    });

    const { GET } = await import("@/app/api/books/[id]/download/route");
    const interiorRes = await GET(
      new NextRequest(
        "http://localhost/api/books/book-1/download?asset=luluPrintPdf"
      ),
      { params: Promise.resolve({ id: "book-1" }) }
    );
    const coverRes = await GET(
      new NextRequest(
        "http://localhost/api/books/book-1/download?asset=luluCoverPdf"
      ),
      { params: Promise.resolve({ id: "book-1" }) }
    );

    expect(interiorRes.status).toBe(200);
    expect(interiorRes.headers.get("content-type")).toBe("application/pdf");
    expect(interiorRes.headers.get("content-disposition")).toContain(
      "Moonlight Garden Lulu interior.pdf"
    );
    await expect(interiorRes.text()).resolves.toBe("lulu interior");
    expect(coverRes.status).toBe(200);
    expect(coverRes.headers.get("content-disposition")).toContain(
      "Moonlight Garden Lulu cover.pdf"
    );
    await expect(coverRes.text()).resolves.toBe("lulu cover");
  });

  it("rebuilds illustrated book EPUB downloads instead of serving stale stored EPUBs", async () => {
    const pageSvg = Buffer.from(
      '<svg xmlns="http://www.w3.org/2000/svg" width="120" height="120"><rect width="120" height="120" fill="#f7d897"/></svg>'
    ).toString("base64");
    mockDb.bookProjects.getById.mockResolvedValue({
      id: "book-1",
      userId: "user-1",
      sourceStoryId: "story-1",
      profileId: "profile-1",
      ageBand: "3-5",
      status: "proofing",
      trimSize: "storycot-dynamic-square",
      pageCount: 4,
      spreadCount: 2,
      completedSpreads: 2,
      totalSpreads: 2,
      currentStageLabel: "Ready",
      beats: [],
      spreads: [
        {
          id: "book-1:spread:1",
          bookProjectId: "book-1",
          sequence: 1,
          pageStart: 1,
          pageEnd: 2,
          layoutType: "front_matter",
          title: "Cover",
          leftPageText: "Moonlight Garden",
          rightPageText: "",
          sceneBrief: "Cover",
          illustrationPrompt: "Cover",
        },
        {
          id: "book-1:spread:2",
          bookProjectId: "book-1",
          sequence: 2,
          pageStart: 3,
          pageEnd: 4,
          layoutType: "text_art",
          title: "Page",
          leftPageText: "Mila found a lantern.",
          rightPageText: "It glowed softly.",
          sceneBrief: "Garden",
          illustrationPrompt: "Garden",
          leftPageImageUrl: `data:image/svg+xml;base64,${pageSvg}`,
        },
      ],
      assets: {
        proofVersion: 1,
        epubUrl: `data:application/epub+zip;base64,${Buffer.from("stale").toString("base64")}`,
      },
      retryCount: 0,
      createdAt: "2026-07-15T00:00:00.000Z",
      updatedAt: "2026-07-15T00:00:00.000Z",
    });
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
      age: 4,
      favouriteCharacters: [],
      favouriteActivities: [],
      favouriteAnimals: [],
      favouritePlaces: [],
      lessons: [],
      createdAt: "2026-07-15T00:00:00.000Z",
    });

    const { GET } = await import("@/app/api/books/[id]/download/route");
    const res = await GET(
      new NextRequest("http://localhost/api/books/book-1/download?asset=epub"),
      { params: Promise.resolve({ id: "book-1" }) }
    );

    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("application/epub+zip");
    const epub = Buffer.from(await res.arrayBuffer());
    const zip = await JSZip.loadAsync(epub);
    await expect(
      zip.file("OEBPS/content.opf")?.async("string")
    ).resolves.not.toContain("fixed-layout");
    await expect(
      zip.file("OEBPS/spread-2-left-text.xhtml")?.async("string")
    ).resolves.toContain("Mila found a lantern.");
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
    mockDb.bookProjects.getByStoryId.mockResolvedValue([]);

    const { GET } = await import("@/app/api/stories/[id]/epub/route");
    const res = await GET(
      new Request("http://localhost/api/stories/story-1/epub"),
      {
        params: Promise.resolve({ id: "story-1" }),
      }
    );

    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("application/epub+zip");
    expect(mockDb.bookProjects.getByStoryId).toHaveBeenCalledWith("story-1");
    expect((await res.arrayBuffer()).byteLength).toBeGreaterThan(100);
  });
});
