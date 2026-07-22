import { readFile } from "fs/promises";
import path from "path";
import {
  PDFDocument,
  StandardFonts,
  clip,
  degrees,
  endPath,
  popGraphicsState,
  pushGraphicsState,
  rectangle,
  rgb,
} from "pdf-lib";
import type { ChildProfile, Story, StoryPreset } from "@/types";
import type { BookProject, BookSpread } from "@/types/printBook";
import {
  BOOK_SPEC,
  BOOK_PDF_PAGE_WIDTH_IN,
  BOOK_PDF_PAGE_HEIGHT_IN,
  getBookSpineWidthIn,
} from "@/lib/print-books/bookConfig";
import {
  LULU_HARDCOVER_MIN_PAGES,
  LULU_INTERIOR_PDF_PAGE_HEIGHT_IN,
  LULU_INTERIOR_PDF_PAGE_WIDTH_IN,
} from "@/lib/print-books/lulu";
import { storeBookAsset } from "@/lib/print-books/storage";

const POINTS_PER_INCH = 72;
const PRINT_PAGE_WIDTH = BOOK_PDF_PAGE_WIDTH_IN * POINTS_PER_INCH;
const PRINT_PAGE_HEIGHT = BOOK_PDF_PAGE_HEIGHT_IN * POINTS_PER_INCH;
const BLEED = BOOK_SPEC.bleedIn * POINTS_PER_INCH;
const FULL_BLEED_TEXT_SAFE_MARGIN =
  BOOK_SPEC.fullBleedTextSafeMarginIn * POINTS_PER_INCH;
const BRAND_PURPLE = rgb(0.17, 0.13, 0.39);
const BRAND_LILAC = rgb(0.53, 0.46, 0.9);

type PdfPageGeometry = {
  pageWidth: number;
  pageHeight: number;
  textSafeMargin: number;
};

const STORYCOT_PDF_GEOMETRY: PdfPageGeometry = {
  pageWidth: PRINT_PAGE_WIDTH,
  pageHeight: PRINT_PAGE_HEIGHT,
  textSafeMargin: FULL_BLEED_TEXT_SAFE_MARGIN,
};

const LULU_PDF_GEOMETRY: PdfPageGeometry = {
  pageWidth: LULU_INTERIOR_PDF_PAGE_WIDTH_IN * POINTS_PER_INCH,
  pageHeight: LULU_INTERIOR_PDF_PAGE_HEIGHT_IN * POINTS_PER_INCH,
  textSafeMargin: FULL_BLEED_TEXT_SAFE_MARGIN,
};

let lightLogoBytes: Uint8Array | null = null;
let darkLogoBytes: Uint8Array | null = null;

type PlaceholderTheme = {
  sky: ReturnType<typeof rgb>;
  skyAccent: ReturnType<typeof rgb>;
  ground: ReturnType<typeof rgb>;
  groundAccent: ReturnType<typeof rgb>;
  moon: ReturnType<typeof rgb>;
  ink: ReturnType<typeof rgb>;
  paper: ReturnType<typeof rgb>;
  accent: ReturnType<typeof rgb>;
  motif: "ocean" | "garden" | "night" | "adventure";
};

type PlaceholderVariant = 0 | 1 | 2;

function sanitizeText(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

function clampText(value: string, maxLength: number): string {
  if (value.length <= maxLength) return value;
  return `${value.slice(0, maxLength - 1).trimEnd()}…`;
}

function wrapTextToWidth(input: {
  text: string;
  font: Awaited<ReturnType<PDFDocument["embedFont"]>>;
  size: number;
  maxWidth: number;
}): string[] {
  const { text, font, size, maxWidth } = input;
  const words = sanitizeText(text).split(" ").filter(Boolean);
  if (words.length === 0) return [];

  const lines: string[] = [];
  let current = "";

  for (const word of words) {
    const candidate = current ? `${current} ${word}` : word;
    if (font.widthOfTextAtSize(candidate, size) <= maxWidth) {
      current = candidate;
      continue;
    }

    if (current) lines.push(current);
    current = word;
  }

  if (current) lines.push(current);
  return lines;
}

function truncateTextToWidth(input: {
  text: string;
  font: Awaited<ReturnType<PDFDocument["embedFont"]>>;
  size: number;
  maxWidth: number;
}): string {
  const { text, font, size, maxWidth } = input;
  if (font.widthOfTextAtSize(text, size) <= maxWidth) return text;

  let truncated = text;
  while (
    truncated.length > 0 &&
    font.widthOfTextAtSize(`${truncated.trimEnd()}...`, size) > maxWidth
  ) {
    truncated = truncated.slice(0, -1);
  }

  return `${truncated.trimEnd()}...`;
}

export function fitWrappedTextToBox(input: {
  text: string;
  font: Awaited<ReturnType<PDFDocument["embedFont"]>>;
  maxWidth: number;
  maxHeight: number;
  paddingY: number;
  preferredSize: number;
  minSize: number;
}) {
  const { text, font, maxWidth, maxHeight, paddingY, preferredSize, minSize } =
    input;
  const sizes: number[] = [];
  for (let size = preferredSize; size >= minSize; size -= 0.5) {
    sizes.push(size);
  }

  for (const size of sizes) {
    const lineHeight = Math.ceil(size * 1.28);
    const lines = wrapTextToWidth({ text, font, size, maxWidth });
    if (lines.length * lineHeight + paddingY <= maxHeight) {
      return { lines, size, lineHeight, truncated: false };
    }
  }

  const size = minSize;
  const lineHeight = Math.ceil(size * 1.28);
  const maxLines = Math.max(1, Math.floor((maxHeight - paddingY) / lineHeight));
  const lines = wrapTextToWidth({ text, font, size, maxWidth }).slice(
    0,
    maxLines
  );
  if (lines.length > 0) {
    lines[lines.length - 1] = truncateTextToWidth({
      text: lines[lines.length - 1],
      font,
      size,
      maxWidth,
    });
  }

  return { lines, size, lineHeight, truncated: true };
}

function drawWrappedText(input: {
  page: ReturnType<PDFDocument["addPage"]>;
  text: string;
  x: number;
  topY: number;
  maxWidth: number;
  lineHeight: number;
  font: Awaited<ReturnType<PDFDocument["embedFont"]>>;
  size: number;
  color?: ReturnType<typeof rgb>;
  align?: "left" | "center";
  shadow?: boolean;
  maxLines?: number;
  lines?: string[];
}) {
  const {
    page,
    text,
    x,
    topY,
    maxWidth,
    lineHeight,
    font,
    size,
    color = rgb(0.15, 0.18, 0.24),
    align = "left",
    shadow = false,
    maxLines,
    lines: inputLines,
  } = input;
  const allLines =
    inputLines ?? wrapTextToWidth({ text, font, size, maxWidth });
  const lines = maxLines != null ? allLines.slice(0, maxLines) : allLines;
  lines.forEach((line, index) => {
    const lineX =
      align === "center"
        ? x + (maxWidth - font.widthOfTextAtSize(line, size)) / 2
        : x;
    const lineY = topY - index * lineHeight;
    if (shadow) {
      for (const [dx, dy] of [
        [-1, -1],
        [0, -1],
        [1, -1],
        [-1, 0],
        [1, 0],
        [-1, 1],
        [0, 1],
        [1, 1],
      ]) {
        page.drawText(line, {
          x: lineX + dx,
          y: lineY + dy,
          font,
          size,
          color: rgb(0, 0, 0),
          opacity: 0.82,
        });
      }
    }
    page.drawText(line, { x: lineX, y: lineY, font, size, color });
  });
  return lines.length;
}

function pickPlaceholderTheme(story: Story): PlaceholderTheme {
  const source =
    `${story.title} ${story.theme || ""} ${story.pages.map((page) => page.text).join(" ")} ${story.pages.map((page) => page.illustrationPrompt || "").join(" ")}`.toLowerCase();

  if (/(wave|ocean|sea|beach|shore|sand|pebble|shell|tide)/.test(source)) {
    return {
      sky: rgb(0.14, 0.2, 0.41),
      skyAccent: rgb(0.36, 0.38, 0.66),
      ground: rgb(0.15, 0.31, 0.54),
      groundAccent: rgb(0.1, 0.21, 0.39),
      moon: rgb(0.99, 0.94, 0.74),
      ink: rgb(0.15, 0.18, 0.24),
      paper: rgb(1, 0.99, 0.97),
      accent: rgb(0.96, 0.8, 0.41),
      motif: "ocean",
    };
  }

  if (
    /(garden|flower|forest|tree|leaf|meadow|field|fox|rabbit|bunny)/.test(
      source
    )
  ) {
    return {
      sky: rgb(0.18, 0.29, 0.34),
      skyAccent: rgb(0.39, 0.52, 0.43),
      ground: rgb(0.21, 0.38, 0.28),
      groundAccent: rgb(0.16, 0.28, 0.21),
      moon: rgb(0.98, 0.94, 0.75),
      ink: rgb(0.15, 0.18, 0.2),
      paper: rgb(1, 0.99, 0.97),
      accent: rgb(0.95, 0.79, 0.41),
      motif: "garden",
    };
  }

  if (/(moon|star|night|sleep|dream|sky|cloud)/.test(source)) {
    return {
      sky: rgb(0.13, 0.15, 0.33),
      skyAccent: rgb(0.32, 0.35, 0.62),
      ground: rgb(0.18, 0.28, 0.49),
      groundAccent: rgb(0.12, 0.2, 0.37),
      moon: rgb(1, 0.95, 0.78),
      ink: rgb(0.15, 0.17, 0.23),
      paper: rgb(1, 0.99, 0.97),
      accent: rgb(0.96, 0.81, 0.42),
      motif: "night",
    };
  }

  return {
    sky: rgb(0.17, 0.21, 0.42),
    skyAccent: rgb(0.4, 0.37, 0.67),
    ground: rgb(0.18, 0.29, 0.52),
    groundAccent: rgb(0.12, 0.2, 0.37),
    moon: rgb(0.99, 0.94, 0.76),
    ink: rgb(0.15, 0.18, 0.24),
    paper: rgb(1, 0.99, 0.97),
    accent: rgb(0.96, 0.8, 0.42),
    motif: "adventure",
  };
}

function isRasterDataUrl(url: string): boolean {
  return (
    url.startsWith("data:image/png") ||
    url.startsWith("data:image/jpeg") ||
    url.startsWith("data:image/jpg")
  );
}

function isRasterHttpUrl(url: string): boolean {
  const normalized = url.toLowerCase();
  return (
    normalized.endsWith(".png") ||
    normalized.endsWith(".jpg") ||
    normalized.endsWith(".jpeg")
  );
}

async function loadImageBytes(
  url: string
): Promise<{ bytes: Uint8Array; kind: "png" | "jpg" } | null> {
  if (isRasterDataUrl(url)) {
    const [header, body] = url.split(",", 2);
    if (!header || !body) return null;
    const kind = header.includes("png") ? "png" : "jpg";
    return {
      bytes: Uint8Array.from(Buffer.from(body, "base64")),
      kind,
    };
  }

  if (!isRasterHttpUrl(url)) return null;

  const response = await fetch(url);
  if (!response.ok) return null;
  const kind = url.toLowerCase().endsWith(".png") ? "png" : "jpg";
  return {
    bytes: new Uint8Array(await response.arrayBuffer()),
    kind,
  };
}

async function embedSpreadImage(pdfDoc: PDFDocument, imageUrl?: string) {
  if (!imageUrl) return null;
  const imageSource = await loadImageBytes(imageUrl);
  if (!imageSource) return null;
  return imageSource.kind === "png"
    ? pdfDoc.embedPng(imageSource.bytes)
    : pdfDoc.embedJpg(imageSource.bytes);
}

async function getBrandLogoBytes(variant: "light" | "dark") {
  if (variant === "light") {
    if (!lightLogoBytes) {
      lightLogoBytes = new Uint8Array(
        await readFile(path.join(process.cwd(), "public", "nav-icon-light.png"))
      );
    }
    return lightLogoBytes;
  }

  if (!darkLogoBytes) {
    darkLogoBytes = new Uint8Array(
      await readFile(path.join(process.cwd(), "public", "nav-icon-dark.png"))
    );
  }
  return darkLogoBytes;
}

async function drawBrandWordmark(input: {
  pdfDoc: PDFDocument;
  page: ReturnType<PDFDocument["addPage"]>;
  variant: "light" | "dark";
  x: number;
  y: number;
  iconSize: number;
  font: Awaited<ReturnType<PDFDocument["embedFont"]>>;
}) {
  const { pdfDoc, page, variant, x, y, iconSize, font } = input;
  const bytes = await getBrandLogoBytes(variant);
  const image = await pdfDoc.embedPng(bytes);
  const iconHeight = iconSize * (image.height / image.width);
  page.drawImage(image, { x, y, width: iconSize, height: iconHeight });
  const fontSize = Math.round(iconSize * 0.56);
  const textColor = variant === "light" ? rgb(0.99, 0.96, 0.88) : BRAND_PURPLE;
  page.drawText("Storycot", {
    x: x + iconSize + 8,
    y: y + (iconHeight - fontSize * 0.72) / 2,
    font,
    size: fontSize,
    color: textColor,
  });
}

function getPageText(spread: BookSpread, side: "start" | "end"): string {
  return side === "start" ? spread.leftPageText : spread.rightPageText;
}

function getWordmarkWidth(
  font: Awaited<ReturnType<PDFDocument["embedFont"]>>,
  iconSize: number
): number {
  const fontSize = Math.round(iconSize * 0.56);
  return iconSize + 8 + font.widthOfTextAtSize("Storycot", fontSize);
}

function drawCenteredText(input: {
  page: ReturnType<PDFDocument["addPage"]>;
  text: string;
  centerX: number;
  y: number;
  font: Awaited<ReturnType<PDFDocument["embedFont"]>>;
  size: number;
  color: ReturnType<typeof rgb>;
}) {
  const { page, text, centerX, y, font, size, color } = input;
  page.drawText(text, {
    x: centerX - font.widthOfTextAtSize(text, size) / 2,
    y,
    font,
    size,
    color,
  });
}

function getPlaceholderVariant(seed: number): PlaceholderVariant {
  return (Math.abs(seed) % 3) as PlaceholderVariant;
}

function drawPageBackground(
  page: ReturnType<PDFDocument["addPage"]>,
  width: number,
  height: number,
  color = rgb(1, 0.99, 0.97)
) {
  page.drawRectangle({ x: 0, y: 0, width, height, color });
}

function drawThemeArtPanel(input: {
  page: ReturnType<PDFDocument["addPage"]>;
  rect: { x: number; y: number; width: number; height: number };
  theme: PlaceholderTheme;
  variant?: PlaceholderVariant;
  title?: string;
  subtitle?: string;
}) {
  const { page, rect, theme, title, subtitle, variant = 0 } = input;
  const moonX = variant === 0 ? 0.82 : variant === 1 ? 0.24 : 0.68;
  const moonY = variant === 0 ? 0.84 : variant === 1 ? 0.76 : 0.88;
  const ridgeOneX = variant === 0 ? 0.25 : variant === 1 ? 0.35 : 0.18;
  const ridgeTwoX = variant === 0 ? 0.7 : variant === 1 ? 0.63 : 0.78;
  const ridgeThreeX = variant === 0 ? 0.5 : variant === 1 ? 0.42 : 0.6;
  page.drawRectangle({
    x: rect.x,
    y: rect.y,
    width: rect.width,
    height: rect.height,
    color: theme.sky,
  });
  page.drawRectangle({
    x: rect.x,
    y: rect.y + rect.height * 0.32,
    width: rect.width,
    height: rect.height * 0.68,
    color: theme.skyAccent,
    opacity: 0.35,
  });
  page.drawCircle({
    x: rect.x + rect.width * moonX,
    y: rect.y + rect.height * moonY,
    size: Math.min(rect.width, rect.height) * 0.1,
    color: theme.moon,
    opacity: 0.95,
  });
  page.drawEllipse({
    x: rect.x + rect.width * ridgeOneX,
    y: rect.y + rect.height * 0.12,
    xScale: rect.width * 0.34,
    yScale: rect.height * 0.1,
    color: theme.ground,
  });
  page.drawEllipse({
    x: rect.x + rect.width * ridgeTwoX,
    y: rect.y + rect.height * 0.08,
    xScale: rect.width * 0.38,
    yScale: rect.height * 0.12,
    color: theme.groundAccent,
  });
  page.drawEllipse({
    x: rect.x + rect.width * ridgeThreeX,
    y: rect.y + rect.height * 0.02,
    xScale: rect.width * 0.5,
    yScale: rect.height * 0.08,
    color: theme.groundAccent,
    opacity: 0.95,
  });

  if (theme.motif === "ocean") {
    page.drawCircle({
      x: rect.x + rect.width * 0.42,
      y: rect.y + rect.height * 0.2,
      size: rect.width * 0.022,
      color: theme.accent,
      opacity: 0.92,
    });
    page.drawCircle({
      x: rect.x + rect.width * 0.5,
      y: rect.y + rect.height * 0.24,
      size: rect.width * 0.016,
      color: theme.paper,
      opacity: 0.78,
    });
    page.drawCircle({
      x: rect.x + rect.width * 0.57,
      y: rect.y + rect.height * 0.19,
      size: rect.width * 0.024,
      color: theme.accent,
      opacity: 0.82,
    });
  } else if (theme.motif === "garden") {
    page.drawCircle({
      x: rect.x + rect.width * 0.48,
      y: rect.y + rect.height * 0.23,
      size: rect.width * 0.03,
      color: theme.accent,
      opacity: 0.92,
    });
    page.drawCircle({
      x: rect.x + rect.width * 0.55,
      y: rect.y + rect.height * 0.23,
      size: rect.width * 0.03,
      color: theme.accent,
      opacity: 0.86,
    });
    page.drawCircle({
      x: rect.x + rect.width * 0.515,
      y: rect.y + rect.height * 0.29,
      size: rect.width * 0.025,
      color: theme.paper,
      opacity: 0.82,
    });
  } else if (theme.motif === "night") {
    page.drawCircle({
      x: rect.x + rect.width * 0.46,
      y: rect.y + rect.height * 0.24,
      size: rect.width * 0.024,
      color: theme.accent,
      opacity: 0.92,
    });
    page.drawCircle({
      x: rect.x + rect.width * 0.53,
      y: rect.y + rect.height * 0.28,
      size: rect.width * 0.016,
      color: theme.paper,
      opacity: 0.82,
    });
    page.drawCircle({
      x: rect.x + rect.width * 0.58,
      y: rect.y + rect.height * 0.22,
      size: rect.width * 0.014,
      color: theme.accent,
      opacity: 0.82,
    });
  } else {
    page.drawCircle({
      x: rect.x + rect.width * 0.46,
      y: rect.y + rect.height * 0.17,
      size: rect.width * 0.024,
      color: theme.accent,
      opacity: 0.92,
    });
    page.drawCircle({
      x: rect.x + rect.width * 0.62,
      y: rect.y + rect.height * 0.26,
      size: rect.width * 0.014,
      color: theme.paper,
      opacity: 0.82,
    });
  }

  if (title) {
    page.drawText(clampText(title, 42), {
      x: rect.x + 28,
      y: rect.y + rect.height - 48,
      size: 22,
      color: theme.paper,
    });
  }

  if (subtitle) {
    page.drawText(clampText(subtitle, 48), {
      x: rect.x + 28,
      y: rect.y + rect.height - 76,
      size: 12,
      color: theme.paper,
    });
  }
}

async function drawSpreadArtIntoRect(input: {
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
  const imageUrl = perPageUrl ?? spread.imageUrl;
  const image = await embedSpreadImage(pdfDoc, imageUrl);

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

async function drawHalfTitlePage(input: {
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

async function drawFrontispiecePage(input: {
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

async function drawTitlePage(input: {
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

async function drawCopyrightPage(input: {
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
  page.drawText("storycot.com", {
    x: pageWidth * 0.12,
    y: pageHeight * 0.2,
    font: sansBold,
    size: 10,
    color: BRAND_LILAC,
  });
}

function drawBlankEndpaperPage(input: {
  page: ReturnType<PDFDocument["addPage"]>;
  pageWidth: number;
  pageHeight: number;
}) {
  const { page, pageWidth, pageHeight } = input;
  drawPageBackground(page, pageWidth, pageHeight, rgb(0.98, 0.96, 0.91));
}

function getMaxTextBoxPt(preset?: StoryPreset): number {
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

async function drawBookPage(input: {
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

function getCombinedPageText(spread: BookSpread) {
  return [spread.leftPageText, spread.rightPageText]
    .map((text) => text.replace(/\s+/g, " ").trim())
    .filter(Boolean)
    .join("\n\n");
}

async function drawLuluTextPage(input: {
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
    serifBold,
    sans,
    pageNumber,
  } = input;
  const theme = pickPlaceholderTheme(story);
  drawPageBackground(page, pageWidth, pageHeight, theme.paper);

  await drawBrandWordmark({
    pdfDoc,
    page,
    variant: "dark",
    x: textSafeMargin,
    y: pageHeight - textSafeMargin - 30,
    iconSize: 30,
    font: sans,
  });

  const text = getCombinedPageText(spread);
  const textWidth = pageWidth - textSafeMargin * 2;
  if (spread.title) {
    page.drawText(spread.title, {
      x: textSafeMargin,
      y: pageHeight - textSafeMargin - 104,
      font: serifBold,
      size: 18,
      color: theme.ink,
    });
  }

  if (text) {
    const fittedText = fitWrappedTextToBox({
      text,
      font: serif,
      maxWidth: textWidth,
      maxHeight: pageHeight * 0.58,
      paddingY: 0,
      preferredSize: 19,
      minSize: 11,
    });
    drawWrappedText({
      page,
      text,
      x: textSafeMargin,
      topY: pageHeight - textSafeMargin - 150,
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

async function drawLuluArtPage(input: {
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

async function buildPrintPdf(input: {
  project: BookProject;
  story: Story;
  profile: ChildProfile;
  geometry?: PdfPageGeometry;
  minPageCount?: number;
  includeCoverFrontMatter?: boolean;
  luluTextArtInterior?: boolean;
}): Promise<Uint8Array> {
  const geometry = input.geometry ?? STORYCOT_PDF_GEOMETRY;
  const { pageWidth, pageHeight, textSafeMargin } = geometry;
  const includeCoverFrontMatter = input.includeCoverFrontMatter ?? true;
  const pdfDoc = await PDFDocument.create();
  const serif = await pdfDoc.embedFont(StandardFonts.TimesRoman);
  const serifBold = await pdfDoc.embedFont(StandardFonts.TimesRomanBold);
  const sans = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const sansBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
  const theme = pickPlaceholderTheme(input.story);

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
      const endLeafPage = pdfDoc.addPage([pageWidth, pageHeight]);
      drawBlankEndpaperPage({
        page: endLeafPage,
        pageWidth,
        pageHeight,
      });

      const backMatterLeafPage = pdfDoc.addPage([pageWidth, pageHeight]);
      drawBlankEndpaperPage({
        page: backMatterLeafPage,
        pageWidth,
        pageHeight,
      });

      continue;
    }

    if (input.luluTextArtInterior) {
      const textPage = pdfDoc.addPage([pageWidth, pageHeight]);
      await drawLuluTextPage({
        pdfDoc,
        page: textPage,
        story: input.story,
        spread: {
          ...spread,
          rightPageText: "",
        },
        pageWidth,
        pageHeight,
        textSafeMargin,
        serif,
        serifBold,
        sans,
        pageNumber: pdfDoc.getPageCount(),
      });

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

      if (spread.rightPageText || spread.rightPageImageUrl) {
        const rightTextPage = pdfDoc.addPage([pageWidth, pageHeight]);
        await drawLuluTextPage({
          pdfDoc,
          page: rightTextPage,
          story: input.story,
          spread: {
            ...spread,
            leftPageText: spread.rightPageText,
            rightPageText: "",
          },
          pageWidth,
          pageHeight,
          textSafeMargin,
          serif,
          serifBold,
          sans,
          pageNumber: pdfDoc.getPageCount(),
        });

        const endArtPage = pdfDoc.addPage([pageWidth, pageHeight]);
        await drawLuluArtPage({
          pdfDoc,
          page: endArtPage,
          story: input.story,
          spread,
          side: "end",
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
    drawBlankEndpaperPage({ page, pageWidth, pageHeight });
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
  const serif = await pdfDoc.embedFont(StandardFonts.TimesRoman);
  const serifBold = await pdfDoc.embedFont(StandardFonts.TimesRomanBold);
  const sans = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const sansBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
  const theme = pickPlaceholderTheme(input.story);
  const spine = getBookSpineWidthIn(input.project.pageCount);
  const spineWidthIn = input.spineWidthIn ?? spine.widthIn;
  const coverSpineWidth = spineWidthIn * POINTS_PER_INCH;
  const coverTotalWidth = pageWidth * 2 + coverSpineWidth;
  const page = pdfDoc.addPage([coverTotalWidth, pageHeight]);
  const coverSpread = input.project.spreads.find(
    (spread) => spread.sequence === 1
  );
  const image = await embedSpreadImage(
    pdfDoc,
    input.project.assets.coverImageUrl || coverSpread?.imageUrl
  );
  const backCoverX = 0;
  const spineX = pageWidth;
  const frontCoverX = pageWidth + coverSpineWidth;

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
      backCoverSpread?.imageUrl
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
      x: backCoverX + BLEED + 24,
      y: pageHeight - 300,
      width: pageWidth - (BLEED + 24) * 2,
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
    x: frontCoverX + BLEED + 30,
    y: pageHeight - 62,
    iconSize: 36,
    font: sansBold,
  });
  page.drawRectangle({
    x: frontCoverX + BLEED + 24,
    y: pageHeight - 232,
    width: pageWidth - (BLEED + 24) * 2,
    height: 148,
    color: BRAND_PURPLE,
    opacity: image ? 0.48 : 0.82,
  });
  page.drawText(input.story.title, {
    x: frontCoverX + BLEED + 42,
    y: pageHeight - 148,
    font: serifBold,
    size: 28,
    color: rgb(0.99, 0.96, 0.88),
  });
  page.drawText(`Created for ${input.profile.name}`, {
    x: frontCoverX + BLEED + 42,
    y: pageHeight - 184,
    font: serif,
    size: 16,
    color: rgb(0.97, 0.92, 0.82),
  });

  page.drawText("A personalised story from Storycot", {
    x: backCoverX + BLEED + 42,
    y: pageHeight - 116,
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
    x: backCoverX + BLEED + 42,
    topY: pageHeight - 148,
    maxWidth: pageWidth * 0.56,
    lineHeight: 18,
    font: serif,
    size: 12,
    color: rgb(0.24, 0.26, 0.32),
  });

  page.drawRectangle({
    x: backCoverX + BLEED + 42,
    y: 56,
    width: pageWidth - (BLEED + 42) * 2,
    height: 110,
    color: rgb(1, 1, 1),
    opacity: 0.74,
  });
  page.drawText("Personalised for bedtime reading", {
    x: backCoverX + BLEED + 58,
    y: 138,
    font: sansBold,
    size: 11,
    color: theme.skyAccent,
  });
  page.drawText(BOOK_SPEC.trimLabel, {
    x: backCoverX + BLEED + 58,
    y: 118,
    font: sans,
    size: 10,
    color: rgb(0.34, 0.35, 0.4),
  });
  page.drawText("Create your own at storycot.com", {
    x: backCoverX + BLEED + 58,
    y: 96,
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
  const printBytes = await buildPrintPdf(input);
  const shouldGenerateLuluPdfs = process.env.STORYCOT_PRINT_PROVIDER === "lulu";
  const luluPrintBytes = shouldGenerateLuluPdfs
    ? await buildPrintPdf({
        ...input,
        geometry: LULU_PDF_GEOMETRY,
        minPageCount: LULU_HARDCOVER_MIN_PAGES,
        includeCoverFrontMatter: false,
        luluTextArtInterior: true,
      })
    : undefined;
  const luluPrintPdfPageCount = luluPrintBytes
    ? (await PDFDocument.load(luluPrintBytes)).getPageCount()
    : undefined;
  const luluSpine = getBookSpineWidthIn(
    luluPrintPdfPageCount ?? input.project.pageCount
  );

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
            geometry: LULU_PDF_GEOMETRY,
            spineWidthIn: luluSpine.widthIn,
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
      ? Number(
          (LULU_INTERIOR_PDF_PAGE_WIDTH_IN * 2 + luluSpine.widthIn).toFixed(3)
        )
      : undefined,
    luluCoverPdfPageHeightIn: shouldGenerateLuluPdfs
      ? LULU_INTERIOR_PDF_PAGE_HEIGHT_IN
      : undefined,
    luluCoverPdfSpineWidthIn: shouldGenerateLuluPdfs
      ? luluSpine.widthIn
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
