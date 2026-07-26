import {
  PDFDocument,
  clip,
  degrees,
  endPath,
  popGraphicsState,
  pushGraphicsState,
  rectangle,
  rgb,
} from "pdf-lib";
import type { ChildProfile, Story } from "@/types";
import type { BookProject } from "@/types/printBook";
import {
  BOOK_SPEC,
  BOOK_PDF_PAGE_WIDTH_IN,
  BOOK_PDF_PAGE_HEIGHT_IN,
  getBookSpineWidthIn,
} from "@/lib/print-books/bookConfig";
import {
  LULU_HARDCOVER_CASEWRAP_WRAP_IN,
  LULU_HARDCOVER_COVER_PAGE_HEIGHT_IN,
  LULU_HARDCOVER_COVER_PAGE_WIDTH_IN,
  LULU_HARDCOVER_COVER_SPINE_WIDTH_IN,
  LULU_HARDCOVER_MIN_PAGES,
  LULU_INTERIOR_PDF_PAGE_HEIGHT_IN,
  LULU_INTERIOR_PDF_PAGE_WIDTH_IN,
} from "@/lib/print-books/lulu";
import { storeBookAsset } from "@/lib/print-books/storage";
import {
  BLEED,
  BRAND_LILAC,
  BRAND_PURPLE,
  LULU_COVER_PDF_GEOMETRY,
  LULU_PDF_GEOMETRY,
  POINTS_PER_INCH,
  STORYCOT_PDF_GEOMETRY,
  type PdfPageGeometry,
} from "./constants";
import { loadEmbeddedPdfFonts } from "./fonts";
import {
  drawBrandWordmark,
  embedSpreadImage,
  hasPrintableArt,
  isRasterHttpUrl,
} from "./assets";
import { clampText, drawWrappedText } from "./text";
import { drawThemeArtPanel, pickPlaceholderTheme } from "./placeholders";
import {
  drawBlankPaddingPage,
  drawBookPage,
  drawCopyrightPage,
  drawDigitalCoverPage,
  drawFrontispiecePage,
  drawHalfTitlePage,
  drawLuluArtPage,
  drawLuluTextPage,
  drawTitlePage,
  hasTextPageContent,
} from "./rendering";

async function buildPrintPdf(input: {
  project: BookProject;
  story: Story;
  profile: ChildProfile;
  geometry?: PdfPageGeometry;
  minPageCount?: number;
  includeCoverFrontMatter?: boolean;
  includeCoverPage?: boolean;
  textArtInterior?: boolean;
}): Promise<Uint8Array> {
  const geometry = input.geometry ?? STORYCOT_PDF_GEOMETRY;
  const { pageWidth, pageHeight, textSafeMargin } = geometry;
  const includeCoverFrontMatter = input.includeCoverFrontMatter ?? true;
  const pdfDoc = await PDFDocument.create();
  const { serif, serifBold, sans, sansBold } =
    await loadEmbeddedPdfFonts(pdfDoc);
  const theme = pickPlaceholderTheme(input.story);

  // Add a styled cover page (mirrors the Lulu front panel) as page 1 of the digital PDF.
  if (input.includeCoverPage) {
    const coverPage = pdfDoc.addPage([pageWidth, pageHeight]);
    await drawDigitalCoverPage({
      pdfDoc,
      page: coverPage,
      project: input.project,
      story: input.story,
      profile: input.profile,
      pageWidth,
      pageHeight,
      serif,
      serifBold,
      sansBold,
    });
  }

  for (const spread of input.project.spreads) {
    if (spread.title === "Cover") {
      if (!includeCoverFrontMatter) continue;

      const halfTitlePage = pdfDoc.addPage([pageWidth, pageHeight]);
      await drawHalfTitlePage({
        pdfDoc,
        page: halfTitlePage,
        pageWidth,
        pageHeight,
        story: input.story,
        profile: input.profile,
        theme,
        serifBold,
        serif,
        sans,
      });

      const frontispiecePage = pdfDoc.addPage([pageWidth, pageHeight]);
      await drawFrontispiecePage({
        pdfDoc,
        page: frontispiecePage,
        spread,
        story: input.story,
        pageWidth,
        pageHeight,
        sans,
      });
      continue;
    }

    if (spread.title === "Title") {
      const titlePage = pdfDoc.addPage([pageWidth, pageHeight]);
      await drawTitlePage({
        pdfDoc,
        page: titlePage,
        pageWidth,
        pageHeight,
        story: input.story,
        profile: input.profile,
        theme,
        serifBold,
        serif,
        sans,
      });

      const copyrightPage = pdfDoc.addPage([pageWidth, pageHeight]);
      await drawCopyrightPage({
        pdfDoc,
        page: copyrightPage,
        pageWidth,
        pageHeight,
        project: input.project,
        serifBold,
        serif,
        sans,
        sansBold,
      });
      continue;
    }

    if (spread.title === "Back Cover") {
      continue;
    }

    if (input.textArtInterior) {
      if (hasTextPageContent(spread)) {
        const textPage = pdfDoc.addPage([pageWidth, pageHeight]);
        await drawLuluTextPage({
          pdfDoc,
          page: textPage,
          story: input.story,
          spread,
          pageWidth,
          pageHeight,
          textSafeMargin,
          serif,
          serifBold,
          sans,
          pageNumber: pdfDoc.getPageCount(),
        });
      }

      if (
        (spread.layoutType === "text_art" ||
          spread.layoutType === "hero" ||
          spread.layoutType === "quiet") &&
        hasPrintableArt(spread, "start")
      ) {
        const startArtPage = pdfDoc.addPage([pageWidth, pageHeight]);
        await drawLuluArtPage({
          pdfDoc,
          page: startArtPage,
          story: input.story,
          spread,
          side: "start",
          pageWidth,
          pageHeight,
          pageNumber: pdfDoc.getPageCount(),
          sans,
        });
      }

      continue;
    }

    const startPage = pdfDoc.addPage([pageWidth, pageHeight]);
    await drawBookPage({
      pdfDoc,
      page: startPage,
      story: input.story,
      spread,
      pageNumber: spread.pageStart,
      side: "start",
      pageWidth,
      pageHeight,
      textSafeMargin,
      artRect: {
        x: 0,
        y: 0,
        width: pageWidth,
        height: pageHeight,
      },
      serif,
      sans,
    });

    const endPage = pdfDoc.addPage([pageWidth, pageHeight]);
    await drawBookPage({
      pdfDoc,
      page: endPage,
      story: input.story,
      spread,
      pageNumber: spread.pageEnd,
      side: "end",
      pageWidth,
      pageHeight,
      textSafeMargin,
      artRect: {
        x: 0,
        y: 0,
        width: pageWidth,
        height: pageHeight,
      },
      serif,
      sans,
    });
  }

  while (input.minPageCount && pdfDoc.getPageCount() < input.minPageCount) {
    const page = pdfDoc.addPage([pageWidth, pageHeight]);
    drawBlankPaddingPage({ page, pageWidth, pageHeight });
  }

  return pdfDoc.save({ useObjectStreams: false });
}

async function buildCoverPdf(input: {
  project: BookProject;
  story: Story;
  profile: ChildProfile;
  geometry?: PdfPageGeometry;
  spineWidthIn?: number;
}): Promise<Uint8Array> {
  const geometry = input.geometry ?? STORYCOT_PDF_GEOMETRY;
  const { pageWidth, pageHeight } = geometry;
  const pdfDoc = await PDFDocument.create();
  const { serif, serifBold, sans, sansBold } =
    await loadEmbeddedPdfFonts(pdfDoc);
  const theme = pickPlaceholderTheme(input.story);
  const spine = getBookSpineWidthIn(input.project.pageCount);
  const spineWidthIn = input.spineWidthIn ?? spine.widthIn;
  const coverSpineWidth = spineWidthIn * POINTS_PER_INCH;
  const coverTotalWidth = pageWidth * 2 + coverSpineWidth;
  const page = pdfDoc.addPage([coverTotalWidth, pageHeight]);
  const coverSpread = input.project.spreads.find(
    (spread) => spread.sequence === 1
  );
  const rawLuluCoverUrl =
    input.project.assets.coverImageUrl || coverSpread?.imageUrl;
  const luluCoverUrl = isRasterHttpUrl(rawLuluCoverUrl ?? "")
    ? rawLuluCoverUrl
    : (input.project.assets.coverWebImageUrl ?? rawLuluCoverUrl);
  const image = await embedSpreadImage(pdfDoc, luluCoverUrl, {
    maxDrawWidthPt: pageWidth,
    maxDrawHeightPt: pageHeight,
  });
  const backCoverX = 0;
  const spineX = pageWidth;
  const frontCoverX = pageWidth + coverSpineWidth;

  // For Lulu hardcover casewrap the cover sheet is larger than the trim on all
  // four sides — the extra paper folds over the board. Content inside the wrap
  // area will be hidden or distorted. Use the Lulu-specific constant when the
  // page is taller than the Storycot-only bleed sheet; fall back to bleed only.
  const isLuluCover =
    pageHeight >= LULU_HARDCOVER_COVER_PAGE_HEIGHT_IN * POINTS_PER_INCH - 1;
  const wrap = isLuluCover
    ? LULU_HARDCOVER_CASEWRAP_WRAP_IN * POINTS_PER_INCH // 0.875" = 63pt
    : BLEED; // Storycot: just the bleed
  const coverSafeY = wrap + 45; // 45pt safety from the fold line
  const coverSafeX = wrap + 45; // same margin applies horizontally

  // Horizontal safe edge for content: outer left (back) and outer right (front)
  const backSafeX = backCoverX + coverSafeX;
  const frontSafeX = frontCoverX + coverSafeX;
  const frontSafeWidth = pageWidth - coverSafeX * 2;

  page.drawRectangle({
    x: 0,
    y: 0,
    width: coverTotalWidth,
    height: pageHeight,
    color: theme.sky,
  });

  page.drawRectangle({
    x: backCoverX,
    y: 0,
    width: pageWidth,
    height: pageHeight,
    color: theme.paper,
  });

  page.drawRectangle({
    x: spineX,
    y: 0,
    width: coverSpineWidth,
    height: pageHeight,
    color: theme.groundAccent,
  });

  // Use the generated "Back Cover" spread art on the physical back cover.
  // Falls back to the plain paper panel when there's no raster image (e.g.
  // placeholder/preview mode, where the asset is an SVG we can't embed).
  const backCoverSpread = input.project.spreads.find(
    (spread) => spread.title === "Back Cover"
  );
  const backImage = await embedSpreadImage(
    pdfDoc,
    backCoverSpread?.leftPageImageUrl ??
      backCoverSpread?.rightPageImageUrl ??
      backCoverSpread?.imageUrl,
    { maxDrawWidthPt: pageWidth, maxDrawHeightPt: pageHeight }
  );
  if (backImage) {
    const backScale = Math.max(
      pageWidth / backImage.width,
      pageHeight / backImage.height
    );
    const backDrawWidth = backImage.width * backScale;
    const backDrawHeight = backImage.height * backScale;
    page.pushOperators(
      pushGraphicsState(),
      rectangle(backCoverX, 0, pageWidth, pageHeight),
      clip(),
      endPath()
    );
    page.drawImage(backImage, {
      x: backCoverX + (pageWidth - backDrawWidth) / 2,
      y: (pageHeight - backDrawHeight) / 2,
      width: backDrawWidth,
      height: backDrawHeight,
    });
    page.pushOperators(popGraphicsState());
    // Soft paper scrim so the dark blurb text stays legible over the art.
    page.drawRectangle({
      x: backSafeX,
      y: pageHeight - coverSafeY - 300,
      width: pageWidth - coverSafeX * 2,
      height: 216,
      color: theme.paper,
      opacity: 0.86,
    });
  }

  if (image) {
    const scale = Math.max(pageWidth / image.width, pageHeight / image.height);
    const drawWidth = image.width * scale;
    const drawHeight = image.height * scale;
    page.drawImage(image, {
      x: frontCoverX + (pageWidth - drawWidth) / 2,
      y: (pageHeight - drawHeight) / 2,
      width: drawWidth,
      height: drawHeight,
    });
  } else {
    drawThemeArtPanel({
      page,
      rect: {
        x: frontCoverX,
        y: 0,
        width: pageWidth,
        height: pageHeight,
      },
      theme,
      variant: 1,
    });
  }

  await drawBrandWordmark({
    pdfDoc,
    page,
    variant: "light",
    x: frontSafeX,
    y: pageHeight - coverSafeY - 36,
    iconSize: 36,
    font: sansBold,
  });

  const titleBandTop = pageHeight - coverSafeY - 86;
  const titleBandHeight = 148;
  // Pull the band 36pt inside the right safe edge so there's visual breathing room
  const titleBandWidth = frontSafeWidth - 28;
  page.drawRectangle({
    x: frontSafeX - 8,
    y: titleBandTop - titleBandHeight,
    width: titleBandWidth,
    height: titleBandHeight,
    color: BRAND_PURPLE,
    opacity: image ? 0.48 : 0.82,
  });
  page.drawText(input.story.title, {
    x: frontSafeX + 8,
    y: titleBandTop - 66,
    font: serifBold,
    size: 28,
    color: rgb(0.99, 0.96, 0.88),
  });
  page.drawText(`Created for ${input.profile.name}`, {
    x: frontSafeX + 8,
    y: titleBandTop - 102,
    font: serif,
    size: 16,
    color: rgb(0.97, 0.92, 0.82),
  });

  const backBlurbTop = pageHeight - coverSafeY - 116;
  page.drawText("A personalised story from Storycot", {
    x: backSafeX,
    y: backBlurbTop,
    font: sansBold,
    size: 13,
    color: theme.ink,
  });
  drawWrappedText({
    page,
    text: clampText(
      input.story.pages.map((storyPage) => storyPage.text).join(" "),
      360
    ),
    x: backSafeX,
    topY: backBlurbTop - 32,
    maxWidth: pageWidth - coverSafeX * 2,
    lineHeight: 18,
    font: serif,
    size: 12,
    color: rgb(0.24, 0.26, 0.32),
  });

  const footerY = coverSafeY + 56;
  page.drawRectangle({
    x: backSafeX,
    y: footerY,
    width: pageWidth - coverSafeX * 2,
    height: 110,
    color: rgb(1, 1, 1),
    opacity: 0.74,
  });
  page.drawText("Personalised for bedtime reading", {
    x: backSafeX + 16,
    y: footerY + 82,
    font: sansBold,
    size: 11,
    color: theme.skyAccent,
  });
  page.drawText(BOOK_SPEC.trimLabel, {
    x: backSafeX + 16,
    y: footerY + 62,
    font: sans,
    size: 10,
    color: rgb(0.34, 0.35, 0.4),
  });
  page.drawText("Create your own at storycot.com", {
    x: backSafeX + 16,
    y: footerY + 40,
    font: sansBold,
    size: 10,
    color: BRAND_LILAC,
  });

  if (input.project.pageCount >= BOOK_SPEC.spineTextMinPageCount) {
    page.drawText("Storycot", {
      x: spineX + coverSpineWidth / 2 - 20,
      y: pageHeight / 2 - 18,
      font: sansBold,
      size: 10,
      color: rgb(0.95, 0.93, 0.87),
      rotate: degrees(90),
    });

    page.drawText(clampText(input.story.title, 36), {
      x: spineX + coverSpineWidth / 2 - 10,
      y: pageHeight / 2 - 72,
      font: sansBold,
      size: 9,
      color: rgb(0.95, 0.93, 0.87),
      rotate: degrees(90),
    });
  }

  return pdfDoc.save({ useObjectStreams: false });
}

export async function generateBookPdfs(input: {
  project: BookProject;
  story: Story;
  profile: ChildProfile;
}): Promise<{
  coverPdfUrl: string;
  coverPdfReadyForOrdering: boolean;
  coverPdfSpineWidthIn: number;
  coverPdfSpineSource: "configured" | "storycot_estimate";
  coverPdfPageWidthIn: number;
  coverPdfPageHeightIn: number;
  coverSpineTextIncluded: boolean;
  printPdfUrl: string;
  printPdfPageWidthIn: number;
  printPdfPageHeightIn: number;
  luluCoverPdfUrl?: string;
  luluCoverPdfPageWidthIn?: number;
  luluCoverPdfPageHeightIn?: number;
  luluCoverPdfSpineWidthIn?: number;
  luluPrintPdfUrl?: string;
  luluPrintPdfPageWidthIn?: number;
  luluPrintPdfPageHeightIn?: number;
  luluPrintPdfPageCount?: number;
  interiorTextSafeMarginIn: number;
  previewImages: string[];
}> {
  const coverSpine = getBookSpineWidthIn(input.project.pageCount);
  const coverBytes = await buildCoverPdf(input);
  const printBytes = await buildPrintPdf({
    ...input,
    includeCoverFrontMatter: false,
    includeCoverPage: true,
    textArtInterior: true,
  });
  const shouldGenerateLuluPdfs = process.env.STORYCOT_PRINT_PROVIDER === "lulu";
  const luluPrintBytes = shouldGenerateLuluPdfs
    ? await buildPrintPdf({
        ...input,
        geometry: LULU_PDF_GEOMETRY,
        minPageCount: LULU_HARDCOVER_MIN_PAGES,
        includeCoverFrontMatter: false,
        textArtInterior: true,
      })
    : undefined;
  const luluPrintPdfPageCount = luluPrintBytes
    ? (await PDFDocument.load(luluPrintBytes)).getPageCount()
    : undefined;
  const luluSpineWidthIn = LULU_HARDCOVER_COVER_SPINE_WIDTH_IN;

  const coverPdfUrl = await storeBookAsset({
    pathname: `books/${input.project.id}/cover.pdf`,
    body: Buffer.from(coverBytes),
    contentType: "application/pdf",
  });
  const printPdfUrl = await storeBookAsset({
    pathname: `books/${input.project.id}/print.pdf`,
    body: Buffer.from(printBytes),
    contentType: "application/pdf",
  });
  const luluCoverPdfUrl = shouldGenerateLuluPdfs
    ? await storeBookAsset({
        pathname: `books/${input.project.id}/lulu-cover.pdf`,
        body: Buffer.from(
          await buildCoverPdf({
            ...input,
            geometry: LULU_COVER_PDF_GEOMETRY,
            spineWidthIn: luluSpineWidthIn,
          })
        ),
        contentType: "application/pdf",
      })
    : undefined;
  const luluPrintPdfUrl = luluPrintBytes
    ? await storeBookAsset({
        pathname: `books/${input.project.id}/lulu-print.pdf`,
        body: Buffer.from(luluPrintBytes),
        contentType: "application/pdf",
      })
    : undefined;

  return {
    coverPdfUrl,
    coverPdfReadyForOrdering: true,
    coverPdfSpineWidthIn: coverSpine.widthIn,
    coverPdfSpineSource: coverSpine.source,
    coverPdfPageWidthIn: Number(
      (BOOK_PDF_PAGE_WIDTH_IN * 2 + coverSpine.widthIn).toFixed(3)
    ),
    coverPdfPageHeightIn: BOOK_PDF_PAGE_HEIGHT_IN,
    coverSpineTextIncluded:
      input.project.pageCount >= BOOK_SPEC.spineTextMinPageCount,
    printPdfUrl,
    printPdfPageWidthIn: BOOK_PDF_PAGE_WIDTH_IN,
    printPdfPageHeightIn: BOOK_PDF_PAGE_HEIGHT_IN,
    luluCoverPdfUrl,
    luluCoverPdfPageWidthIn: shouldGenerateLuluPdfs
      ? LULU_HARDCOVER_COVER_PAGE_WIDTH_IN
      : undefined,
    luluCoverPdfPageHeightIn: shouldGenerateLuluPdfs
      ? LULU_HARDCOVER_COVER_PAGE_HEIGHT_IN
      : undefined,
    luluCoverPdfSpineWidthIn: shouldGenerateLuluPdfs
      ? luluSpineWidthIn
      : undefined,
    luluPrintPdfUrl,
    luluPrintPdfPageWidthIn: shouldGenerateLuluPdfs
      ? LULU_INTERIOR_PDF_PAGE_WIDTH_IN
      : undefined,
    luluPrintPdfPageHeightIn: shouldGenerateLuluPdfs
      ? LULU_INTERIOR_PDF_PAGE_HEIGHT_IN
      : undefined,
    luluPrintPdfPageCount,
    interiorTextSafeMarginIn: BOOK_SPEC.fullBleedTextSafeMarginIn,
    previewImages: input.project.spreads
      .map((spread) => spread.leftPageImageUrl ?? spread.imageUrl)
      .filter(
        (url): url is string => typeof url === "string" && url.length > 0
      ),
  };
}
