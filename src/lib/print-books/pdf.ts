import { PDFDocument, StandardFonts, clip, degrees, endPath, popGraphicsState, pushGraphicsState, rectangle, rgb } from 'pdf-lib'
import type { ChildProfile, Story } from '@/types'
import type { BookProject, BookSpread } from '@/types/printBook'
import { getLuluCoverSpineWidth } from '@/lib/print-books/cover'
import { storeBookAsset } from '@/lib/print-books/storage'
import { LULU_SQUARE_HARDCOVER_SPEC } from '@/lib/print-books/proofing'

const POINTS_PER_INCH = 72
const PRINT_PAGE_WIDTH = (LULU_SQUARE_HARDCOVER_SPEC.trimWidthIn + LULU_SQUARE_HARDCOVER_SPEC.bleedIn * 2) * POINTS_PER_INCH
const PRINT_PAGE_HEIGHT = (LULU_SQUARE_HARDCOVER_SPEC.trimHeightIn + LULU_SQUARE_HARDCOVER_SPEC.bleedIn * 2) * POINTS_PER_INCH
const BLEED = LULU_SQUARE_HARDCOVER_SPEC.bleedIn * POINTS_PER_INCH
const FULL_BLEED_TEXT_SAFE_MARGIN = LULU_SQUARE_HARDCOVER_SPEC.fullBleedTextSafeMarginIn * POINTS_PER_INCH

type PlaceholderTheme = {
  sky: ReturnType<typeof rgb>
  skyAccent: ReturnType<typeof rgb>
  ground: ReturnType<typeof rgb>
  groundAccent: ReturnType<typeof rgb>
  moon: ReturnType<typeof rgb>
  ink: ReturnType<typeof rgb>
  paper: ReturnType<typeof rgb>
  accent: ReturnType<typeof rgb>
  motif: 'ocean' | 'garden' | 'night' | 'adventure'
}

type PlaceholderVariant = 0 | 1 | 2

function sanitizeText(value: string): string {
  return value.replace(/\s+/g, ' ').trim()
}

function clampText(value: string, maxLength: number): string {
  if (value.length <= maxLength) return value
  return `${value.slice(0, maxLength - 1).trimEnd()}…`
}

function wrapTextToWidth(input: {
  text: string
  font: Awaited<ReturnType<PDFDocument['embedFont']>>
  size: number
  maxWidth: number
}): string[] {
  const { text, font, size, maxWidth } = input
  const words = sanitizeText(text).split(' ').filter(Boolean)
  if (words.length === 0) return []

  const lines: string[] = []
  let current = ''

  for (const word of words) {
    const candidate = current ? `${current} ${word}` : word
    if (font.widthOfTextAtSize(candidate, size) <= maxWidth) {
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
  topY: number
  maxWidth: number
  lineHeight: number
  font: Awaited<ReturnType<PDFDocument['embedFont']>>
  size: number
  color?: ReturnType<typeof rgb>
}) {
  const { page, text, x, topY, maxWidth, lineHeight, font, size, color = rgb(0.15, 0.18, 0.24) } = input
  const lines = wrapTextToWidth({ text, font, size, maxWidth })
  lines.forEach((line, index) => {
    page.drawText(line, {
      x,
      y: topY - index * lineHeight,
      font,
      size,
      color,
    })
  })
  return lines.length
}

function pickPlaceholderTheme(story: Story): PlaceholderTheme {
  const source = `${story.title} ${story.theme || ''} ${story.pages.map((page) => page.text).join(' ')} ${story.pages.map((page) => page.illustrationPrompt || '').join(' ')}`.toLowerCase()

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
      motif: 'ocean',
    }
  }

  if (/(garden|flower|forest|tree|leaf|meadow|field|fox|rabbit|bunny)/.test(source)) {
    return {
      sky: rgb(0.18, 0.29, 0.34),
      skyAccent: rgb(0.39, 0.52, 0.43),
      ground: rgb(0.21, 0.38, 0.28),
      groundAccent: rgb(0.16, 0.28, 0.21),
      moon: rgb(0.98, 0.94, 0.75),
      ink: rgb(0.15, 0.18, 0.2),
      paper: rgb(1, 0.99, 0.97),
      accent: rgb(0.95, 0.79, 0.41),
      motif: 'garden',
    }
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
      motif: 'night',
    }
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
    motif: 'adventure',
  }
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

function getPageText(spread: BookSpread, side: 'start' | 'end'): string {
  return side === 'start' ? spread.leftPageText : spread.rightPageText
}

function getPlaceholderVariant(seed: number): PlaceholderVariant {
  return (Math.abs(seed) % 3) as PlaceholderVariant
}

function drawPageBackground(page: ReturnType<PDFDocument['addPage']>, width: number, height: number, color = rgb(1, 0.99, 0.97)) {
  page.drawRectangle({ x: 0, y: 0, width, height, color })
}

function drawThemeArtPanel(input: {
  page: ReturnType<PDFDocument['addPage']>
  rect: { x: number; y: number; width: number; height: number }
  theme: PlaceholderTheme
  variant?: PlaceholderVariant
  title?: string
  subtitle?: string
}) {
  const { page, rect, theme, title, subtitle, variant = 0 } = input
  const moonX = variant === 0 ? 0.82 : variant === 1 ? 0.24 : 0.68
  const moonY = variant === 0 ? 0.84 : variant === 1 ? 0.76 : 0.88
  const ridgeOneX = variant === 0 ? 0.25 : variant === 1 ? 0.35 : 0.18
  const ridgeTwoX = variant === 0 ? 0.7 : variant === 1 ? 0.63 : 0.78
  const ridgeThreeX = variant === 0 ? 0.5 : variant === 1 ? 0.42 : 0.6
  page.drawRectangle({
    x: rect.x,
    y: rect.y,
    width: rect.width,
    height: rect.height,
    color: theme.sky,
  })
  page.drawRectangle({
    x: rect.x,
    y: rect.y + rect.height * 0.32,
    width: rect.width,
    height: rect.height * 0.68,
    color: theme.skyAccent,
    opacity: 0.35,
  })
  page.drawCircle({
    x: rect.x + rect.width * moonX,
    y: rect.y + rect.height * moonY,
    size: Math.min(rect.width, rect.height) * 0.1,
    color: theme.moon,
    opacity: 0.95,
  })
  page.drawEllipse({
    x: rect.x + rect.width * ridgeOneX,
    y: rect.y + rect.height * 0.12,
    xScale: rect.width * 0.34,
    yScale: rect.height * 0.1,
    color: theme.ground,
  })
  page.drawEllipse({
    x: rect.x + rect.width * ridgeTwoX,
    y: rect.y + rect.height * 0.08,
    xScale: rect.width * 0.38,
    yScale: rect.height * 0.12,
    color: theme.groundAccent,
  })
  page.drawEllipse({
    x: rect.x + rect.width * ridgeThreeX,
    y: rect.y + rect.height * 0.02,
    xScale: rect.width * 0.5,
    yScale: rect.height * 0.08,
    color: theme.groundAccent,
    opacity: 0.95,
  })

  if (theme.motif === 'ocean') {
    page.drawCircle({ x: rect.x + rect.width * 0.42, y: rect.y + rect.height * 0.2, size: rect.width * 0.022, color: theme.accent, opacity: 0.92 })
    page.drawCircle({ x: rect.x + rect.width * 0.5, y: rect.y + rect.height * 0.24, size: rect.width * 0.016, color: theme.paper, opacity: 0.78 })
    page.drawCircle({ x: rect.x + rect.width * 0.57, y: rect.y + rect.height * 0.19, size: rect.width * 0.024, color: theme.accent, opacity: 0.82 })
  } else if (theme.motif === 'garden') {
    page.drawCircle({ x: rect.x + rect.width * 0.48, y: rect.y + rect.height * 0.23, size: rect.width * 0.03, color: theme.accent, opacity: 0.92 })
    page.drawCircle({ x: rect.x + rect.width * 0.55, y: rect.y + rect.height * 0.23, size: rect.width * 0.03, color: theme.accent, opacity: 0.86 })
    page.drawCircle({ x: rect.x + rect.width * 0.515, y: rect.y + rect.height * 0.29, size: rect.width * 0.025, color: theme.paper, opacity: 0.82 })
  } else if (theme.motif === 'night') {
    page.drawCircle({ x: rect.x + rect.width * 0.46, y: rect.y + rect.height * 0.24, size: rect.width * 0.024, color: theme.accent, opacity: 0.92 })
    page.drawCircle({ x: rect.x + rect.width * 0.53, y: rect.y + rect.height * 0.28, size: rect.width * 0.016, color: theme.paper, opacity: 0.82 })
    page.drawCircle({ x: rect.x + rect.width * 0.58, y: rect.y + rect.height * 0.22, size: rect.width * 0.014, color: theme.accent, opacity: 0.82 })
  } else {
    page.drawCircle({ x: rect.x + rect.width * 0.46, y: rect.y + rect.height * 0.17, size: rect.width * 0.024, color: theme.accent, opacity: 0.92 })
    page.drawCircle({ x: rect.x + rect.width * 0.62, y: rect.y + rect.height * 0.26, size: rect.width * 0.014, color: theme.paper, opacity: 0.82 })
  }

  if (title) {
    page.drawText(clampText(title, 42), {
      x: rect.x + 28,
      y: rect.y + rect.height - 48,
      size: 22,
      color: theme.paper,
    })
  }

  if (subtitle) {
    page.drawText(clampText(subtitle, 48), {
      x: rect.x + 28,
      y: rect.y + rect.height - 76,
      size: 12,
      color: theme.paper,
    })
  }
}

async function drawSpreadArtIntoRect(input: {
  pdfDoc: PDFDocument
  page: ReturnType<PDFDocument['addPage']>
  spread: BookSpread
  side: 'start' | 'end' | 'cover'
  rect: { x: number; y: number; width: number; height: number }
  story: Story
  variantSeed?: number
  title?: string
  subtitle?: string
}) {
  const { pdfDoc, page, spread, side, rect, story, variantSeed = spread.sequence, title, subtitle } = input
  const image = await embedSpreadImage(pdfDoc, spread.imageUrl)

  if (image) {
    if (side === 'cover') {
      const scale = Math.max(rect.width / image.width, rect.height / image.height)
      const drawWidth = image.width * scale
      const drawHeight = image.height * scale
      page.pushOperators(
        pushGraphicsState(),
        rectangle(rect.x, rect.y, rect.width, rect.height),
        clip(),
        endPath(),
      )
      page.drawImage(image, {
        x: rect.x + (rect.width - drawWidth) / 2,
        y: rect.y + (rect.height - drawHeight) / 2,
        width: drawWidth,
        height: drawHeight,
      })
      page.pushOperators(popGraphicsState())
      return
    }

    const spreadWidth = rect.width * 2
    const scale = Math.min(spreadWidth / image.width, rect.height / image.height)
    const drawWidth = image.width * scale
    const drawHeight = image.height * scale
    const spreadX = rect.x + (spreadWidth - drawWidth) / 2
    const pageOffsetX = side === 'start' ? 0 : -rect.width
    page.pushOperators(
      pushGraphicsState(),
      rectangle(rect.x, rect.y, rect.width, rect.height),
      clip(),
      endPath(),
    )
    page.drawImage(image, {
      x: spreadX + pageOffsetX,
      y: rect.y + (rect.height - drawHeight) / 2,
      width: drawWidth,
      height: drawHeight,
    })
    page.pushOperators(popGraphicsState())
    return
  }

  drawThemeArtPanel({
    page,
    rect,
    theme: pickPlaceholderTheme(story),
    variant: getPlaceholderVariant(variantSeed + (side === 'end' ? 1 : side === 'cover' ? 2 : 0)),
    title,
    subtitle,
  })
}

function drawHalfTitlePage(input: {
  page: ReturnType<PDFDocument['addPage']>
  pageWidth: number
  pageHeight: number
  story: Story
  profile: ChildProfile
  theme: PlaceholderTheme
  serifBold: Awaited<ReturnType<PDFDocument['embedFont']>>
  serif: Awaited<ReturnType<PDFDocument['embedFont']>>
  sansBold: Awaited<ReturnType<PDFDocument['embedFont']>>
}) {
  const { page, pageWidth, pageHeight, story, profile, theme, serifBold, serif, sansBold } = input
  drawPageBackground(page, pageWidth, pageHeight, theme.paper)
  page.drawText('Storycot', {
    x: pageWidth * 0.12,
    y: pageHeight - 72,
    font: sansBold,
    size: 12,
    color: theme.skyAccent,
  })
  page.drawText(story.title, {
    x: pageWidth * 0.12,
    y: pageHeight * 0.62,
    font: serifBold,
    size: 24,
    color: theme.ink,
  })
  if (profile.name) {
    page.drawText(`For ${profile.name}`, {
      x: pageWidth * 0.12,
      y: pageHeight * 0.56,
      font: serif,
      size: 14,
      color: rgb(0.34, 0.35, 0.4),
    })
  }
  page.drawText('Personalised bedtime stories', {
    x: pageWidth * 0.12,
    y: pageHeight * 0.18,
    font: serif,
    size: 13,
    color: rgb(0.34, 0.35, 0.4),
  })
}

async function drawFrontispiecePage(input: {
  pdfDoc: PDFDocument
  page: ReturnType<PDFDocument['addPage']>
  spread: BookSpread
  story: Story
  pageWidth: number
  pageHeight: number
}) {
  const { pdfDoc, page, spread, story, pageWidth, pageHeight } = input
  const theme = pickPlaceholderTheme(story)
  drawPageBackground(page, pageWidth, pageHeight, theme.paper)
  const artRect = { x: 0, y: 0, width: pageWidth, height: pageHeight }
  await drawSpreadArtIntoRect({
    pdfDoc,
    page,
    spread,
    side: 'cover',
    rect: artRect,
    story,
    variantSeed: spread.sequence + 20,
  })
}

function drawTitlePage(input: {
  page: ReturnType<PDFDocument['addPage']>
  pageWidth: number
  pageHeight: number
  story: Story
  profile: ChildProfile
  theme: PlaceholderTheme
  serifBold: Awaited<ReturnType<PDFDocument['embedFont']>>
  serif: Awaited<ReturnType<PDFDocument['embedFont']>>
  sansBold: Awaited<ReturnType<PDFDocument['embedFont']>>
}) {
  const { page, pageWidth, pageHeight, story, profile, theme, serifBold, serif, sansBold } = input
  drawPageBackground(page, pageWidth, pageHeight, theme.paper)
  page.drawText('Storycot', {
    x: pageWidth * 0.12,
    y: pageHeight - 66,
    font: sansBold,
    size: 12,
    color: theme.skyAccent,
  })
  page.drawText(story.title, {
    x: pageWidth * 0.12,
    y: pageHeight * 0.6,
    font: serifBold,
    size: 28,
    color: theme.ink,
  })
  page.drawText(`Created for ${profile.name}`, {
    x: pageWidth * 0.12,
    y: pageHeight * 0.54,
    font: serif,
    size: 16,
    color: rgb(0.33, 0.34, 0.4),
  })
  page.drawText('Personalised bedtime stories made for home reading', {
    x: pageWidth * 0.12,
    y: pageHeight * 0.16,
    font: serif,
    size: 12,
    color: rgb(0.34, 0.35, 0.4),
  })
}

function drawCopyrightPage(input: {
  page: ReturnType<PDFDocument['addPage']>
  pageWidth: number
  pageHeight: number
  project: BookProject
  serifBold: Awaited<ReturnType<PDFDocument['embedFont']>>
  serif: Awaited<ReturnType<PDFDocument['embedFont']>>
  sans: Awaited<ReturnType<PDFDocument['embedFont']>>
  sansBold: Awaited<ReturnType<PDFDocument['embedFont']>>
}) {
  const { page, pageWidth, pageHeight, project, sans, sansBold } = input
  drawPageBackground(page, pageWidth, pageHeight)
  page.drawText(`Copyright © ${new Date(project.createdAt).getUTCFullYear()} Storycot`, {
    x: pageWidth * 0.12,
    y: pageHeight * 0.22,
    font: sansBold,
    size: 11,
    color: rgb(0.16, 0.17, 0.22),
  })
  page.drawText('ISBN pending', {
    x: pageWidth * 0.12,
    y: pageHeight * 0.18,
    font: sans,
    size: 10,
    color: rgb(0.42, 0.29, 0.21),
  })
  page.drawText(LULU_SQUARE_HARDCOVER_SPEC.trimLabel, {
    x: pageWidth * 0.12,
    y: pageHeight * 0.15,
    font: sans,
    size: 10,
    color: rgb(0.34, 0.35, 0.4),
  })
  page.drawText('storycot.com', {
    x: pageWidth * 0.12,
    y: pageHeight * 0.11,
    font: sansBold,
    size: 10,
    color: rgb(0.31, 0.36, 0.67),
  })
}

function drawClosingBrandPage(input: {
  page: ReturnType<PDFDocument['addPage']>
  pageWidth: number
  pageHeight: number
  theme: PlaceholderTheme
  sansBold: Awaited<ReturnType<PDFDocument['embedFont']>>
  serif: Awaited<ReturnType<PDFDocument['embedFont']>>
}) {
  const { page, pageWidth, pageHeight, theme, sansBold, serif } = input
  drawPageBackground(page, pageWidth, pageHeight, theme.paper)
  page.drawText('Storycot', {
    x: pageWidth * 0.12,
    y: pageHeight * 0.7,
    font: sansBold,
    size: 16,
    color: theme.skyAccent,
  })
  page.drawText('Sweet dreams.', {
    x: pageWidth * 0.12,
    y: pageHeight * 0.6,
    font: serif,
    size: 18,
    color: theme.ink,
  })
  page.drawText('Create your own personalised bedtime story at storycot.com', {
    x: pageWidth * 0.12,
    y: pageHeight * 0.2,
    font: serif,
    size: 12,
    color: rgb(0.34, 0.35, 0.4),
  })
}

async function drawBookPage(input: {
  pdfDoc: PDFDocument
  page: ReturnType<PDFDocument['addPage']>
  story: Story
  spread: BookSpread
  pageNumber: number
  side: 'start' | 'end'
  pageWidth: number
  pageHeight: number
  artRect: { x: number; y: number; width: number; height: number }
  textRect: { x: number; y: number; width: number; height: number }
  serif: Awaited<ReturnType<PDFDocument['embedFont']>>
  sans: Awaited<ReturnType<PDFDocument['embedFont']>>
}) {
  const { pdfDoc, page, story, spread, pageNumber, side, pageWidth, pageHeight, artRect, textRect, serif, sans } = input
  const theme = pickPlaceholderTheme(story)
  drawPageBackground(page, pageWidth, pageHeight, theme.paper)

  const text = getPageText(spread, side)

  await drawSpreadArtIntoRect({
    pdfDoc,
    page,
    spread,
    side,
    rect: artRect,
    story,
    variantSeed: spread.sequence * 2 + (side === 'end' ? 1 : 0),
  })

  if (text) {
    page.drawRectangle({
      x: textRect.x,
      y: textRect.y,
      width: textRect.width,
      height: textRect.height,
      color: rgb(1, 1, 1),
      opacity: 0.72,
    })
    drawWrappedText({
      page,
      text,
      x: textRect.x + 18,
      topY: textRect.y + textRect.height - 30,
      maxWidth: textRect.width - 36,
      lineHeight: 18,
      font: serif,
      size: 14,
      color: theme.ink,
    })
  }

  if (pageNumber > 4) {
    page.drawText(`${pageNumber}`, {
      x: pageWidth - 40,
      y: 20,
      font: sans,
      size: 10,
      color: rgb(0.45, 0.46, 0.52),
    })
  }

  page.drawText('Storycot', {
    x: 26,
    y: 20,
    font: sans,
    size: 9,
    color: rgb(0.45, 0.46, 0.52),
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
  const theme = pickPlaceholderTheme(input.story)

  for (const spread of input.project.spreads) {
    if (spread.title === 'Cover') {
      const halfTitlePage = pdfDoc.addPage([PRINT_PAGE_WIDTH, PRINT_PAGE_HEIGHT])
      drawHalfTitlePage({
        page: halfTitlePage,
        pageWidth: PRINT_PAGE_WIDTH,
        pageHeight: PRINT_PAGE_HEIGHT,
        story: input.story,
        profile: input.profile,
        theme,
        serifBold,
        serif,
        sansBold,
      })

      const frontispiecePage = pdfDoc.addPage([PRINT_PAGE_WIDTH, PRINT_PAGE_HEIGHT])
      await drawFrontispiecePage({
        pdfDoc,
        page: frontispiecePage,
        spread,
        story: input.story,
        pageWidth: PRINT_PAGE_WIDTH,
        pageHeight: PRINT_PAGE_HEIGHT,
      })
      continue
    }

    if (spread.title === 'Title') {
      const titlePage = pdfDoc.addPage([PRINT_PAGE_WIDTH, PRINT_PAGE_HEIGHT])
      drawTitlePage({
        page: titlePage,
        pageWidth: PRINT_PAGE_WIDTH,
        pageHeight: PRINT_PAGE_HEIGHT,
        story: input.story,
        profile: input.profile,
        theme,
        serifBold,
        serif,
        sansBold,
      })

      const copyrightPage = pdfDoc.addPage([PRINT_PAGE_WIDTH, PRINT_PAGE_HEIGHT])
      drawCopyrightPage({
        page: copyrightPage,
        pageWidth: PRINT_PAGE_WIDTH,
        pageHeight: PRINT_PAGE_HEIGHT,
        project: input.project,
        serifBold,
        serif,
        sans,
        sansBold,
      })
      continue
    }

    if (spread.title === 'Back Cover') {
      const closingBrandPage = pdfDoc.addPage([PRINT_PAGE_WIDTH, PRINT_PAGE_HEIGHT])
      drawClosingBrandPage({
        page: closingBrandPage,
        pageWidth: PRINT_PAGE_WIDTH,
        pageHeight: PRINT_PAGE_HEIGHT,
        theme,
        sansBold,
        serif,
      })

      const backMatterPage = pdfDoc.addPage([PRINT_PAGE_WIDTH, PRINT_PAGE_HEIGHT])
      await drawFrontispiecePage({
        pdfDoc,
        page: backMatterPage,
        spread,
        story: input.story,
        pageWidth: PRINT_PAGE_WIDTH,
        pageHeight: PRINT_PAGE_HEIGHT,
      })
      continue
    }

    const startPage = pdfDoc.addPage([PRINT_PAGE_WIDTH, PRINT_PAGE_HEIGHT])
    await drawBookPage({
      pdfDoc,
      page: startPage,
      story: input.story,
      spread,
      pageNumber: spread.pageStart,
      side: 'start',
      pageWidth: PRINT_PAGE_WIDTH,
      pageHeight: PRINT_PAGE_HEIGHT,
      artRect: {
        x: 0,
        y: 0,
        width: PRINT_PAGE_WIDTH,
        height: PRINT_PAGE_HEIGHT,
      },
      textRect: {
        x: FULL_BLEED_TEXT_SAFE_MARGIN,
        y: FULL_BLEED_TEXT_SAFE_MARGIN,
        width: PRINT_PAGE_WIDTH - FULL_BLEED_TEXT_SAFE_MARGIN * 2,
        height: 120,
      },
      serif,
      sans,
    })

    const endPage = pdfDoc.addPage([PRINT_PAGE_WIDTH, PRINT_PAGE_HEIGHT])
    await drawBookPage({
      pdfDoc,
      page: endPage,
      story: input.story,
      spread,
      pageNumber: spread.pageEnd,
      side: 'end',
      pageWidth: PRINT_PAGE_WIDTH,
      pageHeight: PRINT_PAGE_HEIGHT,
      artRect: {
        x: 0,
        y: 0,
        width: PRINT_PAGE_WIDTH,
        height: PRINT_PAGE_HEIGHT,
      },
      textRect: {
        x: FULL_BLEED_TEXT_SAFE_MARGIN,
        y: FULL_BLEED_TEXT_SAFE_MARGIN,
        width: PRINT_PAGE_WIDTH - FULL_BLEED_TEXT_SAFE_MARGIN * 2,
        height: 120,
      },
      serif,
      sans,
    })
  }

  return pdfDoc.save({ useObjectStreams: false })
}

async function buildCoverPdf(input: {
  project: BookProject
  story: Story
  profile: ChildProfile
}): Promise<Uint8Array> {
  const pdfDoc = await PDFDocument.create()
  const serif = await pdfDoc.embedFont(StandardFonts.TimesRoman)
  const serifBold = await pdfDoc.embedFont(StandardFonts.TimesRomanBold)
  const sans = await pdfDoc.embedFont(StandardFonts.Helvetica)
  const sansBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold)
  const theme = pickPlaceholderTheme(input.story)
  const spine = getLuluCoverSpineWidth(input.project.pageCount)
  const coverSpineWidth = spine.widthIn * POINTS_PER_INCH
  const coverTotalWidth = PRINT_PAGE_WIDTH * 2 + coverSpineWidth
  const page = pdfDoc.addPage([coverTotalWidth, PRINT_PAGE_HEIGHT])
  const coverSpread = input.project.spreads.find((spread) => spread.sequence === 1)
  const image = await embedSpreadImage(pdfDoc, input.project.assets.coverImageUrl || coverSpread?.imageUrl)
  const backCoverX = 0
  const spineX = PRINT_PAGE_WIDTH
  const frontCoverX = PRINT_PAGE_WIDTH + coverSpineWidth

  page.drawRectangle({
    x: 0,
    y: 0,
    width: coverTotalWidth,
    height: PRINT_PAGE_HEIGHT,
    color: theme.sky,
  })

  page.drawRectangle({
    x: backCoverX,
    y: 0,
    width: PRINT_PAGE_WIDTH,
    height: PRINT_PAGE_HEIGHT,
    color: theme.paper,
  })

  page.drawRectangle({
    x: spineX,
    y: 0,
    width: coverSpineWidth,
    height: PRINT_PAGE_HEIGHT,
    color: theme.groundAccent,
  })

  if (image) {
    const scale = Math.max(PRINT_PAGE_WIDTH / image.width, PRINT_PAGE_HEIGHT / image.height)
    const drawWidth = image.width * scale
    const drawHeight = image.height * scale
    page.drawImage(image, {
      x: frontCoverX + (PRINT_PAGE_WIDTH - drawWidth) / 2,
      y: (PRINT_PAGE_HEIGHT - drawHeight) / 2,
      width: drawWidth,
      height: drawHeight,
    })
  } else {
    drawThemeArtPanel({
      page,
      rect: {
        x: frontCoverX,
        y: 0,
        width: PRINT_PAGE_WIDTH,
        height: PRINT_PAGE_HEIGHT,
      },
      theme,
      variant: 1,
    })
  }

  page.drawRectangle({
    x: frontCoverX + BLEED + 28,
    y: PRINT_PAGE_HEIGHT - 190,
    width: PRINT_PAGE_WIDTH - (BLEED + 28) * 2,
    height: 116,
    color: rgb(0.08, 0.09, 0.15),
    opacity: image ? 0.34 : 0.16,
  })
  page.drawText(input.story.title, {
    x: frontCoverX + BLEED + 42,
    y: PRINT_PAGE_HEIGHT - 120,
    font: serifBold,
    size: 28,
    color: rgb(0.99, 0.96, 0.88),
  })
  page.drawText(`Created for ${input.profile.name}`, {
    x: frontCoverX + BLEED + 42,
    y: PRINT_PAGE_HEIGHT - 156,
    font: serif,
    size: 16,
    color: rgb(0.97, 0.92, 0.82),
  })

  page.drawText('A personalised story from Storycot', {
    x: backCoverX + BLEED + 42,
    y: PRINT_PAGE_HEIGHT - 116,
    font: sansBold,
    size: 13,
    color: theme.ink,
  })
  drawWrappedText({
    page,
    text: clampText(input.story.pages.map((storyPage) => storyPage.text).join(' '), 360),
    x: backCoverX + BLEED + 42,
    topY: PRINT_PAGE_HEIGHT - 148,
    maxWidth: PRINT_PAGE_WIDTH * 0.56,
    lineHeight: 18,
    font: serif,
    size: 12,
    color: rgb(0.24, 0.26, 0.32),
  })

  page.drawRectangle({
    x: backCoverX + BLEED + 42,
    y: 56,
    width: PRINT_PAGE_WIDTH - (BLEED + 42) * 2,
    height: 110,
    color: rgb(1, 1, 1),
    opacity: 0.74,
  })
  page.drawText('Personalised for bedtime reading', {
    x: backCoverX + BLEED + 58,
    y: 138,
    font: sansBold,
    size: 11,
    color: theme.skyAccent,
  })
  page.drawText(LULU_SQUARE_HARDCOVER_SPEC.trimLabel, {
    x: backCoverX + BLEED + 58,
    y: 118,
    font: sans,
    size: 10,
    color: rgb(0.34, 0.35, 0.4),
  })
  page.drawText('Create your own at storycot.com', {
    x: backCoverX + BLEED + 58,
    y: 96,
    font: sansBold,
    size: 10,
    color: theme.skyAccent,
  })
  page.drawText('ISBN pending', {
    x: backCoverX + PRINT_PAGE_WIDTH - BLEED - 92,
    y: BLEED + 48,
    font: sans,
    size: 10,
    color: rgb(0.46, 0.32, 0.22),
  })

  if (input.project.pageCount >= LULU_SQUARE_HARDCOVER_SPEC.spineTextMinPageCount) {
    page.drawText('Storycot', {
      x: spineX + coverSpineWidth / 2 - 20,
      y: PRINT_PAGE_HEIGHT / 2 - 18,
      font: sansBold,
      size: 10,
      color: rgb(0.95, 0.93, 0.87),
      rotate: degrees(90),
    })

    page.drawText(clampText(input.story.title, 36), {
      x: spineX + coverSpineWidth / 2 - 10,
      y: PRINT_PAGE_HEIGHT / 2 - 72,
      font: sansBold,
      size: 9,
      color: rgb(0.95, 0.93, 0.87),
      rotate: degrees(90),
    })
  }

  return pdfDoc.save({ useObjectStreams: false })
}

export async function generateBookPdfs(input: {
  project: BookProject
  story: Story
  profile: ChildProfile
}): Promise<{
  coverPdfUrl: string
  coverPdfReadyForOrdering: boolean
  coverPdfSpineWidthIn: number
  coverPdfSpineSource: 'configured' | 'lulu_table'
  coverPdfPageWidthIn: number
  coverPdfPageHeightIn: number
  coverSpineTextIncluded: boolean
  printPdfUrl: string
  printPdfPageWidthIn: number
  printPdfPageHeightIn: number
  interiorTextSafeMarginIn: number
  previewImages: string[]
}> {
  const coverSpine = getLuluCoverSpineWidth(input.project.pageCount)
  const coverBytes = await buildCoverPdf(input)
  const printBytes = await buildPrintPdf(input)

  const coverPdfUrl = await storeBookAsset({
    pathname: `books/${input.project.id}/cover.pdf`,
    body: Buffer.from(coverBytes),
    contentType: 'application/pdf',
  })
  const printPdfUrl = await storeBookAsset({
    pathname: `books/${input.project.id}/print.pdf`,
    body: Buffer.from(printBytes),
    contentType: 'application/pdf',
  })

  return {
    coverPdfUrl,
    coverPdfReadyForOrdering: true,
    coverPdfSpineWidthIn: coverSpine.widthIn,
    coverPdfSpineSource: coverSpine.source,
    coverPdfPageWidthIn: Number(((LULU_SQUARE_HARDCOVER_SPEC.trimWidthIn + LULU_SQUARE_HARDCOVER_SPEC.bleedIn * 2) * 2 + coverSpine.widthIn).toFixed(3)),
    coverPdfPageHeightIn: Number((LULU_SQUARE_HARDCOVER_SPEC.trimHeightIn + LULU_SQUARE_HARDCOVER_SPEC.bleedIn * 2).toFixed(3)),
    coverSpineTextIncluded: input.project.pageCount >= LULU_SQUARE_HARDCOVER_SPEC.spineTextMinPageCount,
    printPdfUrl,
    printPdfPageWidthIn: Number((LULU_SQUARE_HARDCOVER_SPEC.trimWidthIn + LULU_SQUARE_HARDCOVER_SPEC.bleedIn * 2).toFixed(3)),
    printPdfPageHeightIn: Number((LULU_SQUARE_HARDCOVER_SPEC.trimHeightIn + LULU_SQUARE_HARDCOVER_SPEC.bleedIn * 2).toFixed(3)),
    interiorTextSafeMarginIn: LULU_SQUARE_HARDCOVER_SPEC.fullBleedTextSafeMarginIn,
    previewImages: input.project.spreads
      .map((spread) => spread.imageUrl)
      .filter((url): url is string => typeof url === 'string' && url.length > 0),
  }
}
