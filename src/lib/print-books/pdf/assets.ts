import { readFile } from "fs/promises";
import path from "path";
import sharp from "sharp";
import { PDFDocument, rgb } from "pdf-lib";
import type { BookSpread } from "@/types/printBook";
import { BRAND_PURPLE, PDF_MAX_RASTER_PPI, POINTS_PER_INCH } from "./constants";

let lightLogoBytes: Uint8Array | null = null;
let darkLogoBytes: Uint8Array | null = null;

export function isRasterDataUrl(url: string): boolean {
  return (
    url.startsWith("data:image/png") ||
    url.startsWith("data:image/jpeg") ||
    url.startsWith("data:image/jpg")
  );
}

export function isRasterHttpUrl(url: string): boolean {
  const normalized = url.toLowerCase();
  return (
    normalized.endsWith(".png") ||
    normalized.endsWith(".jpg") ||
    normalized.endsWith(".jpeg")
  );
}

export function getSpreadArtUrl(
  spread: BookSpread,
  side: "start" | "end" | "cover"
) {
  if (side === "start") return spread.leftPageImageUrl ?? spread.imageUrl;
  if (side === "end") return spread.rightPageImageUrl ?? spread.imageUrl;
  return spread.imageUrl;
}

export function hasPrintableArt(
  spread: BookSpread,
  side: "start" | "end" | "cover"
) {
  const imageUrl = getSpreadArtUrl(spread, side);
  if (!imageUrl) return false;
  return isRasterDataUrl(imageUrl) || isRasterHttpUrl(imageUrl);
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

async function resizeRasterForPdf(input: {
  bytes: Uint8Array;
  kind: "png" | "jpg";
  maxDrawWidthPt: number;
  maxDrawHeightPt: number;
}): Promise<{ bytes: Uint8Array; kind: "png" | "jpg" }> {
  const { bytes, kind, maxDrawWidthPt, maxDrawHeightPt } = input;
  const maxWidth = Math.max(
    1,
    Math.floor((maxDrawWidthPt / POINTS_PER_INCH) * PDF_MAX_RASTER_PPI)
  );
  const maxHeight = Math.max(
    1,
    Math.floor((maxDrawHeightPt / POINTS_PER_INCH) * PDF_MAX_RASTER_PPI)
  );
  const metadata = await sharp(bytes).metadata();
  if (
    !metadata.width ||
    !metadata.height ||
    (metadata.width <= maxWidth && metadata.height <= maxHeight)
  ) {
    return input;
  }

  const resized = sharp(bytes).resize({
    width: maxWidth,
    height: maxHeight,
    fit: "inside",
    withoutEnlargement: true,
  });
  const output =
    kind === "png"
      ? await resized.png().toBuffer()
      : await resized.jpeg({ quality: 92, mozjpeg: true }).toBuffer();

  return { bytes: Uint8Array.from(output), kind };
}

async function embedRasterImage(
  pdfDoc: PDFDocument,
  imageSource: { bytes: Uint8Array; kind: "png" | "jpg" },
  maxDrawSize?: { maxDrawWidthPt: number; maxDrawHeightPt: number }
) {
  const source = maxDrawSize
    ? await resizeRasterForPdf({ ...imageSource, ...maxDrawSize })
    : imageSource;
  return source.kind === "png"
    ? pdfDoc.embedPng(source.bytes)
    : pdfDoc.embedJpg(source.bytes);
}

export async function embedSpreadImage(
  pdfDoc: PDFDocument,
  imageUrl?: string,
  maxDrawSize?: { maxDrawWidthPt: number; maxDrawHeightPt: number }
) {
  if (!imageUrl) return null;
  const imageSource = await loadImageBytes(imageUrl);
  if (!imageSource) return null;
  return embedRasterImage(pdfDoc, imageSource, maxDrawSize);
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

export async function drawBrandWordmark(input: {
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
  const image = await embedRasterImage(
    pdfDoc,
    { bytes, kind: "png" },
    { maxDrawWidthPt: iconSize, maxDrawHeightPt: iconSize }
  );
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

export function getPageText(spread: BookSpread, side: "start" | "end"): string {
  return side === "start" ? spread.leftPageText : spread.rightPageText;
}

export function getWordmarkWidth(
  font: Awaited<ReturnType<PDFDocument["embedFont"]>>,
  iconSize: number
): number {
  const fontSize = Math.round(iconSize * 0.56);
  return iconSize + 8 + font.widthOfTextAtSize("Storycot", fontSize);
}
