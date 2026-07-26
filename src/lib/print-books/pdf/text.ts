import { PDFDocument, rgb } from "pdf-lib";

export function sanitizeText(value: string): string {
  return value
    .replace(/\s*—\s*/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function clampText(value: string, maxLength: number): string {
  if (value.length <= maxLength) return value;
  return `${value.slice(0, maxLength - 1).trimEnd()}…`;
}

export function wrapTextToWidth(input: {
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

export function truncateTextToWidth(input: {
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
    const lineHeight = Math.ceil(size * 1.5);
    const lines = wrapTextToWidth({ text, font, size, maxWidth });
    if (lines.length * lineHeight + paddingY <= maxHeight) {
      return { lines, size, lineHeight, truncated: false };
    }
  }

  const size = minSize;
  const lineHeight = Math.ceil(size * 1.5);
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

export function drawWrappedText(input: {
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

export function drawCenteredText(input: {
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
