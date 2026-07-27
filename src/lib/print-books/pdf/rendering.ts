import {
  PDFDocument,
  clip,
  endPath,
  popGraphicsState,
  pushGraphicsState,
  rectangle,
  rgb,
} from "pdf-lib";
import type { ChildProfile, Story, StoryPreset } from "@/types";
import type { BookProject, BookSpread } from "@/types/printBook";
import { BOOK_SPEC } from "@/lib/print-books/bookConfig";
import { BLEED, BRAND_PURPLE, BRAND_LILAC } from "./constants";
import {
  drawBrandWordmark,
  embedSpreadImage,
  getPageText,
  getSpreadArtUrl,
  isRasterHttpUrl,
} from "./assets";
import { drawWrappedText, fitWrappedTextToBox } from "./text";
import {
  drawPageBackground,
  drawThemeArtPanel,
  getPlaceholderVariant,
  pickPlaceholderTheme,
  type PlaceholderTheme,
} from "./placeholders";

export async function drawSpreadArtIntoRect(input: {
  pdfDoc: PDFDocument;
  page: ReturnType<PDFDocument["addPage"]>;
  spread: BookSpread;
  side: "start" | "end" | "cover";
  rect: { x: number; y: number; width: number; height: number };
  story: Story;
  variantSeed?: number;
  title?: string;
  subtitle?: string;
}) {
  const {
    pdfDoc,
    page,
    spread,
    side,
    rect,
    story,
    variantSeed = spread.sequence,
    title,
    subtitle,
  } = input;

  // Per-page square images take priority (new books). Fall back to shared spread image (legacy).
  const perPageUrl =
    side === "start"
      ? spread.leftPageImageUrl
      : side === "end"
        ? spread.rightPageImageUrl
        : undefined;
  const imageUrl = getSpreadArtUrl(spread, side);
  const image = await embedSpreadImage(pdfDoc, imageUrl, {
    maxDrawWidthPt:
      perPageUrl || side === "cover" ? rect.width : rect.width * 2,
    maxDrawHeightPt: rect.height,
  });

  if (image) {
    if (perPageUrl || side === "cover") {
      // Per-page square or explicit cover crop: fill rect edge-to-edge
      const scale = Math.max(
        rect.width / image.width,
        rect.height / image.height
      );
      const drawWidth = image.width * scale;
      const drawHeight = image.height * scale;
      page.pushOperators(
        pushGraphicsState(),
        rectangle(rect.x, rect.y, rect.width, rect.height),
        clip(),
        endPath()
      );
      page.drawImage(image, {
        x: rect.x + (rect.width - drawWidth) / 2,
        y: rect.y + (rect.height - drawHeight) / 2,
        width: drawWidth,
        height: drawHeight,
      });
      page.pushOperators(popGraphicsState());
      return;
    }

    // Legacy shared landscape image: span full spread, show left or right half
    const spreadWidth = rect.width * 2;
    const scale = Math.max(
      spreadWidth / image.width,
      rect.height / image.height
    );
    const drawWidth = image.width * scale;
    const drawHeight = image.height * scale;
    const spreadX = rect.x + (spreadWidth - drawWidth) / 2;
    const pageOffsetX = side === "start" ? 0 : -rect.width;
    page.pushOperators(
      pushGraphicsState(),
      rectangle(rect.x, rect.y, rect.width, rect.height),
      clip(),
      endPath()
    );
    page.drawImage(image, {
      x: spreadX + pageOffsetX,
      y: rect.y + (rect.height - drawHeight) / 2,
      width: drawWidth,
      height: drawHeight,
    });
    page.pushOperators(popGraphicsState());
    return;
  }

  drawThemeArtPanel({
    page,
    rect,
    theme: pickPlaceholderTheme(story),
    variant: getPlaceholderVariant(
      variantSeed + (side === "end" ? 1 : side === "cover" ? 2 : 0)
    ),
    title,
    subtitle,
  });
}

export async function drawHalfTitlePage(input: {
  pdfDoc: PDFDocument;
  page: ReturnType<PDFDocument["addPage"]>;
  pageWidth: number;
  pageHeight: number;
  story: Story;
  profile: ChildProfile;
  theme: PlaceholderTheme;
  serifBold: Awaited<ReturnType<PDFDocument["embedFont"]>>;
  serif: Awaited<ReturnType<PDFDocument["embedFont"]>>;
  sans: Awaited<ReturnType<PDFDocument["embedFont"]>>;
}) {
  const {
    pdfDoc,
    page,
    pageWidth,
    pageHeight,
    story,
    profile,
    theme,
    serifBold,
    serif,
    sans,
  } = input;
  drawPageBackground(page, pageWidth, pageHeight, theme.paper);
  await drawBrandWordmark({
    pdfDoc,
    page,
    variant: "dark",
    x: pageWidth / 2 - 76,
    y: pageHeight - 84,
    iconSize: 40,
    font: sans,
  });
  page.drawText(story.title, {
    x: pageWidth * 0.16,
    y: pageHeight * 0.58,
    font: serifBold,
    size: 28,
    color: theme.ink,
  });
  if (profile.name) {
    page.drawText(`For ${profile.name}`, {
      x: pageWidth * 0.16,
      y: pageHeight * 0.52,
      font: serif,
      size: 14,
      color: rgb(0.34, 0.35, 0.4),
    });
  }
  page.drawText("Personalised bedtime stories", {
    x: pageWidth * 0.16,
    y: pageHeight * 0.14,
    font: serif,
    size: 13,
    color: rgb(0.34, 0.35, 0.4),
  });
}

export async function drawFrontispiecePage(input: {
  pdfDoc: PDFDocument;
  page: ReturnType<PDFDocument["addPage"]>;
  spread: BookSpread;
  story: Story;
  pageWidth: number;
  pageHeight: number;
  sans: Awaited<ReturnType<PDFDocument["embedFont"]>>;
  branded?: boolean;
}) {
  const {
    pdfDoc,
    page,
    spread,
    story,
    pageWidth,
    pageHeight,
    sans,
    branded = false,
  } = input;
  const theme = pickPlaceholderTheme(story);
  drawPageBackground(page, pageWidth, pageHeight, theme.paper);
  const artRect = { x: 0, y: 0, width: pageWidth, height: pageHeight };
  await drawSpreadArtIntoRect({
    pdfDoc,
    page,
    spread,
    side: "cover",
    rect: artRect,
    story,
    variantSeed: spread.sequence + 20,
  });
  if (branded) {
    page.drawRectangle({
      x: 0,
      y: 0,
      width: pageWidth,
      height: 58,
      color: BRAND_PURPLE,
      opacity: 0.94,
    });
    await drawBrandWordmark({
      pdfDoc,
      page,
      variant: "light",
      x: 20,
      y: 14,
      iconSize: 32,
      font: sans,
    });
  }
}

export async function drawDigitalCoverPage(input: {
  pdfDoc: PDFDocument;
  page: ReturnType<PDFDocument["addPage"]>;
  project: BookProject;
  story: Story;
  profile: ChildProfile;
  pageWidth: number;
  pageHeight: number;
  serif: Awaited<ReturnType<PDFDocument["embedFont"]>>;
  serifBold: Awaited<ReturnType<PDFDocument["embedFont"]>>;
  sansBold: Awaited<ReturnType<PDFDocument["embedFont"]>>;
}) {
  const {
    pdfDoc,
    page,
    project,
    story,
    profile,
    pageWidth,
    pageHeight,
    serif,
    serifBold,
    sansBold,
  } = input;
  const theme = pickPlaceholderTheme(story);
  const safeMargin = BLEED + 45;
  const safeWidth = pageWidth - safeMargin * 2;

  // Background
  page.drawRectangle({
    x: 0,
    y: 0,
    width: pageWidth,
    height: pageHeight,
    color: theme.sky,
  });

  // Cover image — full-bleed, clipped to page. Prefer the print PNG; fall back
  // to the web JPEG when the PNG is missing or is still an SVG placeholder.
  const coverSpread = project.spreads.find(
    (s) => s.sequence === 1 || s.title === "Cover"
  );
  const rawCoverUrl = project.assets.coverImageUrl ?? coverSpread?.imageUrl;
  const coverImageUrl = isRasterHttpUrl(rawCoverUrl ?? "")
    ? rawCoverUrl
    : (project.assets.coverWebImageUrl ?? rawCoverUrl);
  const image = await embedSpreadImage(pdfDoc, coverImageUrl, {
    maxDrawWidthPt: pageWidth,
    maxDrawHeightPt: pageHeight,
  });
  if (image) {
    const scale = Math.max(pageWidth / image.width, pageHeight / image.height);
    const drawWidth = image.width * scale;
    const drawHeight = image.height * scale;
    page.pushOperators(
      pushGraphicsState(),
      rectangle(0, 0, pageWidth, pageHeight),
      clip(),
      endPath()
    );
    page.drawImage(image, {
      x: (pageWidth - drawWidth) / 2,
      y: (pageHeight - drawHeight) / 2,
      width: drawWidth,
      height: drawHeight,
    });
    page.pushOperators(popGraphicsState());
  } else {
    drawThemeArtPanel({
      page,
      rect: { x: 0, y: 0, width: pageWidth, height: pageHeight },
      theme,
      variant: 1,
    });
  }

  // Brand wordmark (top-left, light variant)
  await drawBrandWordmark({
    pdfDoc,
    page,
    variant: "light",
    x: safeMargin,
    y: pageHeight - safeMargin - 36,
    iconSize: 36,
    font: sansBold,
  });

  // Title band (lower third)
  const bandTop = pageHeight - safeMargin - 86;
  const bandHeight = 148;
  page.drawRectangle({
    x: safeMargin - 8,
    y: bandTop - bandHeight,
    width: safeWidth - 28,
    height: bandHeight,
    color: BRAND_PURPLE,
    opacity: image ? 0.52 : 0.82,
  });
  page.drawText(story.title, {
    x: safeMargin + 8,
    y: bandTop - 66,
    font: serifBold,
    size: 28,
    color: rgb(0.99, 0.96, 0.88),
  });
  page.drawText(`Created for ${profile.name}`, {
    x: safeMargin + 8,
    y: bandTop - 102,
    font: serif,
    size: 16,
    color: rgb(0.97, 0.92, 0.82),
  });
}

export async function drawTitlePage(input: {
  pdfDoc: PDFDocument;
  page: ReturnType<PDFDocument["addPage"]>;
  pageWidth: number;
  pageHeight: number;
  story: Story;
  profile: ChildProfile;
  theme: PlaceholderTheme;
  serifBold: Awaited<ReturnType<PDFDocument["embedFont"]>>;
  serif: Awaited<ReturnType<PDFDocument["embedFont"]>>;
  sans: Awaited<ReturnType<PDFDocument["embedFont"]>>;
}) {
  const {
    pdfDoc,
    page,
    pageWidth,
    pageHeight,
    story,
    profile,
    theme,
    serifBold,
    serif,
    sans,
  } = input;
  drawPageBackground(page, pageWidth, pageHeight, theme.paper);
  page.drawRectangle({
    x: 0,
    y: pageHeight * 0.78,
    width: pageWidth,
    height: pageHeight * 0.22,
    color: BRAND_PURPLE,
  });
  await drawBrandWordmark({
    pdfDoc,
    page,
    variant: "light",
    x: pageWidth * 0.14,
    y: pageHeight * 0.78 + 52,
    iconSize: 36,
    font: sans,
  });
  page.drawText(story.title, {
    x: pageWidth * 0.14,
    y: pageHeight * 0.56,
    font: serifBold,
    size: 30,
    color: theme.ink,
  });
  page.drawText(`Created for ${profile.name}`, {
    x: pageWidth * 0.14,
    y: pageHeight * 0.5,
    font: serif,
    size: 16,
    color: rgb(0.33, 0.34, 0.4),
  });
  page.drawText("Personalised bedtime stories made for home reading", {
    x: pageWidth * 0.14,
    y: pageHeight * 0.18,
    font: serif,
    size: 12,
    color: rgb(0.34, 0.35, 0.4),
  });
}

export async function drawCopyrightPage(input: {
  pdfDoc: PDFDocument;
  page: ReturnType<PDFDocument["addPage"]>;
  pageWidth: number;
  pageHeight: number;
  project: BookProject;
  serifBold: Awaited<ReturnType<PDFDocument["embedFont"]>>;
  serif: Awaited<ReturnType<PDFDocument["embedFont"]>>;
  sans: Awaited<ReturnType<PDFDocument["embedFont"]>>;
  sansBold: Awaited<ReturnType<PDFDocument["embedFont"]>>;
}) {
  const { pdfDoc, page, pageWidth, pageHeight, project, sans, sansBold } =
    input;
  drawPageBackground(page, pageWidth, pageHeight, rgb(0.99, 0.98, 0.95));
  await drawBrandWordmark({
    pdfDoc,
    page,
    variant: "dark",
    x: pageWidth * 0.12,
    y: pageHeight - 72,
    iconSize: 36,
    font: sansBold,
  });
  page.drawText(
    `Copyright © ${new Date(project.createdAt).getUTCFullYear()} Storycot`,
    {
      x: pageWidth * 0.12,
      y: pageHeight * 0.28,
      font: sansBold,
      size: 11,
      color: BRAND_PURPLE,
    }
  );
  page.drawText(BOOK_SPEC.trimLabel, {
    x: pageWidth * 0.12,
    y: pageHeight * 0.24,
    font: sans,
    size: 10,
    color: rgb(0.34, 0.35, 0.4),
  });
  page.drawText("storycot.com.au", {
    x: pageWidth * 0.12,
    y: pageHeight * 0.2,
    font: sansBold,
    size: 10,
    color: BRAND_LILAC,
  });
}

export function drawBlankPaddingPage(input: {
  page: ReturnType<PDFDocument["addPage"]>;
  pageWidth: number;
  pageHeight: number;
}) {
  const { page, pageWidth, pageHeight } = input;
  drawPageBackground(page, pageWidth, pageHeight);
}

export function getMaxTextBoxPt(preset?: StoryPreset): number {
  switch (preset) {
    case "tiny-tales":
      return 110; // ~3 lines — image-first for toddlers
    case "moonlit-adventures":
      return 155; // ~5 lines — balanced
    case "epic-sagas":
      return 200; // ~7 lines — text-forward for older kids
    default:
      return 155;
  }
}

export async function drawBookPage(input: {
  pdfDoc: PDFDocument;
  page: ReturnType<PDFDocument["addPage"]>;
  story: Story;
  spread: BookSpread;
  pageNumber: number;
  side: "start" | "end";
  pageWidth: number;
  pageHeight: number;
  textSafeMargin: number;
  artRect: { x: number; y: number; width: number; height: number };
  serif: Awaited<ReturnType<PDFDocument["embedFont"]>>;
  sans: Awaited<ReturnType<PDFDocument["embedFont"]>>;
}) {
  const {
    pdfDoc,
    page,
    story,
    spread,
    pageNumber,
    side,
    pageWidth,
    pageHeight,
    textSafeMargin,
    artRect,
    serif,
    sans,
  } = input;
  const theme = pickPlaceholderTheme(story);
  drawPageBackground(page, pageWidth, pageHeight, theme.paper);

  const text = getPageText(spread, side);

  await drawSpreadArtIntoRect({
    pdfDoc,
    page,
    spread,
    side,
    rect: artRect,
    story,
    variantSeed: spread.sequence * 2 + (side === "end" ? 1 : 0),
  });

  if (text) {
    const textRectWidth = pageWidth - textSafeMargin * 2;
    const textInnerWidth = textRectWidth - 48;
    const maxHeight = getMaxTextBoxPt(story.storyPreset);
    const fittedText = fitWrappedTextToBox({
      text,
      font: serif,
      maxWidth: textInnerWidth,
      maxHeight,
      paddingY: 54,
      preferredSize: 17,
      minSize: 9.5,
    });
    const minHeight = 80;
    const textRectHeight = Math.min(
      Math.max(minHeight, fittedText.lines.length * fittedText.lineHeight + 54),
      maxHeight
    );
    const textRect = {
      x: textSafeMargin,
      y: textSafeMargin,
      width: textRectWidth,
      height: textRectHeight,
    };
    page.drawRectangle({
      x: textRect.x,
      y: textRect.y,
      width: textRect.width,
      height: textRect.height,
      color: rgb(1, 0.985, 0.94),
      opacity: 0.94,
      borderColor: rgb(0.87, 0.82, 0.96),
      borderWidth: 1,
    });
    drawWrappedText({
      page,
      text,
      x: textRect.x + 24,
      topY: textRect.y + textRect.height - 34,
      maxWidth: textRect.width - 48,
      lineHeight: fittedText.lineHeight,
      font: serif,
      size: fittedText.size,
      color: theme.ink,
      align: "center",
      lines: fittedText.lines,
    });
  }

  if (pageNumber > 4) {
    const numStr = `${pageNumber}`;
    const numX = side === "start" ? 28 : pageWidth - 40;
    const numY = 20;
    for (const [dx, dy] of [
      [-1, -1],
      [0, -1],
      [1, -1],
      [-1, 0],
      [1, 0],
      [-1, 1],
      [0, 1],
      [1, 1],
    ] as const) {
      page.drawText(numStr, {
        x: numX + dx,
        y: numY + dy,
        font: sans,
        size: 10,
        color: rgb(0, 0, 0),
        opacity: 0.82,
      });
    }
    page.drawText(numStr, {
      x: numX,
      y: numY,
      font: sans,
      size: 10,
      color: rgb(0.99, 0.96, 0.88),
    });
  }
}

export function getCombinedPageText(spread: BookSpread) {
  return [spread.leftPageText, spread.rightPageText]
    .map((text) => text.replace(/\s+/g, " ").trim())
    .filter(Boolean)
    .join("\n\n");
}

export function getTextPageDisplayText(spread: BookSpread) {
  const text = getCombinedPageText(spread);
  if (spread.title !== "The End") return text;
  return text.replace(/^The End\.?\s*/i, "").trim();
}

export function hasTextPageContent(spread: BookSpread) {
  return Boolean(spread.title || getTextPageDisplayText(spread));
}

export async function drawLuluTextPage(input: {
  pdfDoc: PDFDocument;
  page: ReturnType<PDFDocument["addPage"]>;
  story: Story;
  spread: BookSpread;
  pageWidth: number;
  pageHeight: number;
  textSafeMargin: number;
  serif: Awaited<ReturnType<PDFDocument["embedFont"]>>;
  serifBold: Awaited<ReturnType<PDFDocument["embedFont"]>>;
  sans: Awaited<ReturnType<PDFDocument["embedFont"]>>;
  pageNumber: number;
}) {
  const {
    pdfDoc,
    page,
    story,
    spread,
    pageWidth,
    pageHeight,
    textSafeMargin,
    serif,
    sans,
    pageNumber,
  } = input;
  const theme = pickPlaceholderTheme(story);
  drawPageBackground(page, pageWidth, pageHeight, theme.paper);

  const brandIconSize = 28;
  await drawBrandWordmark({
    pdfDoc,
    page,
    variant: "dark",
    x: textSafeMargin,
    y: pageHeight - textSafeMargin - brandIconSize,
    iconSize: brandIconSize,
    font: sans,
  });

  const text = getTextPageDisplayText(spread);
  const textWidth = pageWidth - textSafeMargin * 2;

  if (text) {
    const availableTop = pageHeight - textSafeMargin - brandIconSize - 24;
    const availableBottom = textSafeMargin + 28;
    const availableHeight = availableTop - availableBottom;

    const fittedText = fitWrappedTextToBox({
      text,
      font: serif,
      maxWidth: textWidth,
      maxHeight: availableHeight,
      paddingY: 0,
      preferredSize: 26,
      minSize: 16,
    });

    const textBlockHeight = fittedText.lines.length * fittedText.lineHeight;
    const centeredTopY =
      availableBottom + (availableHeight + textBlockHeight) / 2;

    drawWrappedText({
      page,
      text,
      x: textSafeMargin,
      topY: centeredTopY,
      maxWidth: textWidth,
      lineHeight: fittedText.lineHeight,
      font: serif,
      size: fittedText.size,
      color: theme.ink,
      lines: fittedText.lines,
    });
  }

  page.drawText(`${pageNumber}`, {
    x: pageWidth - textSafeMargin,
    y: 28,
    font: sans,
    size: 10,
    color: rgb(0.42, 0.4, 0.48),
  });
}

export async function drawLuluArtPage(input: {
  pdfDoc: PDFDocument;
  page: ReturnType<PDFDocument["addPage"]>;
  story: Story;
  spread: BookSpread;
  side: "start" | "end";
  pageWidth: number;
  pageHeight: number;
  pageNumber: number;
  sans: Awaited<ReturnType<PDFDocument["embedFont"]>>;
}) {
  const { pdfDoc, page, story, spread, side, pageWidth, pageHeight, sans } =
    input;
  drawPageBackground(
    page,
    pageWidth,
    pageHeight,
    pickPlaceholderTheme(story).paper
  );
  await drawSpreadArtIntoRect({
    pdfDoc,
    page,
    spread,
    side,
    rect: { x: 0, y: 0, width: pageWidth, height: pageHeight },
    story,
    variantSeed: spread.sequence * 2 + (side === "end" ? 1 : 0),
  });
  page.drawText(`${input.pageNumber}`, {
    x: pageWidth - 40,
    y: 20,
    font: sans,
    size: 10,
    color: rgb(0.99, 0.96, 0.88),
  });
}
