import { PDFDocument, StandardFonts } from "pdf-lib";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ChildProfile, Story } from "@/types";
import type { BookProject, CharacterBible } from "@/types/printBook";

const mockStoreBookAsset = vi.fn();

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

function createCharacterBible(): CharacterBible {
  return {
    childAppearance: "Mila has curly dark hair and bright brown eyes.",
    outfitRules: "Keep Mila in a yellow cardigan over blue pajamas.",
    recurringProps: ["silver lantern"],
    companionCharacters: ["sleepy fox"],
    palette: "soft indigo, butter yellow, silver",
    renderStyle: "storybook gouache",
    lightingTone: "cozy moonlight",
    doNotChange: ["curly dark hair", "yellow cardigan"],
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
    trimSize: "storycot-dynamic-square",
    pageCount: 32,
    spreadCount: 16,
    completedSpreads: 16,
    totalSpreads: 16,
    currentStageLabel: "Weaving the story into a real book...",
    characterBible: createCharacterBible(),
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
        illustrationPrompt:
          'A magical print-ready picture-book cover for "Moonlight Garden" starring Mila.',
        imageUrl: "data:image/svg+xml;base64,cover",
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
        illustrationPrompt: "A moonlit path with Mila and the lantern.",
        imageUrl: "data:image/svg+xml;base64,spread",
      },
    ],
    assets: {
      proofVersion: 0,
      coverImageUrl: "data:image/svg+xml;base64,cover",
    },
    retryCount: 0,
    createdAt: "2026-07-15T00:00:00.000Z",
    updatedAt: "2026-07-15T00:00:00.000Z",
  };
}

function createProjectWithFullBackMatter(): BookProject {
  return {
    ...createProject(),
    pageCount: 10,
    spreadCount: 5,
    totalSpreads: 5,
    completedSpreads: 5,
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
        illustrationPrompt:
          'A magical print-ready picture-book cover for "Moonlight Garden" starring Mila.',
      },
      {
        id: "book-1:spread:2",
        bookProjectId: "book-1",
        sequence: 2,
        pageStart: 3,
        pageEnd: 4,
        layoutType: "front_matter",
        title: "Title",
        leftPageText: "Moonlight Garden",
        rightPageText: "Created especially for Mila.",
        sceneBrief: "Title and dedication pages",
        illustrationPrompt: "A gentle title-page illustration motif.",
      },
      {
        id: "book-1:spread:3",
        bookProjectId: "book-1",
        sequence: 3,
        pageStart: 5,
        pageEnd: 6,
        layoutType: "text_art",
        title: "Garden",
        leftPageText: "Mila stepped into the moonlight garden.",
        rightPageText: "The silver lantern glowed softly.",
        sceneBrief: "The first moment in the garden",
        illustrationPrompt: "A moonlit path with Mila and the lantern.",
      },
      {
        id: "book-1:spread:4",
        bookProjectId: "book-1",
        sequence: 4,
        pageStart: 7,
        pageEnd: 8,
        layoutType: "end_matter",
        title: "The End",
        leftPageText: "The End.\n\nSweet dreams, Mila.",
        rightPageText: "A Storycot story",
        sceneBrief: "Closing pages",
        illustrationPrompt: "A peaceful closing image.",
      },
      {
        id: "book-1:spread:5",
        bookProjectId: "book-1",
        sequence: 5,
        pageStart: 9,
        pageEnd: 10,
        layoutType: "end_matter",
        title: "Back Cover",
        leftPageText: "",
        rightPageText: "Storycot",
        sceneBrief: "Back cover",
        illustrationPrompt: "A simple back cover design.",
      },
    ],
  };
}

describe("generateBookPdfs", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    delete process.env.STORYCOT_COVER_SPINE_WIDTH_IN;
    delete process.env.STORYCOT_PRINT_PROVIDER;
    mockStoreBookAsset
      .mockResolvedValueOnce("data:application/pdf;base64,cover")
      .mockResolvedValueOnce("data:application/pdf;base64,print");
  });

  it("stores cover and print pdf artifacts and returns preview images", async () => {
    const { generateBookPdfs } = await import("@/lib/print-books/pdf");
    const result = await generateBookPdfs({
      project: createProject(),
      story: createStory(),
      profile: createProfile(),
    });

    expect(result.coverPdfUrl).toBe("data:application/pdf;base64,cover");
    expect(result.coverPdfReadyForOrdering).toBe(true);
    expect(result.coverPdfSpineSource).toBe("storycot_estimate");
    expect(result.coverPdfSpineWidthIn).toBe(0.18);
    expect(result.coverPdfPageWidthIn).toBe(17.28);
    expect(result.coverPdfPageHeightIn).toBe(8.55);
    expect(result.coverSpineTextIncluded).toBe(false);
    expect(result.printPdfUrl).toBe("data:application/pdf;base64,print");
    expect(result.printPdfPageWidthIn).toBe(8.55);
    expect(result.printPdfPageHeightIn).toBe(8.55);
    expect(result.interiorTextSafeMarginIn).toBe(0.625);
    expect(result.previewImages).toEqual([
      "data:image/svg+xml;base64,cover",
      "data:image/svg+xml;base64,spread",
    ]);
    expect(mockStoreBookAsset).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        pathname: "books/book-1/cover.pdf",
        contentType: "application/pdf",
      })
    );
    expect(mockStoreBookAsset).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        pathname: "books/book-1/print.pdf",
        contentType: "application/pdf",
      })
    );
  });

  it("marks the cover export orderable when an explicit Storycot spine width is configured", async () => {
    process.env.STORYCOT_COVER_SPINE_WIDTH_IN = "0.31";
    mockStoreBookAsset.mockReset();
    mockStoreBookAsset
      .mockResolvedValueOnce("data:application/pdf;base64,cover")
      .mockResolvedValueOnce("data:application/pdf;base64,print");

    const { generateBookPdfs } = await import("@/lib/print-books/pdf");
    const result = await generateBookPdfs({
      project: createProject(),
      story: createStory(),
      profile: createProfile(),
    });

    expect(result.coverPdfReadyForOrdering).toBe(true);
    expect(result.coverPdfSpineSource).toBe("configured");
  });

  it("exports a print PDF with clean text and art pages", async () => {
    mockStoreBookAsset.mockReset();
    mockStoreBookAsset
      .mockResolvedValueOnce("data:application/pdf;base64,cover")
      .mockResolvedValueOnce("data:application/pdf;base64,print");

    const project = createProjectWithFullBackMatter();
    const { generateBookPdfs } = await import("@/lib/print-books/pdf");
    await generateBookPdfs({
      project,
      story: createStory(),
      profile: createProfile(),
    });

    const printPdfBody = mockStoreBookAsset.mock.calls[1]?.[0]?.body;
    expect(printPdfBody).toBeTruthy();
    const printPdf = await PDFDocument.load(new Uint8Array(printPdfBody));
    expect(printPdf.getPageCount()).toBe(8);
  });

  it("exports Lulu-specific PDFs with a padded 24-page interior", async () => {
    process.env.STORYCOT_PRINT_PROVIDER = "lulu";
    mockStoreBookAsset.mockReset();
    mockStoreBookAsset
      .mockResolvedValueOnce("data:application/pdf;base64,cover")
      .mockResolvedValueOnce("data:application/pdf;base64,print")
      .mockResolvedValueOnce("data:application/pdf;base64,lulu-cover")
      .mockResolvedValueOnce("data:application/pdf;base64,lulu-print");

    const project = createProjectWithFullBackMatter();
    project.pageCount = 20;
    const { generateBookPdfs } = await import("@/lib/print-books/pdf");
    const result = await generateBookPdfs({
      project,
      story: createStory(),
      profile: createProfile(),
    });

    expect(result.luluCoverPdfUrl).toBe(
      "data:application/pdf;base64,lulu-cover"
    );
    expect(result.luluPrintPdfUrl).toBe(
      "data:application/pdf;base64,lulu-print"
    );
    expect(result.luluPrintPdfPageWidthIn).toBe(8.75);
    expect(result.luluPrintPdfPageHeightIn).toBe(8.75);
    expect(result.luluPrintPdfPageCount).toBe(24);
    expect(mockStoreBookAsset).toHaveBeenNthCalledWith(
      3,
      expect.objectContaining({
        pathname: "books/book-1/lulu-cover.pdf",
        contentType: "application/pdf",
      })
    );
    expect(mockStoreBookAsset).toHaveBeenNthCalledWith(
      4,
      expect.objectContaining({
        pathname: "books/book-1/lulu-print.pdf",
        contentType: "application/pdf",
      })
    );

    const luluPrintPdfBody = mockStoreBookAsset.mock.calls[3]?.[0]?.body;
    expect(luluPrintPdfBody).toBeTruthy();
    const luluPrintPdf = await PDFDocument.load(
      new Uint8Array(luluPrintPdfBody)
    );
    expect(luluPrintPdf.getPageCount()).toBe(24);

    const standardPrintPdfBody = mockStoreBookAsset.mock.calls[1]?.[0]?.body;
    const standardPrintPdf = await PDFDocument.load(
      new Uint8Array(standardPrintPdfBody)
    );
    expect(standardPrintPdf.getPageCount()).toBe(8);
  });

  it("fits long story text inside the printable text panel", async () => {
    const pdfDoc = await PDFDocument.create();
    const font = await pdfDoc.embedFont(StandardFonts.TimesRoman);
    const { fitWrappedTextToBox } = await import("@/lib/print-books/pdf");
    const maxHeight = 155;
    const layout = fitWrappedTextToBox({
      text: Array.from(
        { length: 8 },
        () =>
          "Bailey had the most wonderful idea and set up a teepee for a very special adventure."
      ).join(" "),
      font,
      maxWidth: 430,
      maxHeight,
      paddingY: 54,
      preferredSize: 17,
      minSize: 9.5,
    });

    expect(layout.lines.length * layout.lineHeight + 54).toBeLessThanOrEqual(
      maxHeight
    );
    expect(layout.size).toBeLessThan(17);
  });
});
