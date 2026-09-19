import { PDFDocument, StandardFonts } from "pdf-lib";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ChildProfile, Story } from "@/types";
import type { BookProject, CharacterBible } from "@/types/printBook";

const mockStoreBookAsset = vi.fn();
const pngPixel =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/p9sAAAAASUVORK5CYII=";

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
        leftPageImageUrl: pngPixel,
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

describe("buildCoverPdf for flat Lulu bindings", () => {
  it("uses Lulu's verified 8.625in panels and zero spine for coil", async () => {
    const { buildCoverPdf } = await import("@/lib/print-books/pdf");
    const { LULU_COIL_COVER_PDF_GEOMETRY, POINTS_PER_INCH } = await import(
      "@/lib/print-books/pdf/constants"
    );

    const bytes = await buildCoverPdf({
      project: createProject(),
      story: createStory(),
      profile: createProfile(),
      geometry: LULU_COIL_COVER_PDF_GEOMETRY,
      spineWidthIn: 0,
      productKey: "coil",
    });
    const pdf = await PDFDocument.load(bytes);
    const { width, height } = pdf.getPage(0).getSize();

    // Live Lulu /cover-dimensions/ responses are a constant 17.250 x 8.750
    // inches for coil — two 8.625in panels and no continuous spine.
    expect(width).toBeCloseTo(17.25 * POINTS_PER_INCH, 3);
    expect(height).toBeCloseTo(8.75 * POINTS_PER_INCH, 3);
  });

  it("adds only Lulu's live paperback spine width between the flat panels", async () => {
    const { buildCoverPdf } = await import("@/lib/print-books/pdf");
    const { LULU_FLAT_COVER_PDF_GEOMETRY, POINTS_PER_INCH } = await import(
      "@/lib/print-books/pdf/constants"
    );

    const livePaperbackSpineWidthIn = 0.132; // verified @ 32pp
    const bytes = await buildCoverPdf({
      project: createProject(),
      story: createStory(),
      profile: createProfile(),
      geometry: LULU_FLAT_COVER_PDF_GEOMETRY,
      spineWidthIn: livePaperbackSpineWidthIn,
      productKey: "paperback",
    });
    const pdf = await PDFDocument.load(bytes);
    const { width, height } = pdf.getPage(0).getSize();

    // 2 * 8.625in panels + 0.132in live spine = 17.382in, exactly matching
    // Lulu's verified cover-dimensions response for Perfect Bound at 32pp.
    expect(width).toBeCloseTo(17.382 * POINTS_PER_INCH, 3);
    expect(height).toBeCloseTo(8.75 * POINTS_PER_INCH, 3);
  });
});

describe("formatCreatedOnDate", () => {
  it("formats a book's creation timestamp as a full UTC date", async () => {
    const { formatCreatedOnDate } = await import(
      "@/lib/print-books/pdf/rendering"
    );
    expect(formatCreatedOnDate("2026-07-15T00:00:00.000Z")).toBe(
      "15 July 2026"
    );
    // Uses UTC, so a just-before-midnight UTC time stays on the same day.
    expect(formatCreatedOnDate("2026-03-03T23:30:00.000Z")).toBe(
      "3 March 2026"
    );
  });

  it("returns an empty string for an invalid date", async () => {
    const { formatCreatedOnDate } = await import(
      "@/lib/print-books/pdf/rendering"
    );
    expect(formatCreatedOnDate("not-a-date")).toBe("");
  });

  it("formats the date in the book's own language", async () => {
    const { formatCreatedOnDate } = await import(
      "@/lib/print-books/pdf/rendering"
    );
    expect(formatCreatedOnDate("2026-07-15T00:00:00.000Z", "es-ES")).toBe(
      "15 de julio de 2026"
    );
  });
});

describe("PDF font selection for non-Latin scripts", () => {
  it("routes CJK locales to the Noto CJK font", async () => {
    const { localeNeedsCjkFont } = await import(
      "@/lib/print-books/pdf/fonts"
    );
    expect(localeNeedsCjkFont("zh")).toBe(true);
    expect(localeNeedsCjkFont("ja")).toBe(true);
    expect(localeNeedsCjkFont("en")).toBe(false);
    expect(localeNeedsCjkFont("ru")).toBe(false);
    expect(localeNeedsCjkFont(undefined)).toBe(false);
  });

  it("embeds a font that can encode Chinese and Japanese glyphs without tofu", async () => {
    const { loadEmbeddedPdfFonts } = await import(
      "@/lib/print-books/pdf/fonts"
    );
    const doc = await PDFDocument.create();
    const fonts = await loadEmbeddedPdfFonts(doc, "zh");
    // encodeText throws if a glyph is missing (i.e. would render as .notdef).
    expect(() => fonts.serif.encodeText("小狐狸在月光下的森林里散步")).not.toThrow();
    expect(() => fonts.sans.encodeText("むかしむかし、キツネがいました")).not.toThrow();
  });

  it("keeps Latin locales on the Liberation fonts", async () => {
    const { loadEmbeddedPdfFonts } = await import(
      "@/lib/print-books/pdf/fonts"
    );
    const doc = await PDFDocument.create();
    const fonts = await loadEmbeddedPdfFonts(doc, "en");
    expect(() => fonts.serif.encodeText("Hello world")).not.toThrow();
  });
});

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

  it("exports a print PDF without decorative end-matter art placeholders", async () => {
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
    expect(printPdf.getPageCount()).toBe(6);
  });

  it("does not add art pages for placeholder-only illustration slots", async () => {
    mockStoreBookAsset.mockReset();
    mockStoreBookAsset
      .mockResolvedValueOnce("data:application/pdf;base64,cover")
      .mockResolvedValueOnce("data:application/pdf;base64,print");

    const project = createProjectWithFullBackMatter();
    project.spreads[2] = {
      ...project.spreads[2]!,
      leftPageImageUrl: "data:image/svg+xml;base64,left",
    };

    const { generateBookPdfs } = await import("@/lib/print-books/pdf");
    await generateBookPdfs({
      project,
      story: createStory(),
      profile: createProfile(),
    });

    const printPdfBody = mockStoreBookAsset.mock.calls[1]?.[0]?.body;
    expect(printPdfBody).toBeTruthy();
    const printPdf = await PDFDocument.load(new Uint8Array(printPdfBody));
    expect(printPdf.getPageCount()).toBe(5);
  });

  it("exports art pages for hero, quiet, and text-art story spreads", async () => {
    mockStoreBookAsset.mockReset();
    mockStoreBookAsset
      .mockResolvedValueOnce("data:application/pdf;base64,cover")
      .mockResolvedValueOnce("data:application/pdf;base64,print");

    const project = createProjectWithFullBackMatter();
    project.spreads = [
      ...project.spreads.slice(0, 3),
      {
        id: "book-1:spread:4",
        bookProjectId: "book-1",
        sequence: 4,
        pageStart: 7,
        pageEnd: 8,
        layoutType: "hero",
        title: "Lantern",
        leftPageText: "The lantern made the garden feel wide and bright.",
        rightPageText: "",
        sceneBrief: "A wide garden moment",
        illustrationPrompt: "Mila holding a silver lantern in a wide garden.",
        leftPageImageUrl: pngPixel,
      },
      {
        id: "book-1:spread:5",
        bookProjectId: "book-1",
        sequence: 5,
        pageStart: 9,
        pageEnd: 10,
        layoutType: "quiet",
        title: "Fox",
        leftPageText: "A sleepy fox blinked kindly from under the leaves.",
        rightPageText: "",
        sceneBrief: "A quiet fox moment",
        illustrationPrompt: "A sleepy fox beneath moonlit leaves.",
        leftPageImageUrl: pngPixel,
      },
      ...project.spreads.slice(3).map((spread, index) => ({
        ...spread,
        sequence: index + 6,
      })),
    ];

    const { generateBookPdfs } = await import("@/lib/print-books/pdf");
    await generateBookPdfs({
      project,
      story: createStory(),
      profile: createProfile(),
    });

    const printPdfBody = mockStoreBookAsset.mock.calls[1]?.[0]?.body;
    expect(printPdfBody).toBeTruthy();
    const printPdf = await PDFDocument.load(new Uint8Array(printPdfBody));
    expect(printPdf.getPageCount()).toBe(10);
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
    expect(result.luluCoverPdfPageWidthIn).toBe(19);
    expect(result.luluCoverPdfPageHeightIn).toBe(10.25);
    expect(result.luluCoverPdfSpineWidthIn).toBe(0.25);
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

    const luluCoverPdfBody = mockStoreBookAsset.mock.calls[2]?.[0]?.body;
    expect(luluCoverPdfBody).toBeTruthy();
    const luluCoverPdf = await PDFDocument.load(
      new Uint8Array(luluCoverPdfBody)
    );
    const luluCoverPageSize = luluCoverPdf.getPage(0).getSize();
    expect(luluCoverPageSize.width / 72).toBeCloseTo(19, 2);
    expect(luluCoverPageSize.height / 72).toBeCloseTo(10.25, 2);

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
    expect(standardPrintPdf.getPageCount()).toBe(6);
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

describe("Lulu interior binding-edge gutter", () => {
  // Text x-positions are read back out of the page content stream (the `Tm`
  // text matrix), so these assert what is actually drawn rather than what the
  // geometry constants merely intend.
  async function getTextXPositions(
    bytes: Uint8Array,
    pageIndex: number
  ): Promise<number[]> {
    const { PDFRawStream } = await import("pdf-lib");
    const { inflateSync } = await import("node:zlib");
    const doc = await PDFDocument.load(bytes);
    const contents = doc.getPage(pageIndex).node.Contents();
    if (!contents) return [];
    const refs =
      "asArray" in contents
        ? (contents as { asArray: () => unknown[] }).asArray()
        : [contents];

    const xs: number[] = [];
    for (const ref of refs) {
      const stream = doc.context.lookup(ref as never);
      if (!(stream instanceof PDFRawStream)) continue;
      let raw = Buffer.from(stream.contents);
      try {
        raw = inflateSync(raw);
      } catch {
        // stream stored uncompressed
      }
      for (const m of raw
        .toString("latin1")
        .matchAll(/1 0 0 1 ([\d.-]+) ([\d.-]+) Tm/g)) {
        xs.push(Number(m[1]));
      }
    }
    return xs;
  }

  async function buildPdfs(project: BookProject) {
    const stored: Record<string, Uint8Array> = {};
    mockStoreBookAsset.mockImplementation(
      async ({ pathname, body }: { pathname: string; body: Buffer }) => {
        stored[pathname] = new Uint8Array(body);
        return `https://blob/${pathname}`;
      }
    );
    const { generateBookPdfs } = await import("@/lib/print-books/pdf");
    await generateBookPdfs({
      project,
      story: createStory(),
      profile: createProfile(),
    });
    return stored;
  }

  /**
   * Several text-only spreads in a row, so consecutive physical pages carry
   * text and both a recto and a verso can be compared. Art pages are omitted
   * deliberately: they hold no text, and a text/art alternation would only
   * ever land text on one side.
   */
  function createTextHeavyProject(): BookProject {
    const base = createProject();
    return {
      ...base,
      spreads: Array.from({ length: 4 }, (_, i) => ({
        id: `book-1:spread:${i + 1}`,
        bookProjectId: "book-1",
        sequence: i + 1,
        pageStart: i * 2 + 1,
        pageEnd: i * 2 + 2,
        layoutType: "text_art" as const,
        leftPageText: `Page ${i + 1}: Mila walked on through the moonlit garden.`,
        rightPageText: "",
        sceneBrief: `Scene ${i + 1}`,
        illustrationPrompt: `Scene ${i + 1}`,
        imageUrl: "data:image/svg+xml;base64,spread",
      })),
    };
  }

  it("insets text further on the binding edge, alternating by page side", async () => {
    process.env.STORYCOT_PRINT_PROVIDER = "lulu";
    const stored = await buildPdfs(createTextHeavyProject());
    const key = Object.keys(stored).find((k) => k.includes("lulu-print"));
    expect(key).toBeDefined();
    const bytes = stored[key!]!;

    const { POINTS_PER_INCH } = await import("@/lib/print-books/pdf/constants");
    const base = 0.625 * POINTS_PER_INCH;
    const gutter = 0.375 * POINTS_PER_INCH;

    const doc = await PDFDocument.load(bytes);
    let rectoMin: number | undefined;
    let versoMin: number | undefined;
    for (let i = 0; i < doc.getPageCount(); i += 1) {
      const xs = await getTextXPositions(bytes, i);
      if (!xs.length) continue;
      const min = Math.min(...xs);
      if ((i + 1) % 2 === 1) rectoMin ??= min;
      else versoMin ??= min;
    }

    // Recto binds on its left edge, so text starts a full gutter further in.
    expect(rectoMin).toBeCloseTo(base + gutter, 0);
    // Verso binds on its right edge, so the left side keeps the base margin.
    expect(versoMin).toBeCloseTo(base, 0);
  });

  it("keeps digital story text symmetric, since screens have no binding", async () => {
    process.env.STORYCOT_PRINT_PROVIDER = "lulu";
    const stored = await buildPdfs(createTextHeavyProject());
    const key = Object.keys(stored).find(
      (k) => k.endsWith("/print.pdf") && !k.includes("lulu")
    );
    expect(key).toBeDefined();
    const bytes = stored[key!]!;

    const { POINTS_PER_INCH } = await import("@/lib/print-books/pdf/constants");
    const base = 0.625 * POINTS_PER_INCH;

    // The digital build prepends a styled cover page, which has its own
    // (wider) layout and is not story text, so it is skipped.
    const doc = await PDFDocument.load(bytes);
    const storyPageMins: number[] = [];
    for (let i = 1; i < doc.getPageCount(); i += 1) {
      const xs = await getTextXPositions(bytes, i);
      if (xs.length) storyPageMins.push(Math.min(...xs));
    }

    expect(storyPageMins.length).toBeGreaterThan(1);
    // Every story page shares the same left margin: no alternating gutter.
    for (const min of storyPageMins) {
      expect(min).toBeCloseTo(base, 0);
    }
  });

  it("widens the base margin for books past Lulu's 60-page threshold", async () => {
    const { getLuluInteriorTextSafeMargin, POINTS_PER_INCH } = await import(
      "@/lib/print-books/pdf/constants"
    );
    expect(getLuluInteriorTextSafeMargin(32)).toBeCloseTo(0.625 * POINTS_PER_INCH, 3);
    expect(getLuluInteriorTextSafeMargin(60)).toBeCloseTo(0.625 * POINTS_PER_INCH, 3);
    // 72pp (young-reader-long) crosses into Lulu's 61-150 page band.
    expect(getLuluInteriorTextSafeMargin(72)).toBeCloseTo(0.75 * POINTS_PER_INCH, 3);
    expect(getLuluInteriorTextSafeMargin(200)).toBeCloseTo(1.125 * POINTS_PER_INCH, 3);
  });

  it("clears the coil punch bite even with adverse trim variance", async () => {
    const { LULU_SPINE_SIDE_EXTRA_MARGIN, POINTS_PER_INCH } = await import(
      "@/lib/print-books/pdf/constants"
    );
    const textFromTrimIn =
      0.625 - 0.125 + LULU_SPINE_SIDE_EXTRA_MARGIN / POINTS_PER_INCH;
    // Lulu: coil bites up to 0.375", plus up to 0.125" of trim variance.
    expect(textFromTrimIn).toBeGreaterThan(0.375 + 0.125);
  });
});
