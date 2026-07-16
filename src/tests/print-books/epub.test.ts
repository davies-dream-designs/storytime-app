import JSZip from "jszip";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ChildProfile, Story } from "@/types";
import type { BookProject } from "@/types/printBook";

const mockStoreBookAsset = vi.fn();
const coverSvg = Buffer.from(
  '<svg xmlns="http://www.w3.org/2000/svg" width="120" height="160"><rect width="120" height="160" fill="#252748"/></svg>'
).toString("base64");
const pageSvg = Buffer.from(
  '<svg xmlns="http://www.w3.org/2000/svg" width="120" height="120"><rect width="120" height="120" fill="#f7d897"/></svg>'
).toString("base64");

vi.mock("@/lib/print-books/storage", () => ({
  storeBookAsset: mockStoreBookAsset,
}));

function createProfile(): ChildProfile {
  return {
    id: "profile-1",
    userId: "user-1",
    name: "Mila",
    age: 4,
    favouriteCharacters: ["Bunny"],
    favouriteActivities: ["painting"],
    favouriteAnimals: ["fox"],
    favouritePlaces: ["garden"],
    lessons: ["kindness"],
    createdAt: "2026-07-15T00:00:00.000Z",
  };
}

function createStory(): Story {
  return {
    id: "story-1",
    userId: "user-1",
    title: "Moonlight Garden",
    profileId: "profile-1",
    profileName: "Mila",
    wordCount: 120,
    theme: "kindness",
    notes: "",
    createdAt: "2026-07-15T00:00:00.000Z",
    pages: [
      {
        pageNumber: 1,
        text: "Mila stepped into the moonlight garden.",
        illustrationPrompt: "A magical moonlight garden.",
      },
    ],
  };
}

function createProject(): BookProject {
  return {
    id: "book-1",
    userId: "user-1",
    sourceStoryId: "story-1",
    profileId: "profile-1",
    ageBand: "3-5",
    status: "composing",
    trimSize: "lulu-hardcover-32",
    pageCount: 32,
    spreadCount: 16,
    completedSpreads: 16,
    totalSpreads: 16,
    currentStageLabel: "Preparing your illustrated PDF...",
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
        sceneBrief: "Front cover for Moonlight Garden",
        illustrationPrompt: "A magical cover.",
        imageUrl: `data:image/svg+xml;base64,${coverSvg}`,
      },
      {
        id: "book-1:spread:2",
        bookProjectId: "book-1",
        sequence: 2,
        pageStart: 3,
        pageEnd: 4,
        layoutType: "text_art",
        leftPageText: "Mila stepped into the moonlight garden.",
        rightPageText: "The silver lantern glowed softly.",
        sceneBrief: "The first moment in the garden",
        illustrationPrompt: "A moonlit path.",
        leftPageImageUrl: `data:image/svg+xml;base64,${pageSvg}`,
        rightPageImageUrl: `data:image/svg+xml;base64,${pageSvg}`,
      },
    ],
    assets: {
      proofVersion: 0,
      coverImageUrl: `data:image/svg+xml;base64,${coverSvg}`,
    },
    retryCount: 0,
    createdAt: "2026-07-15T00:00:00.000Z",
    updatedAt: "2026-07-15T00:00:00.000Z",
  };
}

describe("buildBookEpub", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockStoreBookAsset.mockResolvedValue("https://example.com/storycot.epub");
  });

  it("creates an EPUB archive with metadata, navigation, pages, and images", async () => {
    const { buildBookEpub, generateBookEpub } =
      await import("@/lib/print-books/epub");

    const epub = await buildBookEpub({
      project: createProject(),
      story: createStory(),
      profile: createProfile(),
    });

    const zip = await JSZip.loadAsync(epub);
    await expect(zip.file("mimetype")?.async("string")).resolves.toBe(
      "application/epub+zip"
    );
    await expect(
      zip.file("META-INF/container.xml")?.async("string")
    ).resolves.toContain("OEBPS/content.opf");
    await expect(
      zip.file("OEBPS/content.opf")?.async("string")
    ).resolves.toContain("<dc:title>Moonlight Garden</dc:title>");
    await expect(
      zip.file("OEBPS/nav.xhtml")?.async("string")
    ).resolves.toContain("Moonlight Garden");
    expect(zip.file("OEBPS/cover.xhtml")).toBeTruthy();
    expect(zip.file("OEBPS/spread-2-left.xhtml")).toBeTruthy();
    expect(zip.file("OEBPS/images/spread-2-left.webp")).toBeTruthy();

    const stored = await generateBookEpub({
      project: createProject(),
      story: createStory(),
      profile: createProfile(),
    });

    expect(stored.epubUrl).toBe("https://example.com/storycot.epub");
    expect(mockStoreBookAsset).toHaveBeenCalledWith(
      expect.objectContaining({
        pathname: "books/book-1/storycot.epub",
        contentType: "application/epub+zip",
      })
    );
  });

  it("creates a text-only EPUB from a story", async () => {
    const { buildStoryTextEpub } = await import("@/lib/print-books/epub");

    const epub = await buildStoryTextEpub({
      story: createStory(),
      profile: createProfile(),
    });

    const zip = await JSZip.loadAsync(epub);
    await expect(zip.file("mimetype")?.async("string")).resolves.toBe(
      "application/epub+zip"
    );
    await expect(
      zip.file("OEBPS/content.opf")?.async("string")
    ).resolves.toContain("<dc:title>Moonlight Garden</dc:title>");
    await expect(
      zip.file("OEBPS/content.opf")?.async("string")
    ).resolves.toContain('properties="cover-image"');
    await expect(
      zip.file("OEBPS/page-1.xhtml")?.async("string")
    ).resolves.toContain("Mila stepped into the moonlight garden.");
    expect(zip.file("OEBPS/images/cover.webp")).toBeTruthy();
    expect(zip.file("OEBPS/images/spread-2-left.webp")).toBeNull();
  });

  it("keeps illustrated EPUB image assets under a Kindle-friendly budget", async () => {
    const { buildBookEpub } = await import("@/lib/print-books/epub");
    const largeImage = await (await import("sharp")).default({
      create: {
        width: 3000,
        height: 3000,
        channels: 3,
        background: { r: 120, g: 80, b: 220 },
      },
    })
      .png()
      .toBuffer();
    const largeImageDataUrl = `data:image/png;base64,${largeImage.toString("base64")}`;
    const project = createProject();
    project.assets.coverImageUrl = largeImageDataUrl;
    project.spreads = project.spreads.map((spread) => ({
      ...spread,
      imageUrl: largeImageDataUrl,
      leftPageImageUrl: largeImageDataUrl,
      rightPageImageUrl: largeImageDataUrl,
    }));

    const epub = await buildBookEpub({
      project,
      story: createStory(),
      profile: createProfile(),
    });

    const zip = await JSZip.loadAsync(epub);
    const imageFiles = Object.values(zip.files).filter((file) =>
      file.name.startsWith("OEBPS/images/")
    );
    expect(epub.length).toBeLessThan(50 * 1024 * 1024);
    expect(imageFiles.length).toBeGreaterThan(0);
    for (const file of imageFiles) {
      const bytes = await file.async("nodebuffer");
      expect(bytes.length).toBeLessThanOrEqual(850 * 1024);
    }
  });
});
