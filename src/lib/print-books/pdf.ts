import { PDFDocument, StandardFonts, rgb } from 'pdf-lib'
import type { ChildProfile, Story } from '@/types'
import type { BookProject, BookSpread } from '@/types/printBook'
import { storeBookAsset } from '@/lib/print-books/storage'
import { LULU_SQUARE_HARDCOVER_SPEC } from '@/lib/print-books/proofing'

const REVIEW_PAGE_WIDTH = 792
const REVIEW_PAGE_HEIGHT = 612
const REVIEW_MARGIN = 48
const POINTS_PER_INCH = 72
const PRINT_PAGE_WIDTH = (LULU_SQUARE_HARDCOVER_SPEC.trimWidthIn + LULU_SQUARE_HARDCOVER_SPEC.bleedIn * 2) * POINTS_PER_INCH
const PRINT_PAGE_HEIGHT = (LULU_SQUARE_HARDCOVER_SPEC.trimHeightIn + LULU_SQUARE_HARDCOVER_SPEC.bleedIn * 2) * POINTS_PER_INCH
const BLEED = LULU_SQUARE_HARDCOVER_SPEC.bleedIn * POINTS_PER_INCH
const SAFE_MARGIN = LULU_SQUARE_HARDCOVER_SPEC.safetyMarginIn * POINTS_PER_INCH
const INNER_TEXT_MARGIN = BLEED + SAFE_MARGIN
const OUTER_TEXT_MARGIN = BLEED + SAFE_MARGIN
const TOP_TEXT_MARGIN = BLEED + SAFE_MARGIN

function sanitizeText(value: string): string {
  return value.replace(/\s+/g, ' ').trim()
}

function clampText(value: string, maxLength: number): string {
  if (value.length <= maxLength) return value
  return `${value.slice(0, maxLength - 1).trimEnd()}…`
}

function wrapText(text: string, maxChars: number): string[] {
  const words = sanitizeText(text).split(' ').filter(Boolean)
  if (words.length === 0) return []

  const lines: string[] = []
  let current = ''

  for (const word of words) {
    const candidate = current ? `${current} ${word}` : word
    if (candidate.length <= maxChars) {
      current = candidate
      continue
    }
    if (current) lines.push(current)
    current = word
  }

  if (current) lines.push(current)
  return lines
}

function drawWrappedText(input: {
  page: ReturnType<PDFDocument['addPage']>
  text: string
  x: number
  y: number
  maxChars: number
  lineHeight: number
  font: Awaited<ReturnType<PDFDocument['embedFont']>>
  size: number
  color?: ReturnType<typeof rgb>
}) {
  const { page, text, x, y, maxChars, lineHeight, font, size, color = rgb(0.15, 0.18, 0.24) } = input
  const lines = wrapText(text, maxChars)
  lines.forEach((line, index) => {
    page.drawText(line, {
      x,
      y: y - index * lineHeight,
      font,
      size,
      color,
    })
  })
  return lines.length
}

function isRasterDataUrl(url: string): boolean {
  return url.startsWith('data:image/png') || url.startsWith('data:image/jpeg') || url.startsWith('data:image/jpg')
}

function isRasterHttpUrl(url: string): boolean {
  const normalized = url.toLowerCase()
  return normalized.endsWith('.png') || normalized.endsWith('.jpg') || normalized.endsWith('.jpeg')
}

async function loadImageBytes(url: string): Promise<{ bytes: Uint8Array; kind: 'png' | 'jpg' } | null> {
  if (isRasterDataUrl(url)) {
    const [header, body] = url.split(',', 2)
    if (!header || !body) return null
    const kind = header.includes('png') ? 'png' : 'jpg'
    return {
      bytes: Uint8Array.from(Buffer.from(body, 'base64')),
      kind,
    }
  }

  if (!isRasterHttpUrl(url)) return null

  const response = await fetch(url)
  if (!response.ok) return null
  const kind = url.toLowerCase().endsWith('.png') ? 'png' : 'jpg'
  return {
    bytes: new Uint8Array(await response.arrayBuffer()),
    kind,
  }
}

async function embedSpreadImage(pdfDoc: PDFDocument, imageUrl?: string) {
  if (!imageUrl) return null
  const imageSource = await loadImageBytes(imageUrl)
  if (!imageSource) return null
  return imageSource.kind === 'png'
    ? pdfDoc.embedPng(imageSource.bytes)
    : pdfDoc.embedJpg(imageSource.bytes)
}

async function drawReviewSpreadImage(input: {
  pdfDoc: PDFDocument
  page: ReturnType<PDFDocument['addPage']>
  spread: BookSpread
}) {
  const { pdfDoc, page, spread } = input
  const image = await embedSpreadImage(pdfDoc, spread.imageUrl)
  if (!image) return false

  const boxX = REVIEW_MARGIN
  const boxY = 236
  const boxWidth = REVIEW_PAGE_WIDTH - REVIEW_MARGIN * 2
  const boxHeight = 256
  const scale = Math.min(boxWidth / image.width, boxHeight / image.height)
  const drawWidth = image.width * scale
  const drawHeight = image.height * scale

  page.drawImage(image, {
    x: boxX + (boxWidth - drawWidth) / 2,
    y: boxY + (boxHeight - drawHeight) / 2,
    width: drawWidth,
    height: drawHeight,
  })

  return true
}

function drawReviewImagePlaceholder(page: ReturnType<PDFDocument['addPage']>, spread: BookSpread) {
  page.drawRectangle({
    x: REVIEW_MARGIN,
    y: 236,
    width: REVIEW_PAGE_WIDTH - REVIEW_MARGIN * 2,
    height: 256,
    color: rgb(0.97, 0.95, 0.9),
    borderColor: rgb(0.82, 0.79, 0.72),
    borderWidth: 1,
  })

  page.drawText(clampText(spread.sceneBrief, 120), {
    x: REVIEW_MARGIN + 18,
    y: 446,
    size: 16,
    color: rgb(0.34, 0.31, 0.28),
  })
}

async function buildPreviewPdf(input: {
  project: BookProject
  story: Story
  profile: ChildProfile
}): Promise<Uint8Array> {
  const pdfDoc = await PDFDocument.create()
  const serif = await pdfDoc.embedFont(StandardFonts.TimesRoman)
  const serifBold = await pdfDoc.embedFont(StandardFonts.TimesRomanBold)
  const sans = await pdfDoc.embedFont(StandardFonts.Helvetica)
  const sansBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold)

  const coverPage = pdfDoc.addPage([REVIEW_PAGE_WIDTH, REVIEW_PAGE_HEIGHT])
  coverPage.drawRectangle({ x: 0, y: 0, width: REVIEW_PAGE_WIDTH, height: REVIEW_PAGE_HEIGHT, color: rgb(0.11, 0.16, 0.35) })
  coverPage.drawText(input.story.title, {
    x: REVIEW_MARGIN,
    y: REVIEW_PAGE_HEIGHT - 150,
    font: serifBold,
    size: 30,
    color: rgb(0.99, 0.95, 0.84),
  })
  coverPage.drawText(`Created for ${input.profile.name}`, {
    x: REVIEW_MARGIN,
    y: REVIEW_PAGE_HEIGHT - 190,
    font: serif,
    size: 18,
    color: rgb(0.96, 0.91, 0.77),
  })
  coverPage.drawText(`Review PDF · ${LULU_SQUARE_HARDCOVER_SPEC.trimLabel}`, {
    x: REVIEW_MARGIN,
    y: 72,
    font: sans,
    size: 12,
    color: rgb(0.78, 0.8, 0.92),
  })

  for (const spread of input.project.spreads) {
    const page = pdfDoc.addPage([REVIEW_PAGE_WIDTH, REVIEW_PAGE_HEIGHT])
    page.drawRectangle({ x: 0, y: 0, width: REVIEW_PAGE_WIDTH, height: REVIEW_PAGE_HEIGHT, color: rgb(1, 0.99, 0.97) })

    page.drawText(`Spread ${spread.sequence} · Pages ${spread.pageStart}-${spread.pageEnd}`, {
      x: REVIEW_MARGIN,
      y: REVIEW_PAGE_HEIGHT - 52,
      font: sansBold,
      size: 14,
      color: rgb(0.4, 0.39, 0.45),
    })

    if (spread.title) {
      page.drawText(spread.title, {
        x: REVIEW_MARGIN,
        y: REVIEW_PAGE_HEIGHT - 84,
        font: serifBold,
        size: 22,
        color: rgb(0.14, 0.16, 0.22),
      })
    }

    const drewImage = await drawReviewSpreadImage({ pdfDoc, page, spread })
    if (!drewImage) {
      drawReviewImagePlaceholder(page, spread)
    }

    drawWrappedText({
      page,
      text: `Scene: ${clampText(spread.sceneBrief, 180)}`,
      x: REVIEW_MARGIN,
      y: 212,
      maxChars: 86,
      lineHeight: 16,
      font: sans,
      size: 11,
      color: rgb(0.45, 0.43, 0.4),
    })

    page.drawText('Left page text', {
      x: REVIEW_MARGIN,
      y: 176,
      font: sansBold,
      size: 12,
      color: rgb(0.36, 0.35, 0.41),
    })
    drawWrappedText({
      page,
      text: spread.leftPageText || 'This side stays visually quiet.',
      x: REVIEW_MARGIN,
      y: 158,
      maxChars: 46,
      lineHeight: 15,
      font: serif,
      size: 12,
    })

    page.drawText('Right page text', {
      x: REVIEW_PAGE_WIDTH / 2 + 12,
      y: 176,
      font: sansBold,
      size: 12,
      color: rgb(0.36, 0.35, 0.41),
    })
    drawWrappedText({
      page,
      text: spread.rightPageText || 'This side is carrying the artwork.',
      x: REVIEW_PAGE_WIDTH / 2 + 12,
      y: 158,
      maxChars: 46,
      lineHeight: 15,
      font: serif,
      size: 12,
    })

    drawWrappedText({
      page,
      text: `Illustration intent: ${clampText(spread.illustrationPrompt, 280)}`,
      x: REVIEW_MARGIN,
      y: 62,
      maxChars: 92,
      lineHeight: 14,
      font: sans,
      size: 10,
      color: rgb(0.42, 0.42, 0.48),
    })
  }

  return pdfDoc.save()
}

function getPageText(spread: BookSpread, side: 'start' | 'end'): string {
  return side === 'start' ? spread.leftPageText : spread.rightPageText
}

function getPageFallbackText(pageNumber: number): string {
  switch (pageNumber) {
    case 2:
      return 'Intentionally left quiet for printer-safe front matter.'
    case 31:
      return 'Intentionally left quiet for printer-safe back matter.'
    default:
      return ''
  }
}

function drawPrintPageFrame(page: ReturnType<PDFDocument['addPage']>) {
  page.drawRectangle({
    x: BLEED,
    y: BLEED,
    width: PRINT_PAGE_WIDTH - BLEED * 2,
    height: PRINT_PAGE_HEIGHT - BLEED * 2,
    borderColor: rgb(0.92, 0.9, 0.86),
    borderWidth: 0.5,
  })
}

function drawPrintTextBlock(input: {
  page: ReturnType<PDFDocument['addPage']>
  pageNumber: number
  spread: BookSpread
  text: string
  fontSerif: Awaited<ReturnType<PDFDocument['embedFont']>>
  fontSansBold: Awaited<ReturnType<PDFDocument['embedFont']>>
}) {
  const { page, pageNumber, spread, text, fontSerif, fontSansBold } = input
  const isEvenPage = pageNumber % 2 === 0
  const x = isEvenPage ? INNER_TEXT_MARGIN : OUTER_TEXT_MARGIN
  const maxChars = 25

  page.drawRectangle({
    x: x - 12,
    y: BLEED + 48,
    width: PRINT_PAGE_WIDTH - x - (isEvenPage ? OUTER_TEXT_MARGIN : INNER_TEXT_MARGIN) + 24,
    height: 136,
    color: rgb(1, 1, 1),
    opacity: 0.78,
  })

  page.drawText(`Page ${pageNumber}`, {
    x,
    y: BLEED + 160,
    font: fontSansBold,
    size: 11,
    color: rgb(0.31, 0.33, 0.38),
  })

  drawWrappedText({
    page,
    text: text || getPageFallbackText(pageNumber),
    x,
    y: BLEED + 140,
    maxChars,
    lineHeight: 16,
    font: fontSerif,
    size: 12,
    color: rgb(0.16, 0.17, 0.22),
  })

  page.drawText(clampText(spread.title || spread.sceneBrief, 42), {
    x,
    y: PRINT_PAGE_HEIGHT - TOP_TEXT_MARGIN + 8,
    font: fontSansBold,
    size: 10,
    color: rgb(0.35, 0.35, 0.4),
  })
}

async function drawPrintPage(input: {
  pdfDoc: PDFDocument
  page: ReturnType<PDFDocument['addPage']>
  spread: BookSpread
  pageNumber: number
  side: 'start' | 'end'
  fontSerif: Awaited<ReturnType<PDFDocument['embedFont']>>
  fontSansBold: Awaited<ReturnType<PDFDocument['embedFont']>>
}) {
  const { pdfDoc, page, spread, pageNumber, side, fontSerif, fontSansBold } = input
  const image = await embedSpreadImage(pdfDoc, spread.imageUrl)

  if (image) {
    const scale = Math.max(PRINT_PAGE_WIDTH / image.width, PRINT_PAGE_HEIGHT / image.height)
    const drawWidth = image.width * scale
    const drawHeight = image.height * scale
    page.drawImage(image, {
      x: (PRINT_PAGE_WIDTH - drawWidth) / 2,
      y: (PRINT_PAGE_HEIGHT - drawHeight) / 2,
      width: drawWidth,
      height: drawHeight,
    })
  } else {
    page.drawRectangle({ x: 0, y: 0, width: PRINT_PAGE_WIDTH, height: PRINT_PAGE_HEIGHT, color: rgb(0.97, 0.95, 0.9) })
  }

  drawPrintPageFrame(page)
  drawPrintTextBlock({
    page,
    pageNumber,
    spread,
    text: getPageText(spread, side),
    fontSerif,
    fontSansBold,
  })
}

async function buildPrintPdf(input: {
  project: BookProject
  story: Story
  profile: ChildProfile
}): Promise<Uint8Array> {
  const pdfDoc = await PDFDocument.create()
  const serif = await pdfDoc.embedFont(StandardFonts.TimesRoman)
  const serifBold = await pdfDoc.embedFont(StandardFonts.TimesRomanBold)
  const sans = await pdfDoc.embedFont(StandardFonts.Helvetica)
  const sansBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold)

  for (const spread of input.project.spreads) {
    const startPage = pdfDoc.addPage([PRINT_PAGE_WIDTH, PRINT_PAGE_HEIGHT])
    await drawPrintPage({
      pdfDoc,
      page: startPage,
      spread,
      pageNumber: spread.pageStart,
      side: 'start',
      fontSerif: serif,
      fontSansBold: sansBold,
    })

    if (spread.pageStart === 3) {
      startPage.drawRectangle({
        x: BLEED + 36,
        y: PRINT_PAGE_HEIGHT - 210,
        width: PRINT_PAGE_WIDTH - (BLEED + 36) * 2,
        height: 104,
        color: rgb(1, 1, 1),
        opacity: 0.82,
      })
      startPage.drawText(input.story.title, {
        x: BLEED + 52,
        y: PRINT_PAGE_HEIGHT - 154,
        font: serifBold,
        size: 24,
        color: rgb(0.12, 0.13, 0.18),
      })
      startPage.drawText('by Storycot', {
        x: BLEED + 52,
        y: PRINT_PAGE_HEIGHT - 182,
        font: serif,
        size: 14,
        color: rgb(0.32, 0.33, 0.4),
      })
    }

    const endPage = pdfDoc.addPage([PRINT_PAGE_WIDTH, PRINT_PAGE_HEIGHT])
    await drawPrintPage({
      pdfDoc,
      page: endPage,
      spread,
      pageNumber: spread.pageEnd,
      side: 'end',
      fontSerif: serif,
      fontSansBold: sansBold,
    })

    if (spread.pageEnd === 4) {
      endPage.drawRectangle({
        x: BLEED + 36,
        y: BLEED + 220,
        width: PRINT_PAGE_WIDTH - (BLEED + 36) * 2,
        height: 146,
        color: rgb(1, 1, 1),
        opacity: 0.84,
      })
      endPage.drawText(`Copyright © ${new Date(input.project.createdAt).getUTCFullYear()} Storycot`, {
        x: BLEED + 52,
        y: BLEED + 330,
        font: sansBold,
        size: 12,
        color: rgb(0.16, 0.17, 0.22),
      })
      endPage.drawText(`Created for ${input.profile.name}`, {
        x: BLEED + 52,
        y: BLEED + 310,
        font: sans,
        size: 11,
        color: rgb(0.28, 0.29, 0.34),
      })
      endPage.drawText('ISBN pending — distribution metadata required before retail submission.', {
        x: BLEED + 52,
        y: BLEED + 290,
        font: sans,
        size: 10,
        color: rgb(0.44, 0.29, 0.2),
      })
      endPage.drawText(LULU_SQUARE_HARDCOVER_SPEC.trimLabel, {
        x: BLEED + 52,
        y: BLEED + 270,
        font: sans,
        size: 10,
        color: rgb(0.32, 0.33, 0.4),
      })
    }
  }

  return pdfDoc.save()
}

export async function generateBookPdfs(input: {
  project: BookProject
  story: Story
  profile: ChildProfile
}): Promise<{
  previewPdfUrl: string
  printPdfUrl: string
  previewImages: string[]
}> {
  const previewBytes = await buildPreviewPdf(input)
  const printBytes = await buildPrintPdf(input)

  const previewPdfUrl = await storeBookAsset({
    pathname: `books/${input.project.id}/preview.pdf`,
    body: Buffer.from(previewBytes),
    contentType: 'application/pdf',
  })
  const printPdfUrl = await storeBookAsset({
    pathname: `books/${input.project.id}/print.pdf`,
    body: Buffer.from(printBytes),
    contentType: 'application/pdf',
  })

  return {
    previewPdfUrl,
    printPdfUrl,
    previewImages: input.project.spreads
      .map((spread) => spread.imageUrl)
      .filter((url): url is string => typeof url === 'string' && url.length > 0),
  }
}
